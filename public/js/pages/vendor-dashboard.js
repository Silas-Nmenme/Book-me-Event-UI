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

function normalizeCurrency(svc) {
  return svc?.priceCurrency || 'NGN';
}

function formatPrice(svc) {
  const price =
    typeof svc?.basePrice === 'number' ? svc.basePrice : Number(svc?.basePrice);
  if (!Number.isFinite(price)) return '—';
  const currency = normalizeCurrency(svc);
  return `${currency} ${price.toLocaleString()}`;
}

function buildVendorServiceRow(svc) {
  const id = svc?._id || svc?.id || '';
  const category = svc?.serviceCategory || 'Service';
  const title = svc?.serviceName || 'Untitled';
  const price = formatPrice(svc);
  const status = svc?.availabilityStatus || 'AVAILABLE';

  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">
              ID: ${escapeHtml(id)} • <span class="fw-semibold">${escapeHtml(category)}</span>
            </div>
            <div class="small mt-1">Price: <strong>${escapeHtml(price)}</strong></div>
            <div class="small">Status: ${escapeHtml(status)}</div>
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

async function listMyServices({ vendorId } = {}) {
  // Better: use vendor-specific endpoint if we can.
  if (vendorId) {
    const res = await apiFetch(`/api/v1/vendors/${encodeURIComponent(vendorId)}/services`, { method: 'GET' });
    const data = res?.data || res;
    return data?.data || data?.services || data || [];
  }

  // Fallback: public services listing (then client-side filtering may be incomplete).
  const res = await apiFetch('/api/v1/services', { method: 'GET' });
  const data = res?.data || res;
  const services = Array.isArray(data) ? data : data?.data || data?.services || data || [];
  if (Array.isArray(services)) return services;
  if (Array.isArray(data)) return data;
  return [];
}

function getMeVendorId(me) {
  // Most common shape from auth/me is a user object with related vendor.
  return (
    me?.vendor?._id ||
    me?.vendorId ||
    me?.vendor?._id ||
    me?.vendor?.id ||
    null
  );
}


function getServiceFormPayload({ mode, values }) {
  const {
    serviceName,
    serviceCategory,
    description,
    basePrice,
    priceCurrency,
    images,
  } = values;

  const payload = {
    serviceName: serviceName || undefined,
    serviceCategory: serviceCategory || undefined,
    description: description || undefined,
    basePrice: basePrice !== '' && basePrice !== null && basePrice !== undefined ? Number(basePrice) : undefined,
    priceCurrency: priceCurrency || undefined,
    images: images && images.length ? images : undefined,
  };

  // For update/create payload we just send what we have.
  // Backend uses runValidators: true on update.
  return payload;
}

export async function initVendorDashboard({ me, role } = {}) {
  const shell = document.getElementById('vendorServicesShell');
  const serviceList = document.getElementById('vendorServiceList');
  const noServices = document.getElementById('vendorNoServices');
  const roleNotice = document.getElementById('vendorRoleNotice');

  const authzError = document.getElementById('vendorAuthzError');

  const btnAdd = document.getElementById('btnVendorAddService');
  const btnCancel = document.getElementById('btnVendorCancelEdit');

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


  if (!shell || !serviceList || !formEl) return;

  const myRole = (role || qs('role') || me?.role || 'USER').toString().toUpperCase();

  if (myRole !== 'VENDOR') {
    shell.classList.add('d-none');
    authzError?.classList.remove('d-none');
    if (authzError) authzError.textContent = 'Service management is available for vendors only.';
    return;
  }

  roleNotice?.classList.add('d-none');

  // Basic UI: we store all services client-side.
  let allServices = [];

  function resetForm() {
    modeInput.value = 'create';
    serviceIdInput.value = '';

    inpServiceName.value = '';
    inpServiceCategory.value = '';
    inpDescription.value = '';
    inpBasePrice.value = '';
    inpPriceCurrency.value = 'NGN';
    inpImages.value = '';

    btnAdd.innerHTML = 'Create service';
  }

  function showForm() {
    formEl.classList.remove('d-none');
  }

  function hideForm() {
    formEl.classList.add('d-none');
  }

  function parseImages(imagesRaw) {
    // Backwards compatible: accept comma-separated URLs if provided.
    const arr = (imagesRaw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return arr;
  }

  function getSelectedImageFiles() {
    const files = inpImagesFiles?.files;
    if (!files || files.length === 0) return [];
    return Array.from(files);
  }

  async function uploadSelectedImages() {
    const files = getSelectedImageFiles();
    if (!files.length) return [];

    const urls = [];

    for (const file of files) {
      const fd = new FormData();
      fd.append('image', file);

      // Uses existing generic upload route (Cloudinary) for images.
      const res = await apiFetch('/api/v1/uploads/generic', {
        method: 'POST',
        body: fd,
      });

      const data = res?.data || res;
      if (data?.url) urls.push(data.url);
    }

    return urls;
  }


  async function load() {
    serviceList.innerHTML = '';
    noServices?.classList.add('d-none');

    try {
      const myVendorId = getMeVendorId(me);
      allServices = await listMyServices({ vendorId: myVendorId });

      const myServices = allServices;

      if (!Array.isArray(myServices) || myServices.length === 0) {
        noServices?.classList.remove('d-none');
        return;
      }

      serviceList.innerHTML = myServices
        .map(buildVendorServiceRow)
        .join('');


      serviceList
        .querySelectorAll('[data-action]')
        .forEach((btn) => {
          btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            if (!id) return;

            if (action === 'edit') {
              const svc = allServices.find(
                (s) => (s?._id || s?.id || '').toString() === id.toString()
              );
              if (!svc) {
                toast({ title: 'Not found', message: 'Could not load service to edit.', variant: 'danger' });
                return;
              }

              modeInput.value = 'update';
              serviceIdInput.value = id;

              inpServiceName.value = svc?.serviceName || '';
              inpServiceCategory.value = svc?.serviceCategory || '';
              inpDescription.value = svc?.description || '';
              inpBasePrice.value =
                svc?.basePrice !== undefined && svc?.basePrice !== null
                  ? String(svc.basePrice)
                  : '';
              inpPriceCurrency.value = svc?.priceCurrency || 'NGN';
              inpImages.value = Array.isArray(svc?.images)
                ? svc.images.join(',')
                : '';

              btnAdd.innerHTML = 'Update service';
              showForm();
              window.scrollTo({ top: formEl.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
              return;
            }

            if (action === 'delete') {
              const ok = window.confirm('Delete this service?');
              if (!ok) return;

              try {
                await apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, {
                  method: 'DELETE',
                });
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

  btnAdd?.addEventListener('click', () => {
    resetForm();
    showForm();
    window.scrollTo({ top: formEl.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  });

  btnCancel?.addEventListener('click', () => {
    resetForm();
    hideForm();
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    const mode = (modeInput.value || 'create').toLowerCase();
    const id = serviceIdInput.value;

    const images = parseImages(inpImages.value);

    // For create flow, prefer uploaded images.
    const values = {

      serviceName: inpServiceName.value.trim(),
      serviceCategory: inpServiceCategory.value.trim(),
      description: inpDescription.value.trim(),
      basePrice: inpBasePrice.value.trim(),
      priceCurrency: inpPriceCurrency.value.trim(),
      images,
    };

    if (!values.serviceName) {
      toast({ title: 'Missing name', message: 'Service name is required.', variant: 'warning' });
      return;
    }

    if (!values.serviceCategory) {
      toast({ title: 'Missing category', message: 'Service category is required.', variant: 'warning' });
      return;
    }

    if (!values.description) {
      toast({ title: 'Missing description', message: 'Description is required.', variant: 'warning' });
      return;
    }

    if (values.basePrice === '' || !Number.isFinite(Number(values.basePrice))) {
      toast({ title: 'Invalid price', message: 'Base price must be a number.', variant: 'warning' });
      return;
    }

    try {
      const selectedFiles = getSelectedImageFiles();

      // Always upload+create in a single multipart request so the backend
      // can accept images via `upload.array('images', 6)`.
      // For updates, do the same with PUT.
      if (mode === 'create') {
        const fd = new FormData();
        fd.append('serviceName', values.serviceName);
        fd.append('serviceCategory', values.serviceCategory);
        fd.append('description', values.description);
        fd.append('basePrice', values.basePrice);
        fd.append('priceCurrency', values.priceCurrency || 'NGN');

        for (const file of selectedFiles) {
          fd.append('images', file);
        }

        await apiFetch('/api/v1/services', {
          method: 'POST',
          body: fd,
        });

        toast({ title: 'Created', message: 'Service created successfully.', variant: 'success' });
      } else {
        if (!id) throw new Error('Missing service id for update.');

        const fd = new FormData();
        fd.append('serviceName', values.serviceName);
        fd.append('serviceCategory', values.serviceCategory);
        fd.append('description', values.description);
        fd.append('basePrice', values.basePrice);
        fd.append('priceCurrency', values.priceCurrency || 'NGN');

        for (const file of selectedFiles) {
          fd.append('images', file);
        }

        await apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: fd,
        });

        toast({ title: 'Updated', message: 'Service updated successfully.', variant: 'success' });
      }

      // Clear file input after submit.
      if (inpImagesFiles) inpImagesFiles.value = '';
      resetForm();
      hideForm();
      await load();
    } catch (e) {
      toast({ title: 'Save failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  });

  resetForm();
  hideForm();
  await load();
}

