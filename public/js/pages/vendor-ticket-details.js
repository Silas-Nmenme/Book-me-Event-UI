import { apiFetch, fetchMe, clearToken } from '../api.js';

const MAX_FILES = 4;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);
const ticketId = new URLSearchParams(window.location.search).get('id');

function appendText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value || '';
  parent.append(element);
  return element;
}

function humanize(value) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function appendAttachments(parent, attachments = []) {
  if (!attachments.length) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex flex-wrap gap-2 mt-2';
  for (const attachment of attachments) {
    const link = document.createElement('a');
    link.className = 'btn btn-soft btn-sm';
    link.href = attachment.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = attachment.originalName || 'View attachment';
    wrapper.append(link);
  }
  parent.append(wrapper);
}

function validateFiles(input, hint) {
  const files = Array.from(input.files || []);
  if (files.length > MAX_FILES || files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) {
    input.value = '';
    hint.textContent = 'Select up to 4 PNG, JPEG, WebP, GIF, or PDF files (5 MB maximum each).';
    hint.classList.add('text-danger');
    return false;
  }
  hint.classList.remove('text-danger');
  hint.textContent = files.map((file) => `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`).join(' · ');
  return true;
}

export async function initVendorTicketDetails() {
  const error = document.getElementById('ticketError');
  const timeline = document.getElementById('ticketUpdates');
  const replyForm = document.getElementById('ticketReplyForm');
  const closeButton = document.getElementById('closeTicketButton');
  const attachmentInput = document.getElementById('replyAttachments');
  const attachmentHint = document.getElementById('replyFilesHint');
  const replyError = document.getElementById('replyError');
  const heading = document.getElementById('ticketSubject');
  let currentTicket;
  let currentUser;

  function render(ticket) {
    currentTicket = ticket;
    document.title = `${ticket.subject || 'Support ticket'} - Book Me Events`;
    heading.textContent = ticket.subject || 'Support ticket';
    document.getElementById('ticketCategory').textContent = humanize(ticket.category);
    document.getElementById('ticketStatus').textContent = humanize(ticket.status);
    document.getElementById('ticketPriority').textContent = humanize(ticket.priority);
    document.getElementById('ticketCreated').textContent = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'Unknown';
    document.getElementById('ticketUpdated').textContent = ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : 'Unknown';
    document.getElementById('ticketDescription').textContent = ticket.description || '';

    const related = document.getElementById('ticketRelated');
    related.replaceChildren();
    if (ticket.request) appendText(related, 'div', 'small', `Request: ${ticket.request._id || ticket.request}`);
    if (ticket.booking) appendText(related, 'div', 'small', `Booking: ${ticket.booking._id || ticket.booking}`);
    if (ticket.payment) appendText(related, 'div', 'small', `Payment: ${ticket.payment.transactionReference || ticket.payment._id || ticket.payment}`);
    appendAttachments(document.getElementById('ticketAttachments'), ticket.attachments);

    timeline.replaceChildren();
    const updates = Array.isArray(ticket.updates) ? ticket.updates : [];
    if (!updates.length) appendText(timeline, 'p', 'small text-muted-soft', 'No updates yet.');
    for (const update of updates) {
      const entry = document.createElement('article');
      entry.className = 'border-top pt-3 mt-3';
      const author = update.author || {};
      const name = [author.firstName, author.lastName].filter(Boolean).join(' ') || humanize(update.authorRole) || 'Support';
      const date = update.createdAt ? new Date(update.createdAt).toLocaleString() : '';
      appendText(entry, 'div', 'small fw-semibold', `${name} · ${humanize(update.authorRole)} · ${date}`);
      appendText(entry, 'p', 'mb-1 mt-2', update.message || '');
      if (update.status) appendText(entry, 'div', 'small text-muted-soft', `Status: ${humanize(update.status)}`);
      appendAttachments(entry, update.attachments);
      timeline.append(entry);
    }

    const isOwner = String(ticket.user?._id || ticket.user) === String(currentUser?._id || currentUser?.id);
    closeButton.classList.toggle('d-none', !isOwner || ticket.status === 'CLOSED');
    replyForm.classList.toggle('d-none', ticket.status === 'CLOSED');
  }

  async function load() {
    try {
      if (!ticketId) throw new Error('Ticket was not specified.');
      const [userResponse, ticketResponse] = await Promise.all([fetchMe(), apiFetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}`)]);
      currentUser = userResponse?.data || userResponse;
      if (currentUser?.role !== 'VENDOR') throw new Error('Vendor access is required.');
      render(ticketResponse?.data || ticketResponse);
    } catch (loadError) {
      if (loadError?.status === 401 || loadError?.status === 403) {
        clearToken();
        window.location.replace('auth-login.html');
        return;
      }
      error.textContent = loadError?.message || 'Could not load this ticket.';
      error.classList.remove('d-none');
      replyForm.classList.add('d-none');
      closeButton.classList.add('d-none');
    }
  }

  attachmentInput.addEventListener('change', () => validateFiles(attachmentInput, attachmentHint));
  replyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    replyError.textContent = '';
    if (!validateFiles(attachmentInput, attachmentHint)) return;
    const message = document.getElementById('ticketReply').value.trim();
    const formData = new FormData();
    formData.append('message', message);
    Array.from(attachmentInput.files || []).forEach((file) => formData.append('attachments', file));
    const button = document.getElementById('sendTicketReply');
    button.disabled = true;
    try {
      await apiFetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}/replies`, { method: 'POST', body: formData });
      replyForm.reset();
      attachmentHint.textContent = '';
      await load();
    } catch (submitError) {
      replyError.textContent = submitError?.message || 'Could not send your reply.';
    } finally {
      button.disabled = false;
    }
  });

  closeButton.addEventListener('click', async () => {
    if (!window.confirm('Close this support ticket?')) return;
    closeButton.disabled = true;
    try {
      await apiFetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}/close`, { method: 'PUT' });
      await load();
    } catch (closeError) {
      error.textContent = closeError?.message || 'Could not close this ticket.';
      error.classList.remove('d-none');
    } finally {
      closeButton.disabled = false;
    }
  });

  await load();
}
