function getStatusFilter() {
  const el = document.getElementById('filterStatus');
  return el ? el.value : '';
}

function setYear() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
}

function renderSkeleton() {
  const host = document.getElementById('requestsSkeleton');
  if (!host) return;

  host.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div');
    d.className = 'col-12';
    d.innerHTML = `
      <div class="card card-glass p-3 skeleton" style="min-height: 128px;"></div>
    `;
    host.appendChild(d);
  }
}

function statusPill(status) {
  const s = (status || '').toString().toUpperCase();
  if (s === 'ACCEPTED') return 'border-success';
  if (s === 'DECLINED') return 'border-danger';
  if (s === 'CANCELLED') return 'border-warning';
  return 'border-info';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

function requestCard(r, currentRole) {
  const id = r?._id || r?.id || '';
  const status = r?.status || 'PENDING';
  const serviceName = r?.service?.name || r?.service?.title || r?.service?.serviceName || r?.service || '';
  const vendorName = r?.vendor?.businessName || r?.vendor?.vendorBusinessName || r?.vendor?.name || r?.vendor || '';

  const userName = r?.user?.firstName || r?.user?.lastName
    ? `${r?.user?.firstName || ''} ${r?.user?.lastName || ''}`.trim()
    : (r?.user?.email || '—');

  const deadline = r?.responseDeadline ? formatDate(r.responseDeadline) : '';
  const createdAt = r?.createdAt ? formatDate(r.createdAt) : '';

  const isPending = status.toString().toUpperCase() === 'PENDING';
  const isAccepted = status.toString().toUpperCase() === 'ACCEPTED';
  const isDeclined = status.toString().toUpperCase() === 'DECLINED';

  const canVendorAct = currentRole === 'VENDOR' && isPending;
  const canUserCancel = currentRole === 'USER' && isPending;

  const btnAccept = canVendorAct
    ? `<button class="btn btn-success btn-sm" type="button" data-action="accept" data-id="${escapeHtml(id)}">Accept</button>`
    : '';

  const btnDecline = canVendorAct
    ? `<button class="btn btn-danger btn-sm" type="button" data-action="decline" data-id="${escapeHtml(id)}">Decline</button>`
    : '';

  const btnCancel = canUserCancel
    ? `<button class="btn btn-warning btn-sm" type="button" data-action="cancel" data-id="${escapeHtml(id)}">Cancel</button>`
    : '';

  // Optional chat deep-link: prefer vendor user id if present
  const vendorIdForChat = r?.vendor?.user || r?.vendor?._id || '';
  const chatHref = vendorIdForChat ? `messages.html?with=${encodeURIComponent(vendorIdForChat)}` : 'messages.html';

  return `
    <div class="col-12">
      <div class="card card-glass p-3 h-100 card-hover">
        <div class="d-flex align-items-start justify-content-between gap-3">
          <div>
            <div class="d-flex flex-wrap align-items-center gap-2">
              <span class="badge text-bg-dark border" style="border-color: rgba(124,92,255,0.5) !important;">Request</span>
              <span class="badge text-bg-dark border ${escapeHtml(statusPill(status))}" style="border-color: rgba(124,92,255,0.5) !important;">${escapeHtml(status)}</span>
            </div>
            <div class="fw-bold mt-2">${escapeHtml(serviceName || 'Service')}</div>
            <div class="text-muted-soft small">
              Vendor: ${escapeHtml(vendorName || '—')} ${deadline ? `• Deadline: ${escapeHtml(deadline)}` : ''}
            </div>
            ${createdAt ? `<div class="text-muted-soft small">Created: ${escapeHtml(createdAt)}</div>` : ''}

            ${r?.eventLocation ? `<div class="text-muted-soft small mt-1">📍 ${escapeHtml(r.eventLocation)}</div>` : ''}
            ${r?.eventDate ? `<div class="text-muted-soft small">📅 ${escapeHtml(formatDate(r.eventDate))}</div>` : ''}
          </div>

          <div class="text-end" style="min-width: 220px;">
            <div class="d-grid gap-2">
              ${btnAccept}
              ${btnDecline}
              ${btnCancel}
              <a class="btn btn-soft btn-sm" href="${escapeHtml(chatHref)}">Chat</a>
            </div>
          </div>
        </div>

        ${r?.notes ? `
          <div class="mt-3">
            <div class="text-muted-soft small mb-1">Notes</div>
            <div style="white-space: pre-wrap;">${escapeHtml(r.notes)}</div>
          </div>
        ` : ''}

        ${isAccepted ? `
          <div class="mt-3">
            <div class="text-muted-soft small">Status update</div>
            <div class="small">Request accepted. Proceed to booking when ready.</div>
          </div>
        ` : ''}

        ${isDeclined ? `
          <div class="mt-3">
            <div class="text-muted-soft small">Status update</div>
            <div class="small">Request declined by vendor.</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function fetchMe() {
  // auth.js does not expose /me; we'll call directly.
  return apiFetch('/api/v1/auth/me', { method: 'GET' });
}

async function fetchRequests({ status } = {}) {
  const url = status ? `/api/v1/requests?status=${encodeURIComponent(status)}` : '/api/v1/requests';
  return apiFetch(url, { method: 'GET' });
}

async function actOnRequest({ id, action }) {
  if (!id || !action) return;
  const endpoint = action === 'accept'
    ? `/api/v1/requests/${encodeURIComponent(id)}/accept`
    : action === 'decline'
      ? `/api/v1/requests/${encodeURIComponent(id)}/decline`
      : `/api/v1/requests/${encodeURIComponent(id)}/cancel`;

  return apiFetch(endpoint, { method: 'PUT', body: {} });
}

function bindActionHandlers() {
  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('button[data-action][data-id]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');

    try {
      setLoading(btn, true, 'Working...');
      await actOnRequest({ id, action });
      toast({ title: 'Updated', message: 'Request status updated successfully.', variant: 'success' });
      await load();
    } catch (err) {
      toast({ title: 'Action failed', message: err.message || 'Try again.', variant: 'danger' });
    } finally {
      setLoading(btn, false);
    }
  });
}

let myRole = '';

async function load() {
  const grid = document.getElementById('requestsGrid');
  const empty = document.getElementById('emptyState');
  if (!grid || !empty) return;

  renderSkeleton();
  grid.innerHTML = '';
  empty.style.display = 'none';

  const status = getStatusFilter();

  let me = null;
  try {
    me = await fetchMe();
    myRole = me?.role || me?.data?.role || '';
  } catch {
    // best effort: still allow load (backend already filters by role)
    myRole = '';
  }

  const res = await fetchRequests({ status });
  const list = res?.data || [];

  // remove skeleton
  const sk = document.getElementById('requestsSkeleton');
  if (sk) sk.innerHTML = '';

  if (!list.length) {
    empty.style.display = 'block';
    return;
  }

  for (const r of list) {
    grid.insertAdjacentHTML('beforeend', requestCard(r, myRole));
  }
}

function init() {
  setYear();
  setAuthNav();
  bindActionHandlers();

  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', () => load());

  const sel = document.getElementById('filterStatus');
  if (sel) sel.addEventListener('change', () => load());

  load().catch(() => {
    const empty = document.getElementById('emptyState');
    if (empty) empty.style.display = 'block';
    toast({ title: 'Failed to load requests', message: 'Check login/session and backend connectivity.', variant: 'danger' });
  });
}

document.addEventListener('DOMContentLoaded', init);

