import { apiFetch, getBookings, cancelBooking, completeBooking } from '../api.js';
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
  if (s === 'completed') return { text: 'Completed', variant: 'success' };
  if (s === 'canceled') return { text: 'Canceled', variant: 'secondary' };
  return { text: status || '—', variant: 'secondary' };
}

function buildBookingCard(b) {
  const id = b?._id || b?.id;
  const status = b?.status;
  const { text, variant } = statusLabel(status);

  const title = b?.serviceName || b?.title || b?.requestTitle || `Booking ${id || ''}`.trim();
  const scheduledAt = b?.scheduledAt || b?.eventDate || b?.date;
  const scheduledLabel = scheduledAt ? new Date(scheduledAt).toLocaleString() : '';

  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">ID: ${escapeHtml(id || '—')}${scheduledLabel ? ` • ${escapeHtml(scheduledLabel)}` : ''}</div>
          </div>
          <div>
            <span class="badge text-bg-${variant}">${escapeHtml(text)}</span>
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <button class="btn btn-soft btn-sm" type="button" data-action="cancel" data-id="${escapeHtml(id || '')}">Cancel</button>
          <button class="btn btn-soft btn-sm" type="button" data-action="complete" data-id="${escapeHtml(id || '')}">Complete</button>
        </div>
      </div>
    </div>
  `;
}

export async function initBookingsPage({ me, role } = {}) {
  const shell = document.getElementById('bookingsShell');
  const bookingList = document.getElementById('bookingList');
  const noBookings = document.getElementById('noBookings');
  const authzError = document.getElementById('authzError');
  const roleNotice = document.getElementById('roleNotice');

  const status = qs('status') || undefined;
  const myRole = (role || 'USER').toString().toUpperCase();

  shell?.classList.remove('d-none');

  if (roleNotice) {
    roleNotice.classList.remove('d-none');
    roleNotice.textContent = myRole === 'VENDOR'
      ? 'Vendor mode: you can complete eligible bookings; cancellations depend on backend rules.'
      : 'User mode: you can cancel eligible bookings; completion depends on vendor workflow.';
  }

  async function load() {
    bookingList.innerHTML = '';
    noBookings?.classList.add('d-none');

    try {
      const res = await getBookings({ status, page: 1, limit: 30 });
      const data = res?.data || res;
      const items = data?.results || data?.bookings || data?.items || data || [];

      if (!Array.isArray(items) || items.length === 0) {
        noBookings?.classList.remove('d-none');
        return;
      }

      bookingList.innerHTML = items.map(buildBookingCard).join('');

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

  await load();
}

