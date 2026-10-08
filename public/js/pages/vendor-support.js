import { apiFetch, fetchMe, clearToken } from '../api.js';

const MAX_FILES = 4;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);

function unwrapList(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response)) return response;
  return [];
}

function humanize(value) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function optionLabel(item, type) {
  const id = item?._id || item?.id;
  const dateValue = item?.eventDate || item?.createdAt;
  const date = dateValue ? new Date(dateValue).toLocaleDateString() : '';
  if (type === 'request') return `${item?.service?.serviceName || item?.eventDescription || 'Service request'} · ${date} · ${String(id || '').slice(-6)}`;
  if (type === 'booking') return `${item?.service?.serviceName || 'Booking'} · ${date} · ${String(id || '').slice(-6)}`;
  const amount = Number(item?.amount ?? item?.totalAmount);
  return `Payment ${item?.transactionReference || String(id || '').slice(-8)} · ${item?.paymentStatus || 'Status unavailable'}${Number.isFinite(amount) ? ` · ${item?.currency || 'NGN'} ${amount.toLocaleString()}` : ''}`;
}

function fillSelect(select, items, type, placeholder) {
  select.replaceChildren(new Option(placeholder, ''));
  for (const item of items) {
    const id = item?._id || item?.id;
    if (id) select.add(new Option(optionLabel(item, type), id));
  }
}

