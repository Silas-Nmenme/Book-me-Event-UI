import { apiFetch, fetchMe, clearToken } from '../api.js';
import { toast } from '../ui.js';

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

function renderStars(rating) {
  const r = Number(rating);
  if (!Number.isFinite(r) || r < 0) return '—';
  const full = Math.max(0, Math.min(5, Math.floor(r)));
  const half = r - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `
    ${'★'.repeat(full)}${half ? '☆' : ''}${'✩'.repeat(empty)}
  `.trim();
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function loadMeIfPossible() {
  try {
    const meRes = await fetchMe();
    return meRes?.data || meRes;
  } catch {
    return null;
  }
}

async function loadReviews({ page = 1, limit = 6 } = {}) {
  const res = await apiFetch(`/api/v1/reviews?page=${page}&limit=${limit}`, { method: 'GET' });
  const data = res?.data || res;
  const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  return items;
}

async function loadCompletedUnreviewedBookingCandidateList({ limit = 5 } = {}) {
  // Endpoint returns bookings that are completed and unreviewed for current user.
  const res = await apiFetch(`/api/v1/widgets/bookings?status=completed&reviewed=false&limit=${limit}`, { method: 'GET' });
  const data = res?.data || res;
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : (Array.isArray(data?.bookings) ? data.bookings : []);
}

export function initLandingReviewsWidget() {
  const shell = document.getElementById('landingReviewsSection');
  if (!shell) return;

  const reviewsListEl = document.getElementById('landingReviewsList');
  const reviewsLoadingEl = document.getElementById('landingReviewsLoading');
  const reviewCreateCard = document.getElementById('landingCreateReviewCard');
  const reviewCreateForm = document.getElementById('landingCreateReviewForm');
  const authzErrorEl = document.getElementById('landingReviewsAuthzError');

  const bookingsSelect = document.getElementById('landingReviewBookingSelect');

  const titleEl = document.getElementById('landingReviewTitle');
  const commentEl = document.getElementById('landingReviewComment');
  const ratingEl = document.getElementById('landingReviewRating');

  const vendorInput = document.getElementById('landingReviewVendor');
  const serviceInput = document.getElementById('landingReviewService');
  const bookingIdInput = document.getElementById('landingReviewBooking');

  const bookingMetaEl = document.getElementById('landingReviewBookingMeta');

  const setVisible = (el, visible) => {
    if (!el) return;
    el.classList.toggle('d-none', !visible);
  };

  const run = async () => {
    try {
      setVisible(reviewsLoadingEl, true);
      if (reviewsListEl) reviewsListEl.innerHTML = '';

      // Render latest public reviews
      const items = await loadReviews({ page: 1, limit: 6 });
      if (reviewsListEl) {
        if (!items.length) {
          reviewsListEl.innerHTML = `<div class="text-muted-soft small">No reviews yet.</div>`;
        } else {
          reviewsListEl.innerHTML = items
            .slice(0, 6)
            .map((r) => {
              const title = r?.title || 'Review';
              const comment = r?.comment || '';
              const rating = r?.rating ?? '—';
              const createdAt = r?.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
              const user = r?.user || {};
              const vendor = r?.vendor || {};
              const service = r?.service || {};

              return `
                <div class="col-12 col-md-6">
                  <div class="card card-glass p-3">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <div class="fw-bold">${escapeHtml(title)}</div>
                        <div class="small text-muted-soft">
                          ${escapeHtml(user?.firstName || '')} ${escapeHtml(user?.lastName || '')}
                          ${createdAt ? `• ${escapeHtml(createdAt)}` : ''}
                        </div>
                      </div>
                      <div class="text-warning fw-bold">${escapeHtml(String(rating))}★</div>
                    </div>
                    <div class="mt-2 text-muted-soft" style="white-space: pre-wrap;">${escapeHtml(comment)}</div>
                    <div class="small text-muted-soft mt-2">
                      Vendor: <span class="fw-bold">${escapeHtml(vendor?.businessName || '')}</span>
                      ${service?.serviceName ? `• Service: <span class="fw-bold">${escapeHtml(service.serviceName)}</span>` : ''}
                    </div>
                  </div>
                </div>
              `;
            })
            .join('');
        }
      }

      // Authenticated create review card
      const me = await loadMeIfPossible();
      if (!me) {
        setVisible(reviewCreateCard, false);
        return;
      }

      setVisible(reviewCreateCard, true);
      setVisible(authzErrorEl, false);

      // Load completed unreviewed bookings for the user
      const bookings = await loadCompletedUnreviewedBookingCandidateList({ limit: 6 });
      bookingsSelect.innerHTML = '';

      if (!Array.isArray(bookings) || !bookings.length) {
        bookingsSelect.innerHTML = `<option value="">No completed unreviewed bookings found</option>`;
        setVisible(bookingsSelect, true);
        bookingMetaEl.innerHTML = '';
        bookingMetaEl.classList.add('d-none');
        // disable form
        if (reviewCreateForm) reviewCreateForm.querySelectorAll('input,textarea,button,select').forEach((el) => el.disabled = true);
        return;
      }

      bookingMetaEl.classList.remove('d-none');
      bookingsSelect.innerHTML = `<option value="">Select booking</option>` +
        bookings
          .map((b) => {
            const bookingId = b?._id || b?.id || b?.bookingId || '';
            const vendorName = b?.vendor?.name || b?.vendorName || b?.vendor?.businessName || 'Vendor';
            const type = b?.type || b?.eventType || '';
            const date = b?.eventDate ? new Date(b.eventDate).toLocaleDateString() : (b?.date ? new Date(b.date).toLocaleDateString() : '');
            const label = `${vendorName} • ${type || 'Service'}${date ? ` • ${date}` : ''}`;
            return `<option value="${escapeHtml(String(bookingId))}">${escapeHtml(label)}</option>`;
          })
          .join('');

      // Pre-calc mapping by selecting booking option.
      // The widgets endpoint we used likely returns vendor/service references in booking objects.
      const bookingById = new Map();
      bookings.forEach((b) => {
        const id = b?._id || b?.id || b?.bookingId;
        if (id) bookingById.set(String(id), b);
      });

      bookingsSelect.addEventListener('change', () => {
        const id = bookingsSelect.value;
        const b = bookingById.get(String(id));
        if (!b) {
          if (bookingIdInput) bookingIdInput.value = '';
          if (vendorInput) vendorInput.value = '';
          if (serviceInput) serviceInput.value = '';
          if (bookingMetaEl) bookingMetaEl.innerHTML = '';
          return;
        }

        const bookingId = b?._id || b?.id || b?.bookingId;
        // Our nudge controller enriches with populated vendor/service, but may not include their IDs depending on populate.
        const vendorId = b?.vendor?._id || b?.vendor?._id?.toString?.() || b?.vendorId || b?.vendor?._id || '';
        const serviceId = b?.service?._id || b?.serviceId || b?.service?._id || '';

        if (bookingIdInput) bookingIdInput.value = String(bookingId || '');
        if (vendorInput) vendorInput.value = String(vendorId || '');
        if (serviceInput) serviceInput.value = String(serviceId || '');

        if (bookingMetaEl) {
          const vendorName = b?.vendor?.name || b?.vendorName || 'Vendor';
          const type = b?.type || b?.eventType || 'Service';
          const date = b?.eventDate ? new Date(b.eventDate).toLocaleDateString() : '';
          bookingMetaEl.innerHTML = `${escapeHtml(vendorName)} • ${escapeHtml(type)}${date ? ` • ${escapeHtml(date)}` : ''}`;
        }

        // enable submit only if required hidden values exist
        const canSubmit = Boolean(bookingId && vendorId && serviceId);
        const submitBtn = reviewCreateForm?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = !canSubmit;
      });

      // init disabled state until selection
      const submitBtn = reviewCreateForm?.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      reviewCreateForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const booking = bookingIdInput?.value?.trim();
        const vendor = vendorInput?.value?.trim();
        const service = serviceInput?.value?.trim();
        const rating = Number(ratingEl?.value);
        const title = titleEl?.value?.trim();
        const comment = commentEl?.value?.trim();

        if (!booking || !vendor || !service) {
          toast({ title: 'Select a booking', message: 'Pick a booking that includes vendor & service.', variant: 'warning' });
          return;
        }
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
          toast({ title: 'Pick rating', message: 'Rating must be between 1 and 5.', variant: 'warning' });
          return;
        }
        if (!title || !comment) {
          toast({ title: 'Missing details', message: 'Please add a title and comment.', variant: 'warning' });
          return;
        }

        try {
          const payload = { booking, vendor, service, rating, title, comment };
          await apiFetch('/api/v1/reviews', { method: 'POST', body: JSON.stringify(payload) });
          toast({ title: 'Review posted', message: 'Thanks for sharing your experience!', variant: 'success' });

          reviewCreateForm.reset();
          if (bookingsSelect) bookingsSelect.value = '';
          bookingMetaEl && (bookingMetaEl.innerHTML = '');
          if (submitBtn) submitBtn.disabled = true;

          // refresh landing list
          const items2 = await loadReviews({ page: 1, limit: 6 });
          reviewsListEl && (reviewsListEl.innerHTML = items2
            .slice(0, 6)
            .map((r) => {
              const title = r?.title || 'Review';
              const comment = r?.comment || '';
              const rating = r?.rating ?? '—';
              const createdAt = r?.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
              const user = r?.user || {};
              const vendor = r?.vendor || {};
              const service = r?.service || {};
              return `
                <div class="col-12 col-md-6">
                  <div class="card card-glass p-3">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <div class="fw-bold">${escapeHtml(title)}</div>
                        <div class="small text-muted-soft">
                          ${escapeHtml(user?.firstName || '')} ${escapeHtml(user?.lastName || '')}
                          ${createdAt ? `• ${escapeHtml(createdAt)}` : ''}
                        </div>
                      </div>
                      <div class="text-warning fw-bold">${escapeHtml(String(rating))}★</div>
                    </div>
                    <div class="mt-2 text-muted-soft" style="white-space: pre-wrap;">${escapeHtml(comment)}</div>
                    <div class="small text-muted-soft mt-2">
                      Vendor: <span class="fw-bold">${escapeHtml(vendor?.businessName || '')}</span>
                      ${service?.serviceName ? `• Service: <span class="fw-bold">${escapeHtml(service.serviceName)}</span>` : ''}
                    </div>
                  </div>
                </div>
              `;
            })
            .join(''));
        } catch (err) {
          toast({ title: 'Failed to post', message: err?.message || 'Try again.', variant: 'danger' });
        }
      });

      setVisible(reviewsLoadingEl, false);
    } catch (e) {
      setVisible(reviewsLoadingEl, false);
      console.warn(e);
      if (reviewsListEl) reviewsListEl.innerHTML = `<div class="text-muted-soft small">Could not load reviews.</div>`;
      if (authzErrorEl) {
        authzErrorEl.textContent = e?.message || 'Failed';
        setVisible(authzErrorEl, true);
      }
      if (reviewCreateCard) setVisible(reviewCreateCard, false);
    }
  };

  run();
}

