import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = {
      '&': '&amp;',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": '&#039;',
    };
    return m[c] || c;
  });
}

function formatPrice(svc) {
  const price =
    typeof svc?.basePrice === 'number' ? svc.basePrice : Number(svc?.basePrice);
  if (!Number.isFinite(price)) return '—';
  const currency = svc?.priceCurrency || 'NGN';
  return `${currency} ${price.toLocaleString()}`;
}

function buildServiceCard(svc) {
  const id = svc?._id || svc?.id;
  const vendorName = svc?.vendor?.businessName || svc?.vendor?.businessName || 'Vendor';
  const category = svc?.serviceCategory || 'Service';
  const title = svc?.serviceName || 'Untitled';
  const image = Array.isArray(svc?.images) && svc.images[0] ? svc.images[0] : '';
  const price = formatPrice(svc);

  return `
    <div class="col-12 col-md-6">
      <div class="card card-glass p-3 h-100">
        <div class="d-flex gap-3">
          <div
            class="rounded"
            style="width:84px;height:84px;background: rgba(124,92,255,0.12);background-image:url('${escapeHtml(
              image
            )}');background-size:cover;background-position:center;"
            aria-hidden="true"
          ></div>
          <div class="flex-grow-1">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div class="fw-bold">${escapeHtml(title)}</div>
              <span class="badge text-bg-secondary">${escapeHtml(category)}</span>
            </div>
            <div class="small text-muted-soft mt-1">${escapeHtml(vendorName)}</div>
            <div class="small mt-2"><strong>Price:</strong> ${escapeHtml(price)}</div>
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <a class="btn btn-brand btn-sm" href="user-request.html?serviceId=${encodeURIComponent(
            id
          )}">Create request</a>
          <a class="btn btn-soft btn-sm" href="services.html?preselectServiceId=${encodeURIComponent(
            id
          )}">Details</a>
        </div>
      </div>
    </div>
  `;
}

export async function initUserServicePage({ role } = {}) {
  const shell = document.getElementById('servicesShell');
  const serviceList = document.getElementById('serviceList');
  const noServices = document.getElementById('noServices');
  const authzError = document.getElementById('authzError');

  if (!shell || !serviceList) return;

  const myRole = (role || qs('role') || 'USER').toString().toUpperCase();
  if (myRole !== 'USER') {
    authzError?.classList.remove('d-none');
    if (authzError)
      authzError.textContent = 'This page is for users.';
    return;
  }

  shell.classList.remove('d-none');
  authzError?.classList.add('d-none');

  serviceList.innerHTML = '';
  noServices?.classList.add('d-none');

  try {
    const res = await apiFetch('/api/v1/services?limit=50', { method: 'GET' });
    const data = res?.data || res;
    const services = Array.isArray(data) ? data : data?.data || data?.services || [];

    if (!Array.isArray(services) || services.length === 0) {
      noServices?.classList.remove('d-none');
      return;
    }

    serviceList.innerHTML = services.map((s) => buildServiceCard(s)).join('');
  } catch (e) {
    if (authzError) {
      authzError.classList.remove('d-none');
      authzError.textContent = e?.message || 'Could not load services.';
    }
    toast({ title: 'Load failed', message: e?.message || 'Try again.', variant: 'danger' });
  }
}

