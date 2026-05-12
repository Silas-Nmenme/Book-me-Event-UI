import {
  apiFetch,
  fetchMe,
  logoutUser,
  clearToken,
  getRequests,
  acceptRequest,
  declineRequest,
  cancelRequest
} from '../api.js';

import { toast } from '../ui.js';

const bootstrap = window.bootstrap;

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function statusLabel(status) {
  const s = (status || '').toString().toLowerCase();

  if (s === 'pending') {
    return { text: 'Pending', variant: 'warning' };
  }

  if (s === 'accepted') {
    return { text: 'Accepted', variant: 'success' };
  }

  if (s === 'declined') {
    return { text: 'Declined', variant: 'danger' };
  }

  if (s === 'canceled' || s === 'cancelled') {
    return { text: 'Cancelled', variant: 'secondary' };
  }

  if (s === 'completed') {
    return { text: 'Completed', variant: 'success' };
  }

  return {
    text: status || '—',
    variant: 'secondary',
  };
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return m[c] || c;
  });
}

function buildCard(req) {
  const id = req?._id || req?.id;

  const title =
    req?.service?.title ||
    req?.service?.name ||
    req?.eventDescription ||
    `Request ${id || ''}`.trim();

  const { text, variant } = statusLabel(req?.status);

  const createdAt = req?.createdAt
    ? new Date(req.createdAt).toLocaleString()
    : '';

  return `
    <div class="col-12">
      <div class="card card-glass p-3">

        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">

          <div>
            <div class="fw-bold">
              ${escapeHtml(title)}
            </div>

            <div class="small text-muted-soft">
              ID: ${escapeHtml(id || '—')}
              ${createdAt ? ` • ${escapeHtml(createdAt)}` : ''}
            </div>
          </div>

          <div>
            <span class="badge text-bg-${variant}">
              ${escapeHtml(text)}
            </span>
          </div>

        </div>

        <div class="mt-3">

          <div class="small mb-1">
            <strong>Location:</strong>
            ${escapeHtml(req?.eventLocation || '—')}
          </div>

          <div class="small mb-1">
            <strong>Event Date:</strong>
            ${
              req?.eventDate
                ? new Date(req.eventDate).toLocaleDateString()
                : '—'
            }
          </div>

          <div class="small mb-1">
            <strong>Budget:</strong>
            ${
              req?.budgetAmount
                ? `₦${Number(req.budgetAmount).toLocaleString()}`
                : '—'
            }
          </div>

        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">

          <button
            class="btn btn-soft btn-sm"
            data-action="openMessages"
            type="button"
            data-id="${escapeHtml(id || '')}"
          >
            Message
          </button>

          <button
            class="btn btn-soft btn-sm"
            data-action="viewBookings"
            type="button"
            data-id="${escapeHtml(id || '')}"
          >
            Bookings
          </button>

          <button
            class="btn btn-danger btn-sm"
            data-action="cancelRequest"
            type="button"
            data-id="${escapeHtml(id || '')}"
          >
            Cancel
          </button>

        </div>

      </div>
    </div>
  `;
}

