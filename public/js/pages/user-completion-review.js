import { apiFetch, fetchMe, clearToken } from '../api.js';

const reportId = new URLSearchParams(window.location.search).get('reportId');
const allowedEvidenceTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);

function getElement(id) {
  return document.getElementById(id);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function humanize(value) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function appendLink(parent, label, url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'btn btn-soft btn-sm';
  link.textContent = label;
  parent.append(link);
}

function showImage(asset) {
  const dialog = getElement('imageDialog');
  const image = getElement('dialogImage');
  image.src = asset.url;
  image.alt = asset.caption || asset.originalName || 'Service evidence';
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else window.open(asset.url, '_blank', 'noopener');
}

function renderReport(report) {
  const booking = report.booking || {};
  const request = report.request || booking.request || {};
  const service = report.service || booking.service || {};
  const vendor = report.vendor || booking.vendor || {};
  const vendorId = vendor._id || report.vendor;
  getElement('requestReference').textContent = request._id || report.request || '—';
  const serviceName = service.serviceName || service.name || 'Service';
  getElement('serviceName').textContent = serviceName;
  const vendorName = vendor.businessName || 'Vendor';
  const vendorLink = document.createElement('a');
  vendorLink.href = `vendor-profile.html?id=${encodeURIComponent(vendorId || '')}`;
  vendorLink.textContent = vendorName;
  vendorLink.className = 'link-body-emphasis';
  vendorLink.rel = 'noopener noreferrer';
  getElement('vendorName').replaceChildren(vendorLink);
  getElement('eventDate').textContent = formatDate(booking.eventDate || request.eventDate);
  getElement('serviceSummary').textContent = report.serviceSummary || '';
  getElement('additionalNotes').textContent = report.additionalNotes || 'None provided';
  getElement('completionDate').textContent = formatDate(report.completionDate);
  getElement('submittedAt').textContent = formatDate(report.submittedAt);
  getElement('reviewStatus').textContent = `${humanize(report.adminReviewStatus)} · Payout ${humanize(report.payoutStatus)}`;
  getElement('satisfactionStatus').textContent = humanize(report.satisfactionStatus);

  const imageGallery = getElement('imageGallery');
  imageGallery.replaceChildren();
  for (const asset of report.images || []) {
    const item = document.createElement('figure');
    item.className = 'mb-0';
    const button = document.createElement('button');
    button.type = 'button';
    const image = document.createElement('img');
    image.src = asset.url;
    image.alt = asset.caption || asset.originalName || 'Service evidence';
    image.loading = 'lazy';
    button.append(image);
    button.addEventListener('click', () => showImage(asset));
    item.append(button);
    if (asset.caption) {
      const caption = document.createElement('figcaption');
      caption.className = 'small text-muted-soft mt-1';
      caption.textContent = asset.caption;
      item.append(caption);
    }
    imageGallery.append(item);
  }

  const videos = report.videos || [];
  const videoSection = getElement('videoSection');
  const videoGallery = getElement('videoGallery');
  videoGallery.replaceChildren();
  videoSection.classList.toggle('d-none', videos.length === 0);
  for (const asset of videos) {
    const column = document.createElement('div');
    column.className = 'col-12 col-md-6';
    const video = document.createElement('video');
    video.className = 'completion-video';
    video.controls = true;
    video.preload = 'metadata';
    video.src = asset.url;
    video.setAttribute('aria-label', asset.caption || asset.originalName || 'Service delivery video');
    column.append(video);
    if (asset.caption) {
      const caption = document.createElement('div');
      caption.className = 'small text-muted-soft mt-1';
      caption.textContent = asset.caption;
      column.append(caption);
    }
    videoGallery.append(column);
  }

  const feedback = report.clientFeedback;
  const feedbackDetails = getElement('feedbackDetails');
  feedbackDetails.classList.toggle('d-none', !feedback?.explanation);
  if (feedback?.explanation) {
    getElement('feedbackReason').textContent = humanize(feedback.reason);
    getElement('feedbackExplanation').textContent = feedback.explanation;
    getElement('feedbackFlags').textContent = `Differed from agreement: ${feedback.differedFromAgreement ? 'Yes' : 'No'} · Missing deliverables: ${feedback.missingDeliverables ? 'Yes' : 'No'}`;
    for (const asset of feedback.evidence || []) appendLink(feedbackDetails, asset.originalName || 'Client evidence', asset.url);
  }

  const responses = report.additionalResponses || [];
  getElement('additionalResponsesSection').classList.toggle('d-none', responses.length === 0);
  const responseList = getElement('additionalResponses');
  responseList.replaceChildren();
  for (const response of responses) {
    const item = document.createElement('article');
    item.className = 'border-bottom pb-2';
    const author = response.author || {};
    const authorName = [author.firstName, author.lastName].filter(Boolean).join(' ') || humanize(response.authorRole);
    const heading = document.createElement('div');
    heading.className = 'small fw-semibold';
    heading.textContent = `${authorName} · ${formatDate(response.createdAt)}`;
    const body = document.createElement('p');
    body.className = 'mb-0 mt-1';
    body.textContent = response.message || '';
    item.append(heading, body);
    responseList.append(item);
  }
  const clarificationPanel = getElement('clarificationPanel');
  clarificationPanel.classList.toggle('d-none', !(report.adminReviewStatus === 'MORE_INFO_REQUESTED' && report.infoRequestedFrom === 'USER'));

  const canRespond = report.status === 'SUBMITTED' && report.satisfactionStatus === 'PENDING';
  getElement('satisfactionPanel').classList.toggle('d-none', !canRespond);
  getElement('reportContent').classList.remove('d-none');
}

export async function initUserCompletionReview() {
  const error = getElement('reportError');
  const message = getElement('reportMessage');
  const loading = getElement('reportLoading');
  const form = getElement('dissatisfactionForm');
  try {
    const userResponse = await fetchMe();
    const user = userResponse?.data || userResponse;
    if (user?.role !== 'USER') throw new Error('User access is required.');
    if (!reportId) throw new Error('Completion report was not specified.');
    const response = await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}`);
    const report = response?.data || response;
    renderReport(report);
    loading.classList.add('d-none');
    if (report.satisfactionStatus !== 'PENDING' && report.satisfactionStatus) {
      message.textContent = `Your response is ${humanize(report.satisfactionStatus)}. The admin review and payout decision remain separate.`;
      message.classList.remove('d-none');
    }
  } catch (loadError) {
    if (loadError?.status === 401 || loadError?.status === 403) {
      clearToken();
      window.location.replace('auth-login.html');
      return;
    }
    loading.classList.add('d-none');
    error.textContent = loadError?.message || 'Could not load this completion report.';
    error.classList.remove('d-none');
    return;
  }

  getElement('closeImageDialog').addEventListener('click', () => getElement('imageDialog').close());
  getElement('imageDialog').addEventListener('click', (event) => {
    if (event.target === getElement('imageDialog')) getElement('imageDialog').close();
  });
  getElement('satisfiedButton').addEventListener('click', async () => {
    if (!window.confirm('Record that you are satisfied with this service? This response is final unless an admin changes it through an audited review.')) return;
    try {
      await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}/satisfaction`, {
        method: 'POST',
        body: { decision: 'SATISFIED' },
      });
      message.textContent = 'Your satisfaction has been recorded and forwarded for administrative review. Vendor payout is still subject to admin approval and payment verification.';
      message.classList.remove('d-none');
      form.classList.add('d-none');
      getElement('satisfactionPanel').classList.add('d-none');
      getElement('satisfactionStatus').textContent = 'Satisfied';
    } catch (submitError) {
      error.textContent = submitError?.message || 'Could not record your response.';
      error.classList.remove('d-none');
    }
  });
  getElement('notSatisfiedButton').addEventListener('click', () => form.classList.remove('d-none'));
  getElement('cancelDissatisfaction').addEventListener('click', () => form.classList.add('d-none'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = getElement('feedbackEvidence');
    const files = Array.from(input.files || []);
    if (files.length > 4 || files.some((file) => !allowedEvidenceTypes.has(file.type) || file.size > 5 * 1024 * 1024)) {
      getElement('dissatisfactionError').textContent = 'Choose up to four PNG, JPEG, WebP, GIF, or PDF files, 5 MB maximum each.';
      return;
    }
    const body = new FormData();
    body.append('decision', 'NOT_SATISFIED');
    body.append('reason', getElement('feedbackReasonInput').value);
    body.append('explanation', getElement('feedbackExplanation').value.trim());
    body.append('differedFromAgreement', String(getElement('differedFromAgreement').checked));
    body.append('missingDeliverables', String(getElement('missingDeliverables').checked));
    files.forEach((file) => body.append('evidence', file));
    const button = getElement('submitDissatisfaction');
    button.disabled = true;
    try {
      await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}/satisfaction`, { method: 'POST', body });
      message.textContent = 'Your concern has been submitted for review. The vendor payout remains on hold while the admin investigates.';
      message.classList.remove('d-none');
      form.classList.add('d-none');
      getElement('satisfactionPanel').classList.add('d-none');
      getElement('satisfactionStatus').textContent = 'Not satisfied';
    } catch (submitError) {
      getElement('dissatisfactionError').textContent = submitError?.message || 'Could not submit your feedback.';
    } finally {
      button.disabled = false;
    }
  });
  getElement('clarificationForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = getElement('submitClarification');
    const clarificationError = getElement('clarificationError');
    button.disabled = true;
    try {
      await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}/client-response`, {
        method: 'POST',
        body: { message: getElement('clarificationText').value.trim() },
      });
      message.textContent = 'Your clarification has been added to the report and sent to admin review.';
      message.classList.remove('d-none');
      clarificationPanel.classList.add('d-none');
    } catch (clarificationSubmitError) {
      clarificationError.textContent = clarificationSubmitError?.message || 'Could not submit clarification.';
    } finally {
      button.disabled = false;
    }
  });
}
