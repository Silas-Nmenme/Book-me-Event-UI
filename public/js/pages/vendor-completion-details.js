import { apiFetch, fetchMe, clearToken } from '../api.js';

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '—';
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function humanize(value) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addAttachment(parent, asset, isVideo = false) {
  const figure = document.createElement('figure');
  figure.className = 'mb-0';
  if (isVideo) {
    const video = document.createElement('video');
    video.src = asset.url;
    video.controls = true;
    video.preload = 'metadata';
    figure.append(video);
  } else {
    const image = document.createElement('img');
    image.src = asset.url;
    image.alt = asset.caption || asset.originalName || 'Completion report evidence';
    image.loading = 'lazy';
    figure.append(image);
  }
  if (asset.caption) {
    const caption = document.createElement('figcaption');
    caption.className = 'small text-muted-soft mt-1';
    caption.textContent = asset.caption;
    figure.append(caption);
  }
  parent.append(figure);
}

export async function initVendorCompletionDetails() {
  const error = document.getElementById('completionError');
  const loading = document.getElementById('completionLoading');
  try {
    const userResponse = await fetchMe();
    const user = userResponse?.data || userResponse;
    if (user?.role !== 'VENDOR') throw new Error('Vendor access is required.');
    const reportId = new URLSearchParams(window.location.search).get('reportId');
    if (!reportId) throw new Error('Report was not specified.');
    const response = await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(reportId)}`);
    const report = response?.data || response;
    const booking = report.booking || {};
    const request = report.request || {};
    const client = report.user || {};
    const service = report.service || {};
    document.title = `${report.reportId || 'Completion report'} - Book Me Events`;
    setText('reportId', report.reportId);
    setText('reportStatus', humanize(report.status));
    setText('requestRef', request._id || report.request);
    setText('bookingRef', booking._id || report.booking);
    setText('clientName', `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.email);
    setText('serviceName', service.serviceName || service.name);
    setText('completionDate', dateLabel(report.completionDate));
    setText('submittedAt', dateLabel(report.submittedAt));
    setText('satisfactionStatus', humanize(report.satisfactionStatus));
    setText('payoutStatus', humanize(report.payoutStatus));
    setText('summary', report.serviceSummary);
    setText('notes', report.additionalNotes || 'None');
    const images = document.getElementById('reportImages');
    images.replaceChildren();
    for (const asset of report.images || []) addAttachment(images, asset);
    const videos = report.videos || [];
    document.getElementById('videosPanel').classList.toggle('d-none', !videos.length);
    const videoList = document.getElementById('reportVideos');
    videoList.replaceChildren();
    for (const asset of videos) addAttachment(videoList, asset, true);
    const feedback = report.clientFeedback;
    document.getElementById('clientFeedbackPanel').classList.toggle('d-none', !feedback?.explanation);
    if (feedback?.explanation) {
      setText('feedbackReason', humanize(feedback.reason));
      setText('feedbackExplanation', feedback.explanation);
      const attachments = document.getElementById('feedbackFiles');
      for (const item of feedback.evidence || []) {
        const link = document.createElement('a');
        link.className = 'btn btn-soft btn-sm';
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.originalName || 'Client evidence';
        attachments.append(link);
      }
    }
    const responses = report.additionalResponses || [];
    const responseHost = document.getElementById('vendorResponseHistory');
    responseHost.replaceChildren();
    document.getElementById('vendorResponseHistorySection').classList.toggle('d-none', responses.length === 0);
    for (const response of responses) {
      const entry = document.createElement('article');
      entry.className = 'border-bottom pb-2';
      const author = response.author || {};
      const name = [author.firstName, author.lastName].filter(Boolean).join(' ') || humanize(response.authorRole);
      const line = document.createElement('div');
      line.className = 'small fw-semibold';
      line.textContent = `${name} · ${dateLabel(response.createdAt)}`;
      const body = document.createElement('p');
      body.className = 'mb-0 mt-1';
      body.textContent = response.message || '';
      entry.append(line, body);
      responseHost.append(entry);
    }
    const clarificationPanel = document.getElementById('vendorClarificationPanel');
    clarificationPanel.classList.toggle('d-none', !(report.adminReviewStatus === 'MORE_INFO_REQUESTED' && report.infoRequestedFrom === 'VENDOR'));
    document.getElementById('vendorClarificationForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('sendVendorClarification');
      button.disabled = true;
      try {
        await apiFetch(`/api/v1/completion-reports/${encodeURIComponent(report._id)}/vendor-response`, {
          method: 'POST',
          body: { message: document.getElementById('vendorClarificationText').value.trim() },
        });
        window.location.reload();
      } catch (error) {
        document.getElementById('vendorClarificationError').textContent = error?.message || 'Could not send additional information.';
      } finally {
        button.disabled = false;
      }
    });
    loading.classList.add('d-none');
    document.getElementById('completionDetails').classList.remove('d-none');
  } catch (loadError) {
    if (loadError?.status === 401 || loadError?.status === 403) {
      clearToken();
      window.location.replace('auth-login.html');
      return;
    }
    loading.classList.add('d-none');
    error.textContent = loadError?.message || 'Could not load completion report.';
    error.classList.remove('d-none');
  }
}
