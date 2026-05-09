function setAuthNav() {
  const link = document.getElementById('navAuthLink');
  if (!link) return;
  const token = localStorage.getItem('bme_token');
  if (!token) return;
  link.href = 'profile.html';
  link.textContent = 'Dashboard';
}

function getFilters() {
  return {
    category: document.getElementById('filterCategory').value,
    location: (document.getElementById('filterLocation').value || '').trim().toLowerCase(),
    maxPrice: document.getElementById('filterMaxPrice').value ? Number(document.getElementById('filterMaxPrice').value) : null,
  };
}

function applyFilters(services, filters) {
  return services.filter((s) => {
    const category = (s?.category || s?.type || '').toString().toLowerCase();
    const location = (s?.location || s?.city || '').toString().toLowerCase();
    const price = Number(s?.price || s?.startingPrice || s?.amount || NaN);

    if (filters.category) {
      if (!category.includes(filters.category.toLowerCase())) return false;
    }

    if (filters.location) {
      if (!location.includes(filters.location)) return false;
    }

    if (filters.maxPrice !== null && !Number.isNaN(price)) {
      if (price > filters.maxPrice) return false;
    }

    if (filters.maxPrice !== null && Number.isNaN(price)) {
      // If price not available, hide when maxPrice is set.
      return false;
    }

    return true;
  });
}

function renderSkeleton() {
  const host = document.getElementById('servicesSkeleton');
  if (!host) return;
  host.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-lg-4';
    col.innerHTML = `
      <div class="card card-glass p-3 skeleton" style="height: 210px;"></div>
    `;
    host.appendChild(col);
  }
}

function renderServices(services) {
  const grid = document.getElementById('servicesGrid');
  const empty = document.getElementById('emptyState');
  if (!grid || !empty) return;

  grid.innerHTML = '';
  empty.style.display = services.length ? 'none' : 'block';

  for (const s of services) {
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
              <div class="text-muted-soft small">${category || 'Category'} ${location ? `• ${location}` : ''}</div>
            </div>
            <span class="badge text-bg-dark border" style="border-color: rgba(124,92,255,0.5) !important;">Featured</span>
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

async function fetchServices() {
  // Best effort endpoint.
  const res = await apiFetch('/api/v1/services', { method: 'GET' });
  return Array.isArray(res) ? res : (res?.services || res?.data || []);
}

function populateCategories(services) {
  const sel = document.getElementById('filterCategory');
  if (!sel) return;

  const categories = new Set();
  for (const s of services) {
    const c = (s?.category || s?.type || '').toString().trim();
    if (c) categories.add(c);
  }

  const list = Array.from(categories).sort((a, b) => a.localeCompare(b));
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
}

async function init() {
  document.getElementById('year').textContent = new Date().getFullYear();
  setAuthNav();

  renderSkeleton();

  let all = [];
  try {
    all = await fetchServices();
  } catch (e) {
    all = [];
  }

  populateCategories(all);
  document.getElementById('servicesSkeleton').innerHTML = '';

  const apply = () => {
    const filters = getFilters();
    const filtered = applyFilters(all, filters);
    renderServices(filtered);
  };

  document.getElementById('filterCategory').addEventListener('change', apply);
  document.getElementById('filterLocation').addEventListener('input', apply);
  document.getElementById('filterMaxPrice').addEventListener('input', apply);
  document.getElementById('btnClearFilters').addEventListener('click', () => {
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterLocation').value = '';
    document.getElementById('filterMaxPrice').value = '';
    apply();
  });

  apply();
}

document.addEventListener('DOMContentLoaded', init);

