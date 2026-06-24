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

  if (s === 'booked') {
    return { text: 'Booked', variant: 'primary' };
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

function normalizeReqStatus(s) {
  const v = (s ?? '').toString().toLowerCase();
  if (v === 'cancelled') return 'canceled';
  return v;
}

function buildCard(req, { myRole } = {}) {
  const id = req?._id || req?.id;


  const title =
    req?.service?.title ||
    req?.service?.name ||
    req?.eventDescription ||
    `Request ${id || ''}`.trim();

  const normalizedStatus = req?.status
    ? normalizeReqStatus(req.status)
    : req?.status;

  const { text, variant } = statusLabel(normalizedStatus);

  const createdAt = req?.createdAt
    ? new Date(req.createdAt).toLocaleString()
    : '';

  const myRoleNorm = (myRole || '').toString().toUpperCase();
  const normalizedStatusForActions = req?.status
    ? normalizeReqStatus(req.status)
    : req?.status;
  const statusNorm = (normalizedStatusForActions || '')
    .toString()
    .toLowerCase();
  const isPending = statusNorm === 'pending';

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
            ${(() => {
              const pillClass =
                variant === 'warning'
                  ? 'bme-pill--pending'
                  : variant === 'success'
                    ? 'bme-pill--confirmed'
                    : variant === 'danger'
                      ? 'bme-pill--cancelled'
                      : 'bme-pill--cancelled';
              return `<span class="bme-pill ${pillClass}">${escapeHtml(text)}</span>`;
            })()}
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
          <a class="btn btn-soft btn-sm" href="request-details.html?requestId=${encodeURIComponent(id)}">Details</a>

          <button
            class="btn btn-soft btn-sm"
            data-action="openMessages"
            type="button"
            data-id="${escapeHtml(id || '')}"
          >
            Message
          </button>

          ${
            myRoleNorm === 'USER' && statusNorm === 'accepted'
              ? `
            <a class="btn btn-primary btn-sm" href="bookings.html?requestId=${encodeURIComponent(id)}">Book now</a>
          `
              : ''
          }

          <button
            class="btn btn-soft btn-sm"
            data-action="viewBookings"
            type="button"
            data-id="${escapeHtml(id || '')}"
          >
            Bookings
          </button>

          ${myRoleNorm === 'VENDOR' && isPending ? `
            <button
              class="btn btn-success btn-sm"
              data-action="acceptRequest"
              type="button"
              data-id="${escapeHtml(id || '')}"
            >
              Accept
            </button>
            <button
              class="btn btn-danger btn-sm"
              data-action="declineRequest"
              type="button"
              data-id="${escapeHtml(id || '')}"
            >
              Decline
            </button>
          ` : ''}
          ${myRoleNorm === 'USER' ? `
            <button
              class="btn btn-danger btn-sm"
              data-action="cancelRequest"
              type="button"
              data-id="${escapeHtml(id || '')}"
            >
              Cancel
            </button>
          ` : ''}

        </div>

      </div>
    </div>
  `;
}

export async function initRequestsPage({ me, role } = {}) {

  // Only render requests when logged-in user is the current user.
  // Backend already filters by req.user.
  if (!me?.id) {
    const authzError = document.getElementById('authzError');
    if (authzError) {
      authzError.classList.remove('d-none');
      authzError.textContent = 'Please log in to view your requests.';
    }
    return;
  }

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

  // Requests statuses are stored in backend as: PENDING/ACCEPTED/DECLINED/CANCELLED
  // but this UI uses lowercase: pending/accepted/declined/canceled.
  // (normalizeReqStatus is defined at module scope)

  shell?.classList.remove('d-none');
  if (noRequests) noRequests.classList.add('d-none');
  if (requestList) requestList.innerHTML = '';


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
    // If we have a prefill request from a service card, keep it.
    requestModal?.show();
  });

  // Prefill from services.html: requests.html?prefillServiceId=...
  const prefillServiceId = qs('prefillServiceId');
  const prefillShouldOpen = !!prefillServiceId;


  if (prefillServiceId && document.getElementById('service')) {
    const serviceEl = document.getElementById('service');
    serviceEl.value = prefillServiceId;
  }


  if (prefillShouldOpen) {
    // Ensure modal opens after bootstrap init.
    setTimeout(() => requestModal?.show(), 0);
  }

  requestForm?.addEventListener('submit', async (e) => {

    e.preventDefault();

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

    const eventDate = new Date(eventDateRaw);

    const payload = {
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
    };

    if (!payload.service) {
      toast({
        title: 'Service required',
        message: 'Please provide a service ID.',
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
        status: status ? status.toString().toUpperCase() : undefined,
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

        requestList.innerHTML = '';
        return;
      }

      noRequests?.classList.add('d-none');
      requestList.innerHTML =
        items.map((r) => buildCard(r, { myRole })).join('');


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
              // Request-based chat UI ensures vendor/user messages stay aligned.
              if (myRole === 'VENDOR') {
                window.location.href = `vendor-message.html?requestId=${encodeURIComponent(id)}`;
              } else {
                window.location.href = `user-message.html?requestId=${encodeURIComponent(id)}`;
              }
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

  // Optional UX hint when coming from dashboard.
  if (qs('from') === 'user-dashboard') {
    toast({
      title: 'Loading your requests',
      message: 'Showing the latest from the backend.',
      variant: 'info',
    });
  }

  await load();

  // Vendor accept/decline buttons are handled by the card action buttons.
  // (Accept/decline only render for vendor + pending requests).
}

