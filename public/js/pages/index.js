function setAuthNav() {
  const link = document.getElementById('navAuthLink');
  if (!link) return;
  const token = localStorage.getItem('bme_token');
  if (!token) return;

  // Best effort: we don't know role yet without calling /me.
  // We'll send to profile page.
  link.href = 'profile.html';
  link.textContent = 'Dashboard';
}

async function loadHomeServices() {
  const grid = document.getElementById('homeServicesGrid');
  if (!grid) return;

  // Skeleton while loading
  grid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-lg-4';
    col.innerHTML = `
      <div class="card card-glass p-3 skeleton" style="height: 190px;"></div>
    `;
    grid.appendChild(col);
  }

  // Endpoint discovery: assume GET /api/v1/services exists and returns array.
  // We'll try common shapes.
  let data = [];
  try {
    const res = await apiFetch('/api/v1/services', { method: 'GET' });
    data = Array.isArray(res) ? res : (res?.services || res?.data || []);
  } catch (e) {
    // If backend responds differently, still render empty gracefully
    data = [];
  }

  grid.innerHTML = '';
  const top = data.slice(0, 6);

  if (!top.length) {
    const empty = document.createElement('div');
    empty.className = 'col-12';
    empty.innerHTML = `
      <div class="card card-glass p-4 text-center text-muted-soft">
        <div class="display-6 mb-2">No services found</div>
        <div class="small">Backend may be offline or response shape differs.</div>
      </div>
    `;
    grid.appendChild(empty);
    return;
  }

  for (const s of top) {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-lg-4';

    const id = s?._id || s?.id || '';
    const title = s?.name || s?.title || 'Service';
    const category = s?.category || s?.type || '';
    const location = s?.location || s?.city || '';
    const price = s?.price || s?.startingPrice || s?.amount || '';
    const vendor = s?.vendor?.name || s?.vendorName || s?.provider?.name || '';

    col.innerHTML = `
      <div class="card card-glass card-hover h-100 overflow-hidden">
        <div class="p-3">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="fw-bold">${title}</div>
              <div class="text-muted-soft small">${category ? category : 'Category'} ${location ? `• ${location}` : ''}</div>
            </div>
            <span class="badge text-bg-dark border" style="border-color: rgba(124,92,255,0.5) !important;">Popular</span>
          </div>
          <div class="mt-3">
            <div class="fs-5 fw-bold">${price ? formatMoneyNaira(price) : 'Contact for price'}</div>
            <div class="text-muted-soft small">Vendor: ${vendor || '—'}</div>
          </div>

          <div class="mt-3 d-flex gap-2">
            <a class="btn btn-soft w-100" href="service-details.html?id=${encodeURIComponent(id)}">View</a>
          </div>
        </div>
      </div>
    `;

    grid.appendChild(col);
  }
}

function initPreview() {
  const sk = document.getElementById('homePreviewSkeleton');
  if (!sk) return;
  sk.className = 'card card-glass p-3';
  sk.style.minHeight = '160px';
  sk.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div class="fw-bold">Today’s trending</div>
      <span class="badge badge-glow">Hot</span>
    </div>
    <div class="skeleton" style="height: 90px;"></div>
    <div class="text-muted-soft small mt-2">Request takes a few taps, vendors reply fast.</div>
  `;
}

function init() {
  document.getElementById('year').textContent = new Date().getFullYear();
  setAuthNav();
  initPreview();
  loadHomeServices();
}

document.addEventListener('DOMContentLoaded', init);

