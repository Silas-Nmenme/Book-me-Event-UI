import { apiFetch, getBookings, getBooking, cancelBooking, completeBooking, createBooking, createPayment } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

function statusLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'pending') return { text: 'Pending', variant: 'warning' };
  if (s === 'confirmed') return { text: 'Confirmed', variant: 'success' };
  if (s === 'in_progress' || s === 'in progress') return { text: 'In progress', variant: 'info' };
  if (s === 'completed') return { text: 'Completed', variant: 'success' };
  if (s === 'canceled' || s === 'cancelled') return { text: 'Canceled', variant: 'secondary' };
  return { text: status || '—', variant: 'secondary' };
}

function buildBookingCard(b, myRole) {
  const id = b?._id || b?.id;
  const status = b?.status || b?.bookingStatus;
  const { text, variant } = statusLabel(status);

  const title = b?.serviceName || b?.service?.name || b?.title || b?.requestTitle || `Booking ${id || ''}`.trim();
  const scheduledAt = b?.scheduledAt || b?.eventDate || b?.date || b?.request?.eventDate;
  const scheduledLabel = scheduledAt ? new Date(scheduledAt).toLocaleString() : '';
  const vendorName = b?.vendor?.businessName || b?.vendor?.name || b?.vendor?.email || '';
  const amount = (b?.totalAmount != null ? `₦${Number(b.totalAmount).toLocaleString()}` : '—');

  return `
    <div class="col-12">
      <div class="card card-glass p-3 card-hover">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">ID: ${escapeHtml(id || '—')}${scheduledLabel ? ` • ${escapeHtml(scheduledLabel)}` : ''}${vendorName ? ` • ${escapeHtml(vendorName)}` : ''}</div>
            <div class="small text-muted-soft">Amount: ${escapeHtml(amount)}</div>
          </div>
          <div>
            <span class="badge text-bg-${variant}">${escapeHtml(text)}</span>
          </div>
        </div>
        <div class="mt-3 d-flex flex-wrap gap-2">
          ${myRole === 'USER' ? `<button class="btn btn-danger btn-sm" type="button" data-action="cancel" data-id="${escapeHtml(id || '')}">Cancel</button>` : ''}
          ${myRole === 'VENDOR' ? `<button class="btn btn-success btn-sm" type="button" data-action="complete" data-id="${escapeHtml(id || '')}">Mark complete</button>` : ''}
          <a class="btn btn-soft btn-sm" href="bookings.html?bookingId=${encodeURIComponent(id)}">Details</a>
        </div>
      </div>
    </div>
  `;
}