function fillRelated(select, items, userId, placeholder, type) {
  const selected = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  for (const item of items.filter((record) => String(record.userId || record.user?._id || record.user || '') === String(userId))) {
    select.add(new Option(item.label || optionLabel(item, type), item._id));
  }
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function validateFiles(input, messageElement) {
  const files = Array.from(input.files || []);
  const invalid = files.length > MAX_FILES || files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE);
  if (invalid) {
    input.value = '';
    messageElement.textContent = 'Select up to 4 PNG, JPEG, WebP, GIF, or PDF files (5 MB maximum each).';
    messageElement.classList.add('text-danger');
    return false;
  }
  messageElement.classList.remove('text-danger');
  messageElement.textContent = files.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`).join(' · ');
  return true;
}

function reportField(formData, key, value) {
  if (value !== undefined && value !== null && String(value).trim()) formData.append(key, String(value).trim());
}

export async function initVendorSupport() {
  const list = document.getElementById('ticketList');
  const empty = document.getElementById('ticketEmpty');
  const error = document.getElementById('supportError');
  const ticketForm = document.getElementById('ticketForm');
  const reportForm = document.getElementById('userReportForm');
  const ticketError = document.getElementById('ticketFormError');
  const reportError = document.getElementById('userReportError');
  const reportSuccess = document.getElementById('userReportSuccess');
  const ticketFilter = document.getElementById('ticketStatusFilter');
  const reportUserSelect = document.getElementById('reportUserId');
  let requests = [];
  let bookings = [];
  let payments = [];
  let reportUsers = { users: [], requests: [], bookings: [] };

  const setMode = (mode) => {
    const ticketMode = mode === 'ticket';
    ticketForm.classList.toggle('d-none', !ticketMode);
    reportForm.classList.toggle('d-none', ticketMode);
    document.getElementById('showTicketForm').classList.toggle('btn-brand', ticketMode);
    document.getElementById('showTicketForm').classList.toggle('btn-soft', !ticketMode);
    document.getElementById('showTicketForm').setAttribute('aria-pressed', String(ticketMode));
    document.getElementById('showReportForm').classList.toggle('btn-brand', !ticketMode);
    document.getElementById('showReportForm').classList.toggle('btn-soft', ticketMode);
    document.getElementById('showReportForm').setAttribute('aria-pressed', String(!ticketMode));
  };
  document.getElementById('showTicketForm').addEventListener('click', () => setMode('ticket'));
  document.getElementById('showReportForm').addEventListener('click', () => setMode('report'));

  document.getElementById('ticketAttachments').addEventListener('change', (event) => {
    validateFiles(event.currentTarget, document.getElementById('ticketFilesHint'));
  });
  document.getElementById('reportEvidence').addEventListener('change', (event) => {
    validateFiles(event.currentTarget, document.getElementById('reportFilesHint'));
  });

  document.getElementById('reportReason').addEventListener('change', (event) => {
    const isOther = event.currentTarget.value === 'OTHER';
    document.getElementById('reportOtherWrap').classList.toggle('d-none', !isOther);
    document.getElementById('reportOther').required = isOther;
  });

  function renderReportUsers(search = '') {
    const selectedId = reportUserSelect.value;
    const searchTerm = search.trim().toLocaleLowerCase();
    const matches = reportUsers.users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase().includes(searchTerm));
    reportUserSelect.replaceChildren(new Option(matches.length ? 'Select a user' : 'No matching users', ''));
    for (const user of matches) {
      const label = user.preferred ? `${user.name} · Marketplace contact` : user.name;
      reportUserSelect.add(new Option(label, user._id));
    }
    if ([...reportUserSelect.options].some((option) => option.value === selectedId)) reportUserSelect.value = selectedId;
  }

  document.getElementById('reportUserSearch').addEventListener('input', (event) => renderReportUsers(event.target.value));
  reportUserSelect.addEventListener('change', () => {
    fillRelated(document.getElementById('reportRequest'), reportUsers.requests, reportUserSelect.value, 'None', 'request');
    fillRelated(document.getElementById('reportBooking'), reportUsers.bookings, reportUserSelect.value, 'None', 'booking');
  });

  async function loadTickets() {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (ticketFilter.value) params.set('status', ticketFilter.value);
      const response = await apiFetch(`/api/v1/vendors/tickets?${params}`);
      const tickets = unwrapList(response);
      list.replaceChildren();
      empty.classList.toggle('d-none', tickets.length > 0);
      for (const ticket of tickets) {
        const card = document.createElement('article');
        card.className = 'card card-glass p-3';
        const title = document.createElement('h3');
        title.className = 'h6 fw-bold';
        title.textContent = ticket.subject || 'Support ticket';
        const description = document.createElement('p');
        description.className = 'mb-2';
        description.textContent = ticket.description || '';
        const status = document.createElement('div');
        status.className = 'small text-muted-soft';
        const created = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'Date unavailable';
        const updated = ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : created;
        status.textContent = `${humanize(ticket.status)} · ${humanize(ticket.priority)} priority · ${humanize(ticket.category)} · Created ${created} · Updated ${updated}`;
        const detailLink = document.createElement('a');
        detailLink.className = 'btn btn-soft btn-sm mt-3';
        detailLink.href = `vendor-ticket-details.html?id=${encodeURIComponent(ticket._id)}`;
        detailLink.textContent = `View ticket${ticket.updates?.length ? ` and updates (${ticket.updates.length})` : ''}`;
        card.append(title, description, status, detailLink);
        list.append(card);
      }
    } catch (loadError) {
      error.textContent = loadError?.message || 'Could not load support tickets.';
      error.classList.remove('d-none');
    }
  }

  ticketFilter.addEventListener('change', loadTickets);

  ticketForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    ticketError.textContent = '';
    const filesInput = document.getElementById('ticketAttachments');
    const files = Array.from(filesInput.files || []);
    if (!validateFiles(filesInput, document.getElementById('ticketFilesHint'))) return;
    const body = new FormData();
    reportField(body, 'subject', document.getElementById('ticketSubject').value);
    reportField(body, 'category', document.getElementById('ticketCategory').value);
    reportField(body, 'priority', document.getElementById('ticketPriority').value);
    reportField(body, 'description', document.getElementById('ticketDescription').value);
    reportField(body, 'request', document.getElementById('ticketRequest').value);
    reportField(body, 'booking', document.getElementById('ticketBooking').value);
    reportField(body, 'payment', document.getElementById('ticketPayment').value);
    files.forEach((file) => body.append('attachments', file));
    const button = document.getElementById('submitTicket');
    button.disabled = true;
    button.textContent = 'Submitting...';
    try {
      const response = await apiFetch('/api/v1/tickets', { method: 'POST', body });
      const ticket = response?.data || {};
      ticketForm.reset();
      document.getElementById('ticketFilesHint').textContent = '';
      await loadTickets();
      window.location.href = `vendor-ticket-details.html?id=${encodeURIComponent(ticket._id)}`;
    } catch (submitError) {
      ticketError.textContent = submitError?.message || 'Could not submit the support ticket.';
    } finally {
      button.disabled = false;
      button.textContent = 'Submit ticket';
    }
  });

  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    reportError.textContent = '';
    reportSuccess.textContent = '';
    const evidenceInput = document.getElementById('reportEvidence');
    const files = Array.from(evidenceInput.files || []);
    if (!validateFiles(evidenceInput, document.getElementById('reportFilesHint'))) return;
    const body = new FormData();
    body.append('target', 'USER');
    reportField(body, 'reportedUserId', reportUserSelect.value);
    reportField(body, 'reason', document.getElementById('reportReason').value);
    reportField(body, 'otherReason', document.getElementById('reportOther').value);
    reportField(body, 'description', document.getElementById('reportDescription').value);
    reportField(body, 'requestId', document.getElementById('reportRequest').value);
    reportField(body, 'bookingId', document.getElementById('reportBooking').value);
    files.forEach((file) => body.append('evidence', file));
    const button = document.getElementById('submitUserReport');
    button.disabled = true;
    button.textContent = 'Submitting...';
    try {
      const response = await apiFetch('/api/v1/reports', { method: 'POST', body });
      reportSuccess.textContent = `Report ${response?.data?.reportId || ''} submitted for review.`;
      reportForm.reset();
      document.getElementById('reportOtherWrap').classList.add('d-none');
      document.getElementById('reportOther').required = false;
      document.getElementById('reportFilesHint').textContent = '';
      fillRelated(document.getElementById('reportRequest'), reportUsers.requests, '', 'None', 'request');
      fillRelated(document.getElementById('reportBooking'), reportUsers.bookings, '', 'None', 'booking');
    } catch (submitError) {
      reportError.textContent = submitError?.message || 'Could not submit the report.';
    } finally {
      button.disabled = false;
      button.textContent = 'Submit report';
    }
  });

  try {
    const userResponse = await fetchMe();
    const user = userResponse?.data || userResponse;
    if (user?.role !== 'VENDOR') throw new Error('Vendor access is required.');
    const results = await Promise.allSettled([
      apiFetch('/api/v1/requests?limit=50'),
      apiFetch('/api/v1/bookings?limit=50'),
      apiFetch('/api/v1/payments?limit=50'),
      apiFetch('/api/v1/reports/users'),
    ]);
    requests = results[0].status === 'fulfilled' ? unwrapList(results[0].value) : [];
    bookings = results[1].status === 'fulfilled' ? unwrapList(results[1].value) : [];
    payments = results[2].status === 'fulfilled' ? unwrapList(results[2].value) : [];
    reportUsers = results[3].status === 'fulfilled' ? (results[3].value?.data || reportUsers) : reportUsers;
    fillSelect(document.getElementById('ticketRequest'), requests, 'request', 'None');
    fillSelect(document.getElementById('ticketBooking'), bookings, 'booking', 'None');
    fillSelect(document.getElementById('ticketPayment'), payments, 'payment', 'None');
    renderReportUsers();
    fillRelated(document.getElementById('reportRequest'), reportUsers.requests, '', 'None', 'request');
    fillRelated(document.getElementById('reportBooking'), reportUsers.bookings, '', 'None', 'booking');
    await loadTickets();
  } catch (loadError) {
    if (loadError?.status === 401 || loadError?.status === 403) {
      clearToken();
      window.location.replace('auth-login.html');
      return;
    }
    error.textContent = loadError?.message || 'Could not load the vendor support workspace.';
    error.classList.remove('d-none');
  }
}
