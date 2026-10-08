import { apiFetch, fetchMe, clearToken } from '../api.js';

const reportId = new URLSearchParams(window.location.search).get('reportId');

function get(id) { return document.getElementById(id); }
function text(id, value) { get(id).textContent = value || '—'; }
function date(value) { if (!value) return '—'; const result = new Date(value); return Number.isNaN(result.getTime()) ? '—' : result.toLocaleString(); }
function humanize(value) { return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function node(parent, tag, className, value) { const item = document.createElement(tag); item.className = className || ''; item.textContent = value || ''; parent.append(item); return item; }

function renderEvidence(parent, assets, type) {
  parent.replaceChildren();
  for (const asset of assets || []) {
    const item = document.createElement(type === 'image' ? 'a' : 'div');
    item.className = 'mb-0';
    if (type === 'image') {
      item.href = asset.url;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      const image = document.createElement('img');
      image.src = asset.url;
      image.alt = asset.caption || asset.originalName || 'Completion evidence';
      image.loading = 'lazy';
      item.append(image);
    } else {
      const video = document.createElement('video');
      video.src = asset.url;
      video.controls = true;
      video.preload = 'metadata';
      item.append(video);
    }
    if (asset.caption) node(item, 'div', 'small text-muted-soft mt-1', asset.caption);
    parent.append(item);
  }
}

export async function initAdminCompletionReview() {
  const error = get('reviewError');
  const loading = get('reviewLoading');
  try {
    const meResponse = await fetchMe();
    const me = meResponse?.data || meResponse;
    if (me?.role !== 'ADMIN') throw new Error('Admin access is required.');
    if (!reportId) throw new Error('Report was not specified.');
    const response = await apiFetch(`/api/v1/admin/service-completions/${encodeURIComponent(reportId)}`);
    const { data: report, payments = [], messages = [], payout } = response || {};
    const booking = report.booking || {};
    const request = report.request || {};
    const vendor = report.vendor || {};
    const user = report.user || {};
    const service = report.service || {};
    text('reportId', report.reportId);
    text('requestId', request._id || report.request);
    text('bookingId', booking._id || report.booking);
    text('reportStatus', `${humanize(report.status)} · ${humanize(report.adminReviewStatus)} · ${humanize(report.payoutStatus)}`);
    text('vendorName', vendor.businessName);
    text('clientName', `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email);
    text('serviceName', `${service.serviceName || service.name || 'Service'}${service.serviceCategory ? ` · ${service.serviceCategory}` : ''}`);
    text('grossAmount', `${booking.amountCurrency || 'NGN'} ${Number(booking.totalAmount || 0).toLocaleString()}`);
    text('agreement', [request.eventDescription, request.notes, booking.specialRequests].filter(Boolean).join('\n\n') || 'No additional requirements recorded');
    text('deliverySummary', report.serviceSummary);
    text('additionalNotes', report.additionalNotes || 'None');
    text('completionDate', date(report.completionDate));
    text('submittedAt', date(report.submittedAt));
    renderEvidence(get('reviewImages'), report.images, 'image');
    renderEvidence(get('reviewVideos'), report.videos, 'video');
    text('clientDecision', `${humanize(report.satisfactionStatus)} · ${humanize(report.disputeResolution?.outcome || '')}`);
    text('clientFeedback', report.clientFeedback ? `${humanize(report.clientFeedback.reason)}\n${report.clientFeedback.explanation}\nDiffered from agreement: ${report.clientFeedback.differedFromAgreement ? 'Yes' : 'No'}\nMissing deliverables: ${report.clientFeedback.missingDeliverables ? 'Yes' : 'No'}` : 'No dissatisfaction feedback submitted.');
    renderEvidence(get('clientEvidence'), report.clientFeedback?.evidence, 'image');

    const paymentsBody = get('paymentHistory');
    paymentsBody.replaceChildren();
    for (const payment of payments) {
      const row = document.createElement('tr');
      node(row, 'td', '', payment.transactionReference);
      node(row, 'td', '', payment.paymentStatus);
      node(row, 'td', '', `${payment.currency || 'NGN'} ${Number(payment.amount || 0).toLocaleString()}`);
      node(row, 'td', '', payment.paymentGateway || '—');
      node(row, 'td', '', date(payment.webhookReceivedAt || payment.updatedAt));
      paymentsBody.append(row);
    }
    if (!payments.length) node(paymentsBody, 'tr', '', 'No payment records found.');

    const messagesHost = get('relatedMessages');
    messagesHost.replaceChildren();
    for (const message of messages) {
      const sender = message.sender || {};
      const card = document.createElement('article');
      card.className = 'border-bottom pb-2';
      node(card, 'div', 'small fw-semibold', `${[sender.firstName, sender.lastName].filter(Boolean).join(' ') || humanize(sender.role) || 'Participant'} · ${date(message.createdAt)}`);
      node(card, 'div', 'small mt-1', message.messageContent || '');
      messagesHost.append(card);
    }
    if (!messages.length) node(messagesHost, 'div', 'small text-muted-soft', 'No related messages.');

    const history = get('reviewHistory');
    history.replaceChildren();
    for (const item of report.reviewHistory || []) {
      const actor = item.admin || {};
      const row = document.createElement('div');
      row.className = 'border-bottom pb-2';
      node(row, 'div', 'small fw-semibold', `${[actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email || 'Admin'} · ${humanize(item.action)} · ${date(item.createdAt)}`);
      node(row, 'div', 'small text-muted-soft mt-1', item.reason || 'No reason recorded');
      history.append(row);
    }
    for (const item of report.additionalResponses || []) {
      const author = item.author || {};
      const row = document.createElement('div');
      row.className = 'border-bottom pb-2';
      node(row, 'div', 'small fw-semibold', `${[author.firstName, author.lastName].filter(Boolean).join(' ') || humanize(item.authorRole)} · ${humanize(item.authorRole)} clarification · ${date(item.createdAt)}`);
      node(row, 'div', 'small text-muted-soft mt-1', item.message || '');
      history.append(row);
    }
    if (!report.reviewHistory?.length) node(history, 'div', 'small text-muted-soft', 'No admin actions recorded.');
    if (payout) node(history, 'div', 'small text-muted-soft mt-2', `Payout ${payout.payoutId}: ${payout.currency} ${Number(payout.grossAmount || 0).toLocaleString()} gross · ${humanize(payout.payoutStatus)}${payout.netAmount == null ? ' · Net amount pending admin configuration' : ` · Net ${payout.currency} ${Number(payout.netAmount).toLocaleString()}`}`);

    const actionSelect = get('reviewAction');
    const resolutionWrap = get('resolutionWrap');
    actionSelect.addEventListener('change', () => resolutionWrap.classList.toggle('d-none', actionSelect.value !== 'RESOLVE_DISPUTE'));
    get('reviewForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const action = actionSelect.value;
      const reason = get('reviewReason').value.trim();
      if (['REQUEST_VENDOR_INFO', 'REQUEST_CLIENT_CLARIFICATION', 'REJECT', 'INVESTIGATE', 'ESCALATE', 'HOLD', 'RESOLVE_DISPUTE'].includes(action) && reason.length < 5) {
        error.textContent = 'Provide a reason or instruction of at least five characters.';
        error.classList.remove('d-none');
        return;
      }
      if (action === 'REJECT' && !window.confirm('Reject this completion report and cancel its payout?')) return;
      const button = get('submitReview');
      button.disabled = true;
      try {
        await apiFetch(`/api/v1/admin/service-completions/${encodeURIComponent(report._id)}/review`, {
          method: 'PUT',
          body: { action, reason, outcome: get('disputeOutcome').value },
        });
        window.location.reload();
      } catch (reviewError) {
        error.textContent = reviewError?.message || 'Could not save admin review.';
        error.classList.remove('d-none');
      } finally {
        button.disabled = false;
      }
    });
    loading.classList.add('d-none');
    get('reviewContent').classList.remove('d-none');
  } catch (loadError) {
    if (loadError?.status === 401 || loadError?.status === 403) { clearToken(); window.location.replace('auth-login.html'); return; }
    loading.classList.add('d-none');
    error.textContent = loadError?.message || 'Could not load report details.';
    error.classList.remove('d-none');
  }
}
