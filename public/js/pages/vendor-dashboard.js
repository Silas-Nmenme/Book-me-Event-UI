import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

const qs = (name) => new URLSearchParams(window.location.search).get(name);

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? '—';
}

function setPct(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  if (v === undefined || v === null || !Number.isFinite(v)) el.textContent = '—';
  else el.textContent = `${Math.round(v * 100)}%`;
}

function setVendorProfileAvatar(avatarEl, me) {
  if (!avatarEl) return;

  const getAvatarUrl = (m) =>
    m?.profilePicture ||
    m?.user?.profilePicture ||
    m?.vendor?.user?.profilePicture ||
    m?.vendor?.profilePicture ||
    null;

  const url = getAvatarUrl(me);
  if (url) {
    avatarEl.style.backgroundImage = `url(${url})`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    avatarEl.textContent = '';
    avatarEl.style.fontWeight = 'normal';
    return;
  }

  avatarEl.style.backgroundImage = '';
  avatarEl.textContent = (me?.firstName || me?.user?.firstName || 'BME').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
  avatarEl.style.background = 'rgba(124,92,255,0.12)';
  avatarEl.style.fontWeight = '900';
}

async function fetchVendorStats({ me, role }) {
  const myRole = (role || qs('role') || me?.role || 'USER').toString().toUpperCase();
  if (myRole !== 'VENDOR') return;

  // Ensure values for the dashboard strip always load.
  try {
    const [analyticsRes, slaRes] = await Promise.all([
      apiFetch('/api/v1/vendor/analytics', { method: 'GET' }),
      apiFetch('/api/v1/vendor/sla', { method: 'GET' }),

    ]);

    const analytics = analyticsRes?.data || analyticsRes;
    const sla = slaRes?.data || slaRes;

    // Map backend analytics to the dashboard strip.
    // Current backend vendor analytics endpoint only returns totalBookings + completedBookings.
    const totalBookings = analytics?.totalBookings ?? 0;
    const completedBookings = analytics?.completedBookings ?? 0;

    // Best-effort mapping until backend provides request states counts.
    // - Incoming requests / Accepted requests: currently approximated by totalBookings.
    // - Bookings pending: approximated by (totalBookings - completedBookings).
    setText('vStatRequests', totalBookings);
    setText('vStatAccepted', totalBookings);
    setText('vStatServices', '—');
    setText('vStatPendingBookings', Math.max(0, totalBookings - completedBookings));
    setText('vStatCompletedBookings', completedBookings);

    setPct('vStatBreachRate', sla?.breachRate);

    // NOTE: analytics endpoint only provides bookings counts. If you later add a more detailed
    // vendor stats endpoint (pending/accepted), wire these two fields accordingly.
  } catch (e) {
    // keep placeholders; don’t break vendor page
  }
}

async function listMyServices({ vendorId }) {
  if (vendorId) {
    const res = await apiFetch(`/api/v1/vendors/${encodeURIComponent(vendorId)}/services`, { method: 'GET' });
    const data = res?.data || res;
    return data?.data || data?.services || data || [];
  }
  const res = await apiFetch('/api/v1/services', { method: 'GET' });
  const data = res?.data || res;
  return Array.isArray(data) ? data : data?.data || data?.services || data || [];
}

function getMeVendorId(me) {
  return me?.vendor?._id || me?.vendorId || me?.vendor?.id || me?.vendor?._id || null;
}

