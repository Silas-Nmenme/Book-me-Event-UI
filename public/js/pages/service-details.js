function requireId() {
  const id = qs('id');
  return id;
}

function setYear() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
}

async function loadService(id) {
  const card = document.getElementById('serviceCard');
  if (!card) return;

  card.innerHTML = '<div class="skeleton p-3" style="height: 220px;"></div>';

  let s = null;
  try {
    // Attempt to load by ID; fallback to services list if needed.
    // Common guess: GET /api/v1/services/:id
    const res = await apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, { method: 'GET' });
    s = res?.service || res;
  } catch {
    try {
      const res = await apiFetch('/api/v1/services', { method: 'GET' });
      const arr = Array.isArray(res) ? res : (res?.services || res?.data || []);
      s = arr.find((x) => (x?._id || x?.id) === id) || null;
    } catch {
      s = null;
    }
  }

  if (!s) {
    card.innerHTML = `
      <div class="p-4">
        <div class="display-6 mb-2">Service not found</div>
        <div class="text-muted-soft small">Backend may not have this service or response shape differs.</div>
        <a class="btn btn-soft mt-3" href="services.html">Back to services</a>
      </div>
    `;
    return;
  }

  const title = s?.name || s?.title || 'Service';
  const category = s?.category || s?.type || '';
  const location = s?.location || s?.city || '';
  const description = s?.description || s?.details || '';
  const price = s?.price || s?.startingPrice || s?.amount || '';
  const vendorName = s?.vendor?.name || s?.vendorName || s?.provider?.name || '';
  const vendorId = s?.vendor?._id || s?.vendor?.id || s?.vendorId || '';

  document.getElementById('priceText').textContent = price ? formatMoneyNaira(price) : 'Contact for price';
  document.getElementById('vendorText').textContent = vendorName || '—';

  card.innerHTML = `
    <div class="d-flex align-items-start justify-content-between gap-3">
      <div>
        <div class="badge badge-glow mb-2">${category || 'Category'}</div>
        <h3 class="fw-bold mb-1">${title}</h3>
        <div class="text-muted-soft">📍 ${location || 'Location not specified'}</div>
      </div>
      <span class="badge text-bg-dark border" style="border-color: rgba(124,92,255,0.5) !important;">Top pick</span>
    </div>

    <hr style="border-color: rgba(255,255,255,0.12)" />

    <div class="row g-3">
      <div class="col-12 col-md-7">
        <div class="text-muted-soft small">About</div>
        <div class="mt-1">${description ? escapeHtml(description) : '<span class="text-muted-soft">No description provided.</span>'}</div>

        <div class="mt-4">
          <div class="text-muted-soft small mb-2">Highlights</div>
          <div class="d-flex flex-wrap gap-2">
            <span class="badge text-bg-dark border" style="border-color: rgba(124,92,255,0.45)">Fast response</span>
            <span class="badge text-bg-dark border" style="border-color: rgba(25,211,255,0.35)">Vendor chat</span>
            <span class="badge text-bg-dark border" style="border-color: rgba(45,212,191,0.35)">Booking ready</span>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-5">
        <div class="text-muted-soft small">Quick facts</div>
        <div class="mt-2">
          <div class="d-flex justify-content-between">
            <div class="text-muted-soft">Vendor</div>
            <div class="fw-bold">${vendorName || '—'}</div>
          </div>
          <div class="d-flex justify-content-between mt-2">
            <div class="text-muted-soft">Price</div>
            <div class="fw-bold">${price ? formatMoneyNaira(price) : '—'}</div>
          </div>
          <div class="d-flex justify-content-between mt-2">
            <div class="text-muted-soft">Category</div>
            <div class="fw-bold">${category || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind request action (best effort payload)
  const btn = document.getElementById('btnCreateRequest');
  btn.onclick = async () => {
    if (!getToken()) {
      window.location.href = 'auth-login.html';
      return;
    }

    // Backend request schema (src/controllers/requestController.js):
    // POST /api/v1/requests expects: { vendor, service, eventDate, eventLocation, eventDescription, guestCount, budgetAmount, notes, attachments }
    // Minimal best-effort mapping from this page.
    const payload = {
      vendor: vendorId || undefined,
      service: id,
      notes: `Requesting: ${title}`,
    };


    try {
      await apiFetch('/api/v1/requests', {
        method: 'POST',
        body: payload,
      });
      toast({ title: 'Request sent', message: 'Vendor will review and respond shortly.', variant: 'success' });
      window.location.href = 'requests.html';
    } catch (e) {
      toast({ title: 'Failed to send request', message: e.message || 'Please try again.', variant: 'danger' });
    }
  };

  // Chat link (may be handled by vendorId/userId later)
  const btnChat = document.getElementById('btnChat');
  if (btnChat) {
    // Keep existing page but add query so messages.js can prefill.
    if (vendorId) btnChat.href = `messages.html?with=${encodeURIComponent(vendorId)}`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

async function init() {
  setYear();
  const id = requireId();
  if (!id) {
    toast({ title: 'Missing id', message: 'No service id provided in the URL.', variant: 'warning' });
    return;
  }
  await loadService(id);
}

document.addEventListener('DOMContentLoaded', init);