export async function initBookingsPage({ me, role } = {}) {
  const shell = document.getElementById('bookingsShell');
  const requestBookingShell = document.getElementById('requestBookingShell');
  const bookingList = document.getElementById('bookingList');
  const noBookings = document.getElementById('noBookings');
  const authzError = document.getElementById('authzError');
  const roleNotice = document.getElementById('roleNotice');

  const requestId = qs('requestId');
  const rawStatus = qs('status') || undefined;
  const status = rawStatus ? rawStatus.toString().toUpperCase().replace('CANCELED', 'CANCELLED') : undefined;
  const myRole = (role || 'USER').toString().toUpperCase();

  shell?.classList.remove('d-none');
  requestBookingShell?.classList.add('d-none');

  if (roleNotice) {
    roleNotice.classList.remove('d-none');
    roleNotice.textContent = myRole === 'VENDOR'
      ? 'Vendor mode: you can complete eligible bookings; cancellations depend on backend rules.'
      : 'User mode: you can cancel eligible bookings; completion depends on vendor workflow.';
  }

  async function loadRequestBookingPanel() {
    if (!requestId || myRole !== 'USER') {
      requestBookingShell?.classList.add('d-none');
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/requests/${encodeURIComponent(requestId)}`, { method: 'GET' });
      const request = res?.data || res;
      const statusText = (request?.status || '').toString().toUpperCase();

      if (!requestBookingShell) return;

      if (statusText !== 'ACCEPTED') {
        requestBookingShell.classList.remove('d-none');
        requestBookingShell.innerHTML = `
          <div class="fw-bold mb-2">Booking from request</div>
          <div class="small text-muted-soft mb-2">This request must be accepted before you can create a booking.</div>
          <div class="alert alert-warning">Request status: ${escapeHtml(request?.status || 'unknown')}</div>
        `;
        return;
      }

      requestBookingShell.classList.remove('d-none');
      requestBookingShell.innerHTML = `
        <div class="fw-bold mb-2">Book accepted request</div>
        <div class="small text-muted-soft mb-3">Create the booking and then pay to confirm your event.</div>
        <div class="mb-3"><strong>Request ID:</strong> ${escapeHtml(requestId)}</div>
        <div class="mb-3"><strong>Event date:</strong> ${escapeHtml(request?.eventDate ? new Date(request.eventDate).toLocaleDateString() : '—')}</div>
        <div class="mb-3"><strong>Location:</strong> ${escapeHtml(request?.eventLocation || '—')}</div>
        <div class="mb-3"><strong>Budget:</strong> ₦${Number(request?.budgetAmount || 0).toLocaleString()}</div>
        <div class="mb-3"><label class="form-label">Total amount</label><input id="bookingTotalAmount" type="number" class="form-control" value="${Number(request?.budgetAmount || 0)}" /></div>
        <div class="mb-3"><label class="form-label">Special requests</label><textarea id="bookingSpecialRequests" class="form-control" rows="3">${escapeHtml(request?.notes || '')}</textarea></div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-brand" id="btnCreateBooking" type="button">Create booking</button>
          <button class="btn btn-soft d-none" id="btnPayBooking" type="button">Pay now</button>
        </div>
        <div id="requestBookingResult" class="small text-muted-soft mt-3"></div>
      `;

      const btnCreateBooking = document.getElementById('btnCreateBooking');
      const btnPayBooking = document.getElementById('btnPayBooking');
      const requestBookingResult = document.getElementById('requestBookingResult');

      btnCreateBooking?.addEventListener('click', async () => {
        const totalAmount = Number(document.getElementById('bookingTotalAmount')?.value || 0);
        const specialRequests = document.getElementById('bookingSpecialRequests')?.value.trim() || undefined;

        if (!totalAmount || totalAmount <= 0) {
          toast({ title: 'Invalid amount', message: 'Enter a valid total amount.', variant: 'warning' });
          return;
        }

        btnCreateBooking.setAttribute('disabled', 'disabled');
        const prev = btnCreateBooking.textContent;
        btnCreateBooking.textContent = 'Creating…';

        try {
          const bookingRes = await createBooking({
            request: requestId,
            service: request?.service?._id || request?.service,
            eventDate: request?.eventDate,
            eventLocation: request?.eventLocation,
            totalAmount,
            amountCurrency: request?.budgetCurrency || 'NGN',
            specialRequests,
          });

          const booking = bookingRes?.data || bookingRes;
          requestBookingResult.textContent = 'Booking created successfully. You can now pay.';
          btnPayBooking?.classList.remove('d-none');
          btnPayBooking?.setAttribute('data-booking-id', booking?._id || booking?.id || '');
          await load();
        } catch (e) {
          const msg = e?.data?.message || e?.message || 'Try again.';
          toast({ title: 'Booking failed', message: msg, variant: 'danger' });
        } finally {
          btnCreateBooking.removeAttribute('disabled');
          btnCreateBooking.textContent = prev;
        }
      });

      btnPayBooking?.addEventListener('click', async () => {
        const bookingId = btnPayBooking?.getAttribute('data-booking-id');
        if (!bookingId) {
          toast({ title: 'Missing booking', message: 'Create the booking first.', variant: 'warning' });
          return;
        }

        try {
          await createPayment({
            booking: bookingId,
            paymentMethod: 'CARD',
            transactionReference: `PAY-${Date.now()}`,
            paymentGateway: 'MANUAL',
          });
          toast({ title: 'Payment complete', message: 'Your payment is confirmed.', variant: 'success' });
          requestBookingResult.textContent = 'Payment completed. Your booking is confirmed.';
          btnPayBooking?.classList.add('d-none');
          await load();
        } catch (e) {
          toast({ title: 'Payment failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    } catch (e) {
      authzError?.classList.remove('d-none');
      if (authzError) authzError.textContent = e?.message || 'Failed to load request for booking.';
    }
  }

  async function loadBookingDetailsPanel() {
    const bookingDetailsShell = document.getElementById('bookingDetailsShell');
    if (!bookingDetailsShell) return;

    if (!qs('bookingId')) {
      bookingDetailsShell.classList.add('d-none');
      bookingDetailsShell.innerHTML = '';
      return;
    }

    try {
      const bookingId = qs('bookingId');
      const res = await getBooking(bookingId);
      const booking = res?.data || res;
      const bookingStatus = booking?.bookingStatus || booking?.status || '—';
      const paymentStatus = booking?.paymentStatus || '—';
      const serviceName = booking?.service?.serviceName || booking?.service?.name || '—';
      const vendorName = booking?.vendor?.businessName || booking?.vendor?.name || '—';
      const customerName = booking?.user?.firstName ? `${booking.user.firstName} ${booking.user.lastName || ''}`.trim() : booking?.user?.email || '—';
      const requestIdValue = booking?.request?._id || booking?.request?.id || '—';

      bookingDetailsShell.classList.remove('d-none');
      bookingDetailsShell.innerHTML = `
        <div class="fw-bold mb-2">Booking details</div>
        <div class="row g-3">
          <div class="col-12 col-md-6"><strong>ID</strong><div class="small text-muted-soft">${escapeHtml(booking._id || booking.id || '—')}</div></div>
          <div class="col-12 col-md-6"><strong>Status</strong><div class="small text-muted-soft">${escapeHtml(bookingStatus)}</div></div>
          <div class="col-12 col-md-6"><strong>Payment</strong><div class="small text-muted-soft">${escapeHtml(paymentStatus)}</div></div>
          <div class="col-12 col-md-6"><strong>Service</strong><div class="small text-muted-soft">${escapeHtml(serviceName)}</div></div>
          <div class="col-12 col-md-6"><strong>Vendor</strong><div class="small text-muted-soft">${escapeHtml(vendorName)}</div></div>
          <div class="col-12 col-md-6"><strong>Customer</strong><div class="small text-muted-soft">${escapeHtml(customerName)}</div></div>
          <div class="col-12 col-md-6"><strong>Request</strong><div class="small text-muted-soft">${escapeHtml(requestIdValue)}</div></div>
          <div class="col-12 col-md-6"><strong>Event date</strong><div class="small text-muted-soft">${escapeHtml(booking?.eventDate ? new Date(booking.eventDate).toLocaleDateString() : '—')}</div></div>
          <div class="col-12 col-md-6"><strong>Location</strong><div class="small text-muted-soft">${escapeHtml(booking?.eventLocation || '—')}</div></div>
          <div class="col-12 col-md-6"><strong>Amount</strong><div class="small text-muted-soft">${booking?.totalAmount != null ? `₦${Number(booking.totalAmount).toLocaleString()} ${escapeHtml(booking.amountCurrency || '')}` : '—'}</div></div>
          <div class="col-12"><strong>Special requests</strong><div class="small text-muted-soft">${escapeHtml(booking?.specialRequests || 'None')}</div></div>
        </div>
      `;
    } catch (e) {
      const bookingDetailsShell = document.getElementById('bookingDetailsShell');
      bookingDetailsShell.classList.remove('d-none');
      bookingDetailsShell.innerHTML = `
        <div class="alert alert-danger">Unable to load booking details: ${escapeHtml(e?.message || 'Try again.')}</div>
      `;
    }
  }

  async function load() {
    bookingList.innerHTML = '';
    noBookings?.classList.add('d-none');

    try {
      const res = await getBookings({ status, page: 1, limit: 30 });
      const data = res?.data || res;
      const items = data?.results || data?.bookings || data?.items || data?.data || data || [];

      if (!Array.isArray(items) || items.length === 0) {
        noBookings?.classList.remove('d-none');
        return;
      }

      bookingList.innerHTML = items.map((it) => buildBookingCard(it, myRole)).join('');

      bookingList.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          if (!id) return;

          try {
            if (action === 'cancel') {
              await cancelBooking(id, { reason: 'Canceled by user' });
              toast({ title: 'Canceled', message: 'Booking canceled.', variant: 'success' });
            }
            if (action === 'complete') {
              await completeBooking(id);
              toast({ title: 'Completed', message: 'Booking marked completed.', variant: 'success' });
            }
            await load();
          } catch (e) {
            toast({ title: 'Action failed', message: e?.message || 'Try again.', variant: 'danger' });
          }
        });
      });
    } catch (e) {
      authzError?.classList.remove('d-none');
      if (authzError) authzError.textContent = e?.message || 'Failed to load bookings.';
    }
  }

  // Wire up search + refresh controls added to the HTML
  const bookingSearch = document.getElementById('bookingSearch');
  const btnRefreshBookings = document.getElementById('btnRefreshBookings');

  let searchTimer;
  function applySearchFilter() {
    const q = bookingSearch?.value?.toString().toLowerCase().trim() || '';
    const cards = bookingList.querySelectorAll('.card');
    if (!q) {
      cards.forEach((c) => (c.parentElement.style.display = ''));
      return;
    }
    cards.forEach((c) => {
      const txt = c.innerText.toLowerCase();
      const show = txt.indexOf(q) !== -1;
      c.parentElement.style.display = show ? '' : 'none';
    });
  }

  bookingSearch?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearchFilter, 220);
  });

  btnRefreshBookings?.addEventListener('click', async () => {
    btnRefreshBookings.setAttribute('disabled', 'disabled');
    try {
      await load();
      applySearchFilter();
    } finally {
      btnRefreshBookings.removeAttribute('disabled');
    }
  });

  await load();
  await loadRequestBookingPanel();
  await loadBookingDetailsPanel();
}

