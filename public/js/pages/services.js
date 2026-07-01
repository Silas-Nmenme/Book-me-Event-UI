import { apiFetch } from '../api.js';
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

function formatPrice(svc) {
  const price = typeof svc?.basePrice === 'number' ? svc.basePrice : Number(svc?.basePrice);
  if (!Number.isFinite(price)) return '—';
  const currency = svc?.priceCurrency || 'NGN';
  return `${currency} ${price.toLocaleString()}`;
}

function getPreselectServiceId() {
  return qs('preselectServiceId') || null;
}

function buildServiceCard(svc, { hideCreateRequest = false } = {}) {
  const id = svc?._id || svc?.id;

  const vendor = svc?.vendor;
  const vendorName = vendor?.businessName || 'Vendor';
  const category = svc?.serviceCategory || 'Service';
  const title = svc?.serviceName || 'Untitled';
  const image = Array.isArray(svc?.images) && svc.images[0] ? svc.images[0] : '';
  const price = formatPrice(svc);

  const href = `requests.html?prefillServiceId=${encodeURIComponent(id || '')}`;

  const createRequestHtml = hideCreateRequest
    ? ''
    : `<a class="btn btn-brand btn-sm" href="${href}">Create request</a>`;

  return `
    <div class="col-12 col-md-6">
      <div class="card card-glass p-3 h-100">
        <div class="d-flex gap-3">
          <div
            class="rounded"
            style="width:84px;height:84px;background: rgba(124,92,255,0.12);background-image:url('${image}');background-size:cover;background-position:center;"
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
          ${createRequestHtml}
          <button
            class="btn btn-soft btn-sm"
            type="button"
            data-action="loadServiceDetails"
            data-service-id="${escapeHtml(id || '')}"
          >Details</button>
        </div>
      </div>
    </div>
  `;
}

export async function initServicesPage({ me, role } = {}) {
  const shell = document.getElementById('servicesShell');
  const authzError = document.getElementById('authzError');
  const roleNotice = document.getElementById('roleNotice');
  const serviceList = document.getElementById('serviceList');
  const noServices = document.getElementById('noServices');

  const linkRequests = document.getElementById('linkRequests');
  const linkMessages = document.getElementById('linkMessages');
  const linkBookings = document.getElementById('linkBookings');

  if (!shell || !serviceList || !authzError) return;

  shell.classList.remove('d-none');

  const myRole = (role || qs('role') || 'USER').toString().toUpperCase();

  if (myRole === 'VENDOR') {
    linkRequests?.classList.remove('btn-soft');
    linkMessages?.classList.remove('btn-soft');
    linkBookings?.classList.remove('btn-soft');

    roleNotice?.classList.remove('d-none');
    if (roleNotice) roleNotice.textContent = 'Vendor mode: respond to incoming requests created from your services.';
  } else {
    roleNotice?.classList.remove('d-none');
    if (roleNotice) roleNotice.textContent = 'User mode: browse services, then create requests for a specific vendor.';
  }

  const btnGoCreateRequest = document.getElementById('btnGoCreateRequest');
  const btnGoIncoming = document.getElementById('btnGoIncoming');

  btnGoCreateRequest?.addEventListener('click', () => {
    window.location.href = 'requests.html';
  });

  btnGoIncoming?.addEventListener('click', () => {
    window.location.href = 'requests.html?status=pending';
  });

  serviceList.innerHTML = '';
  noServices?.classList.add('d-none');

  try {
    const res = await apiFetch('/api/v1/services', { method: 'GET' });
    const data = res?.data || res;
    const services = Array.isArray(data)
      ? data
      : data?.data || data?.services || data || [];

    if (!Array.isArray(services) || services.length === 0) {
      noServices?.classList.remove('d-none');
      return;
    }

    serviceList.innerHTML = services
      .map((s) => buildServiceCard(s, { hideCreateRequest: myRole === 'VENDOR' }))
      .join('');

    const preselectServiceId = getPreselectServiceId();
    if (preselectServiceId) {
      toast({ title: 'Request ready', message: `Selected service: ${preselectServiceId}`, variant: 'info' });
    }

    serviceList.querySelectorAll('[data-action="loadServiceDetails"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const serviceId = btn.getAttribute('data-service-id');
        if (!serviceId) return;
        toast({ title: 'Service details', message: `Service ID: ${serviceId}`, variant: 'info' });
      });
    });
  } catch (e) {
    authzError?.classList.remove('d-none');
    if (authzError) authzError.textContent = e?.message || 'Could not load services right now.';
  }
}

