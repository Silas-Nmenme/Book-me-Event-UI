import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = {
      '&': '&amp;',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": '&#039;',
    };
    return m[c] || c;
  });
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function statusLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'pending') return { text: 'Pending', variant: 'warning' };
  if (s === 'accepted') return { text: 'Accepted', variant: 'success' };
  if (s === 'declined') return { text: 'Declined', variant: 'danger' };
  if (s === 'cancelled' || s === 'canceled') return { text: 'Cancelled', variant: 'secondary' };
  if (s === 'completed') return { text: 'Completed', variant: 'success' };
  return { text: status || '—', variant: 'secondary' };
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

function buildRequestCard(req) {
  const id = req?._id || req?.id;
  const title = req?.service?.serviceName || req?.service?.title || 'Request';
  const { text, variant } = statusLabel(req?.status);

  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">ID: ${escapeHtml(id || '—')}</div>
            <div class="small text-muted-soft">Event date: ${escapeHtml(formatDate(req?.eventDate))}</div>
            <div class="small text-muted-soft">Location: ${escapeHtml(req?.eventLocation || '—')}</div>
          </div>
          <div>
            <span class="badge text-bg-${variant}">${escapeHtml(text)}</span>
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <button class="btn btn-soft btn-sm" type="button" data-action="edit" data-id="${escapeHtml(id)}">Edit</button>
          <button class="btn btn-danger btn-sm" type="button" data-action="delete" data-id="${escapeHtml(id)}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

export async function initUserRequestPage({ role } = {}) {
  const shell = document.getElementById('requestsShell');
  const authzError = document.getElementById('authzError');

  const serviceSelect = document.getElementById('serviceSelect');
  const eventDateEl = document.getElementById('eventDate');
  const eventLocationEl = document.getElementById('eventLocation');
  const eventDescriptionEl = document.getElementById('eventDescription');
  const guestCountEl = document.getElementById('guestCount');
  const budgetAmountEl = document.getElementById('budgetAmount');
  const notesEl = document.getElementById('notes');

  const requestList = document.getElementById('requestList');
  const noRequests = document.getElementById('noRequests');

  const form = document.getElementById('createRequestForm');
  const btnResetForm = document.getElementById('btnResetForm');

  if (!shell || !form || !serviceSelect) return;

  const myRole = (role || 'USER').toString().toUpperCase();
  if (myRole !== 'USER') {
    authzError?.classList.remove('d-none');
    authzError.textContent = 'This page is for users.';
    return;
  }

  // Editing state
  let editingId = '';

  function setEditing(id) {
    editingId = id || '';
  }

  function resetForm() {
    setEditing('');
    form.reset();
    serviceSelect.value = '';
  }

  btnResetForm?.addEventListener('click', () => resetForm());

  let services = [];

  async function loadServices() {
    const res = await apiFetch('/api/v1/services?limit=200', { method: 'GET' });
    services = res?.data || res?.services || [];

    if (!Array.isArray(services) || services.length === 0) {
      toast({ title: 'No services', message: 'No services available to request.', variant: 'danger' });
      return;
    }

    serviceSelect.innerHTML =
      `<option value="">Select a service</option>` +
      services
        .map((s) => {
          const label = `${s.serviceCategory} - ${s.serviceName}`;
          return `<option value="${escapeHtml(s._id)}">${escapeHtml(label)}</option>`;
        })
        .join('');

    const prefillServiceId = qs('serviceId');
    if (prefillServiceId) serviceSelect.value = prefillServiceId;
  }

  async function loadMyRequests() {
    requestList.innerHTML = '';
    noRequests?.classList.add('d-none');

    const res = await apiFetch('/api/v1/requests?limit=50&page=1', { method: 'GET' });
    const items = res?.data || [];

    if (!Array.isArray(items) || items.length === 0) {
      noRequests?.classList.remove('d-none');
      return;
    }

    requestList.innerHTML = items.map((r) => buildRequestCard(r)).join('');

    requestList.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const req = items.find((x) => (x?._id || x?.id) === id);
        if (!req) return;

        setEditing(id);
        serviceSelect.value = req?.service?._id || '';
        eventDateEl.value = req?.eventDate ? new Date(req.eventDate).toISOString().slice(0, 10) : '';
        eventLocationEl.value = req?.eventLocation || '';
        eventDescriptionEl.value = req?.eventDescription || '';
        guestCountEl.value = req?.guestCount ?? '';
        budgetAmountEl.value = req?.budgetAmount ?? '';
        notesEl.value = req?.notes || '';

        toast({ title: 'Edit mode', message: 'Update and submit to save changes.', variant: 'info' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    requestList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;

        // Defensive check: backend expects a Mongo ObjectId (24 hex chars)
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
          toast({ title: 'Invalid request id', message: 'This request id is malformed.', variant: 'danger' });
          return;
        }
        if (!confirm('Delete this request?')) return;

        try {

          await apiFetch(`/api/v1/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast({ title: 'Deleted', message: 'Request deleted successfully.', variant: 'success' });
          if (editingId === id) resetForm();
          await loadMyRequests();
        } catch (e) {
          toast({ title: 'Delete failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      serviceId: serviceSelect.value || undefined,
      eventDate: eventDateEl.value ? new Date(eventDateEl.value) : undefined,
      eventLocation: eventLocationEl.value.trim(),
      eventDescription: eventDescriptionEl.value.trim(),
      guestCount: guestCountEl.value ? Number(guestCountEl.value) : undefined,
      budgetAmount: budgetAmountEl.value ? Number(budgetAmountEl.value) : undefined,
      notes: notesEl.value.trim() || undefined,
    };

    if (!payload.serviceId) {
      toast({ title: 'Service required', message: 'Please select a service.', variant: 'danger' });
      return;
    }
    if (!payload.eventDate || Number.isNaN(payload.eventDate.getTime())) {
      toast({ title: 'Event date required', message: 'Please provide a valid date.', variant: 'danger' });
      return;
    }

    if (!payload.eventLocation) {
      toast({ title: 'Location required', message: 'Event location is required.', variant: 'danger' });
      return;
    }
    if (!payload.eventDescription) {
      toast({ title: 'Description required', message: 'Event description is required.', variant: 'danger' });
      return;
    }

    try {
      if (editingId) {
        await apiFetch(`/api/v1/requests/${encodeURIComponent(editingId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Updated', message: 'Request updated successfully.', variant: 'success' });
      } else {
        await apiFetch('/api/v1/requests', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Created', message: 'Service request created successfully.', variant: 'success' });
      }

      resetForm();
      await loadMyRequests();
    } catch (e) {
      toast({ title: 'Save failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  });

  shell.classList.remove('d-none');
  authzError?.classList.add('d-none');

  await loadServices();
  await loadMyRequests();
}

