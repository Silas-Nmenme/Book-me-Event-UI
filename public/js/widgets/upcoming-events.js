import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function formatDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function getCountdownParts(targetMs) {
  const now = Date.now();
  const diff = Math.max(0, targetMs - now);
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes - days * 60 * 24) / 60);
  const mins = minutes - days * 60 * 24 - hours * 60;

  return { days, hours, mins };
}

function renderCountdown(el, eventDate) {
  const targetMs = new Date(eventDate).getTime();

  const update = () => {
    const { days, hours, mins } = getCountdownParts(targetMs);
    const parts = [
      `${days} days`,
      `${hours} hours`,
    ];
    if (days === 0) parts.push(`${mins} mins`);
    el.textContent = parts.join(' ') + ' remaining';
  };

  update();
  return update;
}

function statusPill(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'CONFIRMED') return { cls: 'bme-pill--confirmed', label: 'Confirmed' };
  if (s === 'PENDING') return { cls: 'bme-pill--pending', label: 'Pending' };
  if (s === 'CANCELLED' || s === 'CANCELED') return { cls: 'bme-pill--cancelled', label: 'Cancelled' };
  return { cls: 'bme-pill', label: s || 'Status' };
}

export function initUpcomingEventsWidget() {
  const shell = document.getElementById('widgetUpcomingEvents');
  if (!shell) return;

  const container = document.getElementById('upcomingEventsContainer');
  if (!container) return;

  const skeleton = container.querySelector('.bme-skeleton') || shell.querySelector('.skeleton');
  const show = (node, on) => {
    if (!node) return;
    node.classList.toggle('d-none', !on);
  };

  const state = { updates: [] };

  const run = async () => {
    try {
      container.innerHTML = '';
      skeleton?.remove();

      const res = await apiFetch('/api/v1/bookings/upcoming', { method: 'GET' });
      const data = res?.data || res;
      const items = Array.isArray(data) ? data : (data?.items || []);

      if (!items.length) {
        container.innerHTML = `<div class="text-muted-soft small">No upcoming events.</div>`;
        return;
      }

      const limited = items.slice(0, 3);
      for (const b of limited) {
        const pill = statusPill(b.status);
        const type = b.eventType || b.type || 'Event';
        const vendor = b.vendor?.name || b.vendorName || 'Vendor';
        const date = b.date || b.eventDate || b.bookingDate || b.startDate;

        const card = document.createElement('div');
        card.className = 'widget-card card-glass p-3';
        card.style.minWidth = '280px';
        card.innerHTML = `
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="text-muted-soft small">${type}</div>
              <div class="fw-bold mt-1">${vendor}</div>
            </div>
            <span class="bme-pill ${pill.cls}">${pill.label}</span>
          </div>
          <div class="mt-2 text-muted-soft small">${formatDate(date)}</div>
          <div class="mt-2 fw-bold" data-countdown="1"></div>
          <div class="mt-3">
            <button class="btn btn-soft w-100" type="button" data-view-details="1">View details</button>
          </div>
        `;

        const countdownEl = card.querySelector('[data-countdown]');
        const updater = renderCountdown(countdownEl, date);
        state.updates.push(updater);

        card.querySelector('[data-view-details]')?.addEventListener('click', () => {
          const modal = document.createElement('div');
          modal.className = 'modal fade';
          modal.tabIndex = -1;
          modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title">Booking details</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <pre class="mb-0" style="white-space:pre-wrap;">${JSON.stringify(b, null, 2)}</pre>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-soft" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
            </div>
          `;

          document.body.appendChild(modal);
          const bs = window.bootstrap;
          bs?.Modal?.getOrCreateInstance(modal).show();
          modal.addEventListener('hidden.bs.modal', () => modal.remove());
        });

        container.appendChild(card);
      }

      // Tick every minute (requirement)
      setInterval(() => state.updates.forEach((u) => u?.()), 60_000);
    } catch (e) {
      toast({ title: 'Failed to load upcoming events', message: e?.message || 'Try again.', variant: 'danger' });
      console.warn(e);
      container.innerHTML = `<div class="text-muted-soft small">Could not load upcoming events.</div>`;
    }
  };

  run();
}

