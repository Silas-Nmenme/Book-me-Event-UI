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

function getUserIdentity(me) {
  return me?.id || me?._id || me?.user?.id || me?.user?._id || me?.userId || me?.user_id || null;
}

function openCreateRequestModal(requestModal, requestModalEl, serviceInput, servicePreviewEl) {
  if (!requestModal || !requestModalEl) return;

  try {
    if (!requestModalEl.classList.contains('show')) {
      requestModal.show();
    }
  } catch {
    // Ignore bootstrap modal errors and fall back to a simple display.
  }

  window.setTimeout(() => {
    serviceInput?.focus({ preventScroll: true });
    if (serviceInput?.value) {
      renderServicePreview(serviceInput.value, servicePreviewEl);
    }
  }, 50);
}

async function renderServicePreview(serviceId, hintEl) {
  if (!hintEl) return;

  const value = (serviceId || '').toString().trim();
  if (!value) {
    hintEl.innerHTML = '<span class="text-muted-soft">Choose a service from Browse services to prefill the request.</span>';
    return;
  }

  hintEl.innerHTML = '<span class="text-muted-soft">Loading service details…</span>';

  try {
    const res = await apiFetch(`/api/v1/services/${encodeURIComponent(value)}`, { method: 'GET' });
    const service = res?.data || res;
    const title = service?.serviceName || 'Service';
    const vendorName = service?.vendor?.businessName || 'Vendor';
    hintEl.innerHTML = `<span class="text-success">Selected service: <strong>${escapeHtml(title)}</strong> from ${escapeHtml(vendorName)}</span>`;
  } catch {
    hintEl.innerHTML = '<span class="text-warning">Service could not be resolved from the current ID. You can still submit the request.</span>';
  }
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
  const userIdentity = getUserIdentity(me);
  if (!userIdentity) {
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

  const serviceInput = document.getElementById('service');
  const servicePreviewEl = document.getElementById('serviceSelectionHint');

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
    openCreateRequestModal(requestModal, requestModalEl, serviceInput, servicePreviewEl);
  });

  // Prefill from services.html: requests.html?prefillServiceId=...
  const prefillServiceId = qs('prefillServiceId') || qs('serviceId') || qs('service');
  const prefillShouldOpen = !!prefillServiceId;

  if (prefillServiceId && serviceInput) {
    serviceInput.value = prefillServiceId;
  }

  if (serviceInput) {
    serviceInput.addEventListener('input', () => {
      renderServicePreview(serviceInput.value, servicePreviewEl);
    });
  }

  if (prefillShouldOpen) {
    setTimeout(() => {
      openCreateRequestModal(requestModal, requestModalEl, serviceInput, servicePreviewEl);
      toast({
        title: 'Request ready',
        message: 'Your selected service has been prefilled. Complete the form and submit.',
        variant: 'info',
      });
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('prefillServiceId');
        url.searchParams.delete('serviceId');
        url.searchParams.delete('service');
        window.history.replaceState({}, '', url.toString());
      }
    }, 0);
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
      serviceId: service || undefined,

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
      renderServicePreview('', servicePreviewEl);

      requestModal?.hide();
      await load();

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