function buildVendorServiceRow(svc) {
  const id = svc?._id || svc?.id || '';
  const category = svc?.serviceCategory || 'Service';
  const title = svc?.serviceName || 'Untitled';
  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">ID: ${escapeHtml(id)} • <span class="fw-semibold">${escapeHtml(category)}</span></div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-soft btn-sm" type="button" data-action="edit" data-id="${escapeHtml(id)}">Edit</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="delete" data-id="${escapeHtml(id)}">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function initVendorDashboard({ me, role } = {}) {
  // Avatar is handled in vendor-dashboard.html, but ensure it’s not blank if me changes shape.
  const avatarEl = document.getElementById('avatar');
  setVendorProfileAvatar(avatarEl, me);

  // Stats strip (show graceful loading placeholders)
  const vStatIds = [
    'vStatRequests',
    'vStatAccepted',
    'vStatServices',
    'vStatPendingBookings',
    'vStatCompletedBookings',
    'vStatBreachRate',
  ];
  vStatIds.forEach((id) => setText(id, '—'));
  const breachRateEl = document.getElementById('vStatBreachRate');
  if (breachRateEl) breachRateEl.textContent = '—';

  fetchVendorStats({ me, role });

  // --- Service CRUD UI (existing file in repo may differ; keep minimal and non-breaking) ---

  const shell = document.getElementById('vendorServicesShell');
  const serviceList = document.getElementById('vendorServiceList');
  const noServices = document.getElementById('vendorNoServices');
  const roleNotice = document.getElementById('vendorRoleNotice');
  const authzError = document.getElementById('vendorAuthzError');
  if (!shell || !serviceList || !noServices) return;

  const myRole = (role || qs('role') || me?.role || 'USER').toString().toUpperCase();
  if (myRole !== 'VENDOR') {
    shell.classList.add('d-none');
    authzError?.classList.remove('d-none');
    if (authzError) authzError.textContent = 'Service management is available for vendors only.';
    return;
  }

  roleNotice?.classList.add('d-none');
  const btnAdd = document.getElementById('btnVendorAddService');
  const formEl = document.getElementById('vendorServiceForm');
  const modeInput = document.getElementById('vendorServiceMode');
  const serviceIdInput = document.getElementById('vendorServiceId');
  const inpServiceName = document.getElementById('vendorServiceName');
  const inpServiceCategory = document.getElementById('vendorServiceCategory');
  const inpDescription = document.getElementById('vendorServiceDescription');
  const inpBasePrice = document.getElementById('vendorBasePrice');
  const inpPriceCurrency = document.getElementById('vendorPriceCurrency');
  const inpImages = document.getElementById('vendorImages');
  const inpImagesFiles = document.getElementById('vendorImagesFiles');
  const btnCancel = document.getElementById('btnVendorCancelEdit');
  const btnSubmit = document.getElementById('btnVendorSubmit');

  const hideForm = () => formEl?.classList.add('d-none');
  const showForm = () => formEl?.classList.remove('d-none');

  const isVerified = !!(me?.vendor?.isVerified ?? me?.isVerified ?? me?.vendorIsVerified ?? me?.vendor?.kycVerified ?? me?.kycVerified);
  const kycBadgeEl = document.getElementById('vendorKycBadge');
  if (kycBadgeEl) {
    if (isVerified) {
    kycBadgeEl.textContent = 'KYC Verified';
    kycBadgeEl.classList.remove('bme-pill--pending');
    // CSS token in styles.css is bme-pill--confirmed
    kycBadgeEl.classList.add('bme-pill--confirmed');
  } else {
      kycBadgeEl.textContent = 'KYC Not Verified';
      kycBadgeEl.classList.remove('bme-pill--verified');
      kycBadgeEl.classList.add('bme-pill--pending');
    }
  }

  if (!isVerified) {
    roleNotice?.classList.remove('d-none');
    if (roleNotice) roleNotice.textContent = 'Your vendor account is not verified by admin yet. Service creation is locked until verification.';
    if (btnAdd) btnAdd.disabled = true;
    hideForm();
  }

  const vendorId = getMeVendorId(me);
  let allServices = [];

  async function load() {
    serviceList.innerHTML = '';
    noServices?.classList.add('d-none');

    try {
      allServices = await listMyServices({ vendorId });
      const myServices = Array.isArray(allServices) ? allServices : [];

      if (!myServices.length) {
        noServices?.classList.remove('d-none');
        return;
      }

      serviceList.innerHTML = myServices.map(buildVendorServiceRow).join('');

      serviceList.querySelectorAll('[data-action]')?.forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          if (!id) return;

          if (action === 'delete') {
            const ok = window.confirm('Delete this service?');
            if (!ok) return;
            try {
              await apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
              toast({ title: 'Deleted', message: 'Service deleted successfully.', variant: 'success' });
              await load();
            } catch (e) {
              toast({ title: 'Delete failed', message: e?.message || 'Try again.', variant: 'danger' });
            }
          }
        });
      });
    } catch (e) {
      authzError?.classList.remove('d-none');
      if (authzError) authzError.textContent = e?.message || 'Failed to load your services.';
    }
  }

  // Don’t break existing HTML; only hook minimal handlers if form exists.
  if (btnAdd && formEl && modeInput && serviceIdInput && inpServiceName && inpServiceCategory && inpDescription && inpBasePrice && inpPriceCurrency) {
    btnAdd.addEventListener('click', () => {
      const isVerifiedNow = !!(me?.vendor?.isVerified ?? me?.isVerified ?? me?.vendorIsVerified);
      if (!isVerifiedNow) {
        toast({ title: 'Verification required', message: 'Admin must verify your KYC before you can create services.', variant: 'warning' });
        return;
      }
      modeInput.value = 'create';
      serviceIdInput.value = '';
      inpServiceName.value = '';
      inpServiceCategory.value = '';
      inpDescription.value = '';
      inpBasePrice.value = '';
      inpPriceCurrency.value = 'NGN';
      if (inpImages) inpImages.value = '';
      hideForm();
      showForm();
    });
  }

  if (formEl) {
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const mode = (modeInput?.value || 'create').toLowerCase();
        const id = serviceIdInput?.value;
        const fd = new FormData();
        fd.append('serviceName', inpServiceName.value.trim());
        fd.append('serviceCategory', inpServiceCategory.value.trim());
        fd.append('description', inpDescription.value.trim());
        fd.append('basePrice', inpBasePrice.value.trim());
        fd.append('priceCurrency', inpPriceCurrency.value.trim() || 'NGN');

        const files = inpImagesFiles?.files ? Array.from(inpImagesFiles.files) : [];
        for (const file of files) fd.append('images', file);

        if (mode === 'create') {
          await apiFetch('/api/v1/services', { method: 'POST', body: fd });
          toast({ title: 'Created', message: 'Service created successfully.', variant: 'success' });
        } else {
          await apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, { method: 'PUT', body: fd });
          toast({ title: 'Updated', message: 'Service updated successfully.', variant: 'success' });
        }

        if (inpImagesFiles) inpImagesFiles.value = '';
        hideForm();
        await load();
      } catch (err) {
        toast({ title: 'Save failed', message: err?.message || 'Try again.', variant: 'danger' });
      }
    });
  }

  if (btnCancel && formEl) {
    btnCancel.addEventListener('click', () => {
      hideForm();
    });
  }

  hideForm();
  await load();
}

