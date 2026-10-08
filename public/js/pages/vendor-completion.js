import { apiFetch, fetchMe, getToken, clearToken } from '../api.js';
import { BACKEND_URL } from '../../constant.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
let MINIMUM_IMAGES = 5;
let IMAGE_LIMIT = 20;
let VIDEO_LIMIT = 5;
let IMAGE_SIZE_LIMIT = 8 * 1024 * 1024;
let VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;
const bookingId = new URLSearchParams(window.location.search).get('bookingId');

function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '—';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readOnlyValues(report) {
  const booking = report.booking || {};
  const request = report.request || booking.request || {};
  const service = report.service || booking.service || {};
  const user = report.user || booking.user || {};
  const vendor = report.vendor || booking.vendor || {};
  text('bookingReference', booking._id);
  text('requestReference', request._id || report.request);
  text('clientName', `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email);
  text('vendorName', vendor.businessName || booking.vendor?.businessName);
  text('serviceName', service.serviceName || service.name);
  text('serviceCategory', service.serviceCategory);
  text('eventDate', formatDate(booking.eventDate || request.eventDate));
  text('eventLocation', booking.eventLocation || request.eventLocation);
  const currency = booking.amountCurrency || 'NGN';
  text('agreedAmount', booking.totalAmount == null ? '—' : `${currency} ${Number(booking.totalAmount).toLocaleString()}`);
  text('originalDescription', request.eventDescription || '—');
  text('acceptedRequirements', [request.notes, booking.specialRequests].filter(Boolean).join('\n') || 'No additional requirements recorded');
  const completionDate = document.getElementById('completionDate');
  const scheduled = dateInputValue(booking.eventDate || request.eventDate);
  if (scheduled) completionDate.min = scheduled;
  completionDate.max = dateInputValue(new Date());
  completionDate.value = dateInputValue(new Date());
}

function xhrUpload({ reportId, file, caption, onProgress }) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const request = new XMLHttpRequest();
    request.open('POST', `${BACKEND_URL}/api/v1/completion-reports/${encodeURIComponent(reportId)}/media`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.responseType = 'json';
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('Network error while uploading media'));
    request.ontimeout = () => reject(new Error('Media upload timed out'));
    request.timeout = 180000;
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(request.response);
      else reject(new Error(request.response?.message || `Upload failed (${request.status})`));
    };
    const form = new FormData();
    form.append('media', file);
    if (caption) form.append('caption', caption);
    request.send(form);
  });
}

export async function initVendorCompletion() {
  const error = document.getElementById('completionError');
  const loading = document.getElementById('completionLoading');
  const content = document.getElementById('completionContent');
  const success = document.getElementById('completionSuccess');
  const imageQueue = [];
  const videoQueue = [];
  let reportId;

  function updateCounts() {
    const imageCount = imageQueue.filter((item) => item.asset).length;
    const videoCount = videoQueue.filter((item) => item.asset).length;
    text('imageCount', `${imageCount} uploaded`);
    text('videoCount', `${videoCount} uploaded`);
    const button = document.getElementById('submitCompletion');
    const ready = imageCount >= MINIMUM_IMAGES && !imageQueue.some((item) => item.uploading) && !videoQueue.some((item) => item.uploading);
    button.disabled = !ready;
    document.getElementById('submissionRequirements').textContent = ready
      ? `${imageCount} verified pictures uploaded${videoCount ? ` and ${videoCount} videos` : ''}. You can submit your report.`
      : `Upload at least ${MINIMUM_IMAGES} pictures successfully${imageCount ? ` (${imageCount} complete)` : ''} before submitting.`;
    document.getElementById('submissionRequirements').classList.toggle('alert-info', !ready);
    document.getElementById('submissionRequirements').classList.toggle('alert-success', ready);
  }

  function renderMediaCard(item, kind) {
    const container = kind === 'image' ? imageQueue : videoQueue;
    const target = kind === 'image' ? imageQueueElement : videoQueueElement;
    const card = document.createElement('article');
    card.className = 'card card-glass p-2 completion-media-card';
    const preview = kind === 'image' ? document.createElement('img') : document.createElement('video');
    preview.className = kind === 'image' ? 'completion-preview' : 'completion-video-preview';
    if (kind === 'image') {
      preview.alt = item.file.name;
      preview.src = item.asset?.url || item.localUrl;
    } else {
      preview.controls = true;
      preview.src = item.localUrl;
    }
    card.append(preview);
    const name = document.createElement('div');
    name.className = 'small fw-semibold text-truncate mt-2';
    name.textContent = item.asset?.originalName || item.file.name;
    card.append(name);
    if (kind === 'image') {
      const caption = document.createElement('input');
      caption.className = 'form-control form-control-sm mt-2';
      caption.placeholder = 'Optional caption';
      caption.maxLength = 300;
      caption.value = item.caption || '';
      caption.disabled = !!item.asset;
      caption.addEventListener('input', () => { item.caption = caption.value; });
      card.append(caption);
      item.captionControl = caption;
    }
    const progress = document.createElement('div');
    progress.className = 'progress upload-progress mt-2';
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = item.asset ? '100%' : '0%';
    progress.append(bar);
    card.append(progress);
    const status = document.createElement('div');
    status.className = 'small text-muted-soft mt-1';
    status.textContent = item.asset ? 'Uploaded privately to Cloudinary' : item.error || 'Ready to upload';
    card.append(status);
    const controls = document.createElement('div');
    controls.className = 'd-flex gap-2 mt-2';
    const uploadButton = document.createElement('button');
    uploadButton.type = 'button';
    uploadButton.className = 'btn btn-brand btn-sm';
    uploadButton.textContent = item.asset ? 'Uploaded' : item.uploading ? 'Uploading...' : 'Upload';
    uploadButton.disabled = !!item.asset || item.uploading;
    uploadButton.addEventListener('click', async () => {
      item.uploading = true;
      item.error = '';
      uploadButton.disabled = true;
      uploadButton.textContent = 'Uploading...';
      status.textContent = 'Uploading 0%';
      updateCounts();
      try {
        const response = await xhrUpload({
          reportId,
          file: item.file,
          caption: item.caption,
          onProgress: (percent) => {
            bar.style.width = `${percent}%`;
            status.textContent = `Uploading ${percent}%`;
          },
        });
        item.asset = response?.data;
        preview.src = item.asset?.url || item.localUrl;
        name.textContent = item.asset?.originalName || item.file.name;
        status.textContent = 'Uploaded privately to Cloudinary';
        bar.style.width = '100%';
        uploadButton.textContent = 'Uploaded';
        if (item.captionControl) item.captionControl.disabled = true;
      } catch (uploadError) {
        item.error = uploadError?.message || 'Upload failed';
        status.textContent = item.error;
        status.classList.add('text-danger');
        uploadButton.disabled = false;
        uploadButton.textContent = 'Retry upload';
      } finally {
        item.uploading = false;
        updateCounts();
      }
    });
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn-soft btn-sm';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      removeButton.disabled = true;
      try {
        if (item.asset?._id) {
          await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}/media/${encodeURIComponent(item.asset._id)}`, { method: 'DELETE' });
        }
        const index = container.indexOf(item);
        if (index >= 0) container.splice(index, 1);
        URL.revokeObjectURL(item.localUrl);
        card.remove();
        updateCounts();
      } catch (removeError) {
        removeButton.disabled = false;
        status.textContent = removeError?.message || 'Could not remove this upload';
      }
    });
    controls.append(uploadButton, removeButton);
    card.append(controls);
    item.element = card;
    target.append(card);
  }

  const imageQueueElement = document.getElementById('imageQueue');
  const videoQueueElement = document.getElementById('videoQueue');

  function addFiles(input, kind) {
    const files = Array.from(input.files || []);
    input.value = '';
    const queue = kind === 'image' ? imageQueue : videoQueue;
    const totalMax = kind === 'image' ? IMAGE_LIMIT : VIDEO_LIMIT;
    const allowed = kind === 'image' ? IMAGE_TYPES : VIDEO_TYPES;
    const maxBytes = kind === 'image' ? IMAGE_SIZE_LIMIT : VIDEO_SIZE_LIMIT;
    const currentCount = queue.length;
    if (currentCount + files.length > totalMax) {
      error.textContent = `You may upload up to ${totalMax} ${kind === 'image' ? 'pictures' : 'videos'}.`;
      error.classList.remove('d-none');
      return;
    }
    for (const file of files) {
      if (!allowed.has(file.type) || file.size > maxBytes) {
        error.textContent = `${file.name} has an unsupported type or exceeds the ${kind === 'image' ? '8 MB' : '50 MB'} limit.`;
        error.classList.remove('d-none');
        continue;
      }
      error.classList.add('d-none');
      const item = { file, localUrl: URL.createObjectURL(file), asset: null, caption: '', uploading: false };
      queue.push(item);
      renderMediaCard(item, kind);
    }
    updateCounts();
  }

  document.getElementById('completionImages').addEventListener('change', (event) => addFiles(event.currentTarget, 'image'));
  document.getElementById('completionVideos').addEventListener('change', (event) => addFiles(event.currentTarget, 'video'));

  document.getElementById('refreshCompletion').addEventListener('click', () => window.location.reload());

  try {
    const userResponse = await fetchMe();
    const user = userResponse?.data || userResponse;
    if (user?.role !== 'VENDOR') throw new Error('Vendor access is required.');
    if (!bookingId) throw new Error('Booking was not specified.');
    const response = await apiFetch(`/api/v1/completion-reports/bookings/${encodeURIComponent(bookingId)}/draft`, { method: 'POST' });
    const report = response?.data || {};
    if (response?.existing && report.status !== 'DRAFT') {
      window.location.replace(`vendor-service-completion-details.html?reportId=${encodeURIComponent(report._id)}`);
      return;
    }
    reportId = report._id;
    readOnlyValues(report);
    loading.classList.add('d-none');
    content.classList.remove('d-none');

    const existingImages = report.images || [];
    for (const asset of existingImages) {
      const item = { file: new File([], asset.originalName || 'uploaded image', { type: asset.mimeType }), localUrl: asset.url, asset, caption: asset.caption || '', uploading: false };
      imageQueue.push(item);
      renderMediaCard(item, 'image');
    }
    const existingVideos = report.videos || [];
    for (const asset of existingVideos) {
      const item = { file: new File([], asset.originalName || 'uploaded video', { type: asset.mimeType }), localUrl: asset.url, asset, caption: asset.caption || '', uploading: false };
      videoQueue.push(item);
      renderMediaCard(item, 'video');
    }
    updateCounts();

    document.getElementById('completionForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      error.classList.add('d-none');
      if (!event.currentTarget.reportValidity()) return;
      if (imageQueue.filter((item) => item.asset).length < MINIMUM_IMAGES) {
        error.textContent = `Upload at least ${MINIMUM_IMAGES} pictures successfully before submitting.`;
        error.classList.remove('d-none');
        return;
      }
      if (imageQueue.some((item) => item.uploading) || videoQueue.some((item) => item.uploading)) {
        error.textContent = 'Wait for all media uploads to finish before submitting.';
        error.classList.remove('d-none');
        return;
      }
      const submitButton = document.getElementById('submitCompletion');
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting report...';
      try {
        const result = await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}/submit`, {
          method: 'POST',
          body: {
            serviceSummary: document.getElementById('serviceSummary').value,
            completionDate: document.getElementById('completionDate').value,
            additionalNotes: document.getElementById('additionalNotes').value,
          },
        });
        success.textContent = result?.message || 'Report submitted for review.';
        success.classList.remove('d-none');
        window.location.replace(`vendor-service-completion-details.html?reportId=${encodeURIComponent(result?.data?.reportId ? reportId : reportId)}`);
      } catch (submitError) {
        error.textContent = submitError?.message || 'Could not submit the completion report.';
        error.classList.remove('d-none');
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Completion Report';
      }
    });
  } catch (loadError) {
    if (loadError?.status === 401 || loadError?.status === 403) {
      clearToken();
      window.location.replace('auth-login.html');
      return;
    }
    error.textContent = loadError?.message || 'Could not load this booking.';
    error.classList.remove('d-none');
    loading.classList.add('d-none');
  }
}