export async function initRequestsPage({ me, role } = {}) {

  const shell = document.getElementById('requestsShell');
  const roleNotice = document.getElementById('roleNotice');
  const authzError = document.getElementById('authzError');
  const requestList = document.getElementById('requestList');
  const noRequests = document.getElementById('noRequests');

  const btnCreateRequest =
    document.getElementById('btnCreateRequest');

  const requestForm =
    document.getElementById('createRequestForm');

  const requestModalEl =
    document.getElementById('createRequestModal');

  const requestModal = requestModalEl
    ? new bootstrap.Modal(requestModalEl)
    : null;

  const myRole = (
    role ||
    qs('role') ||
    'USER'
  ).toString().toUpperCase();

  shell?.classList.remove('d-none');

  if (roleNotice) {

    roleNotice.classList.remove('d-none');

    if (myRole === 'VENDOR') {
      roleNotice.textContent =
        'Vendor mode: you can accept/decline incoming requests.';
    } else {
      roleNotice.textContent =
        'User mode: create requests and track vendor responses.';
    }
  }

  btnCreateRequest?.addEventListener('click', () => {
    requestModal?.show();
  });

  requestForm?.addEventListener('submit', async (e) => {

    e.preventDefault();

    const vendor =
      document.getElementById('vendor')?.value.trim();

    const service =
      document.getElementById('service')?.value.trim();

    const eventDateRaw =
      document.getElementById('eventDate')?.value;

    const eventLocation =
      document.getElementById('eventLocation')?.value.trim();

    const eventDescription =
      document.getElementById('eventDescription')?.value.trim();

    const guestCountRaw =
      document.getElementById('guestCount')?.value;

    const budgetAmountRaw =
      document.getElementById('budgetAmount')?.value;

    const notes =
      document.getElementById('notes')?.value.trim();

    const attachmentsRaw =
      document.getElementById('attachments')?.value.trim();

    const eventDate = new Date(eventDateRaw);

    const attachments = attachmentsRaw
      ? attachmentsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const payload = {
      vendor: vendor || undefined,
      service: service || undefined,
      eventDate: Number.isNaN(eventDate.getTime())
        ? undefined
        : eventDate,
      eventLocation,
      eventDescription,
      guestCount: guestCountRaw
        ? Number(guestCountRaw)
        : undefined,
      budgetAmount: budgetAmountRaw
        ? Number(budgetAmountRaw)
        : undefined,
      notes: notes || undefined,
      attachments,
    };

    if (!payload.vendor) {
      toast({
        title: 'Vendor required',
        message: 'Please provide a vendor ID.',
        variant: 'danger',
      });
      return;
    }

    if (!payload.eventDate) {
      toast({
        title: 'Invalid date',
        message: 'Provide a valid event date.',
        variant: 'danger',
      });
      return;
    }

    if (!payload.eventLocation) {
      toast({
        title: 'Location required',
        message: 'Event location is required.',
        variant: 'danger',
      });
      return;
    }

    if (!payload.eventDescription) {
      toast({
        title: 'Description required',
        message: 'Event description is required.',
        variant: 'danger',
      });
      return;
    }

    try {

      await apiFetch('/api/v1/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast({
        title: 'Created',
        message: 'Service request created successfully.',
        variant: 'success',
      });

      requestForm.reset();

      requestModal?.hide();

      window.location.reload();

    } catch (e) {

      toast({
        title: 'Create failed',
        message: e?.message || 'Try again.',
        variant: 'danger',
      });

    }
  });

  const status = qs('status') || undefined;

  async function load() {

    requestList.innerHTML = '';

    noRequests?.classList.add('d-none');

    try {

      const res = await getRequests({
        status,
        page: 1,
        limit: 20,
      });

      const data = res?.data || res;

      const items =
        data?.data ||
        data?.results ||
        data?.requests ||
        data?.items ||
        [];

      if (!Array.isArray(items) || items.length === 0) {

        noRequests?.classList.remove('d-none');

        return;
      }

      requestList.innerHTML =
        items.map((r) => buildCard(r)).join('');

      requestList
        .querySelectorAll('[data-action]')
        .forEach((btn) => {

          btn.addEventListener('click', async () => {

            const action =
              btn.getAttribute('data-action');

            const id =
              btn.getAttribute('data-id');

            if (!id) return;

            if (action === 'openMessages') {

              window.location.href =
                `messages.html?requestId=${encodeURIComponent(id)}`;

              return;
            }

            if (action === 'viewBookings') {

              window.location.href =
                `bookings.html?requestId=${encodeURIComponent(id)}`;

              return;
            }

            if (action === 'cancelRequest') {

              try {

                await cancelRequest(id);

                toast({
                  title: 'Cancelled',
                  message: 'Request cancelled successfully.',
                  variant: 'success',
                });

                window.location.reload();

              } catch (e) {

                toast({
                  title: 'Cancel failed',
                  message: e?.message || 'Try again.',
                  variant: 'danger',
                });

              }
            }

          });

        });

    } catch (e) {

      authzError?.classList.remove('d-none');

      if (authzError) {
        authzError.textContent =
          e?.message || 'Failed to load requests.';
      }
    }
  }

  await load();

  // Vendor accept/decline buttons reserved for future use
}