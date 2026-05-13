import { apiFetch, acceptRequest, declineRequest } from '../api.js';
import { toast } from '../ui.js';

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

function statusLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'pending') return { text: 'Pending', variant: 'warning' };
  if (s === 'accepted') return { text: 'Accepted', variant: 'success' };
  if (s === 'declined') return { text: 'Declined', variant: 'danger' };
  if (s === 'canceled' || s === 'cancelled') return { text: 'Cancelled', variant: 'secondary' };
  if (s === 'completed') return { text: 'Completed', variant: 'success' };
  return { text: status || '—', variant: 'secondary' };
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

function normalizeReqStatus(s) {
  const v = (s ?? '').toString().toLowerCase();
  if (v === 'cancelled') return 'canceled';
  return v;
}

function buildRequestCard(req, { myRole } = {}) {
  const id = req?._id || req?.id;
  const title =
    req?.service?.serviceName || req?.service?.title ||
    req?.service?.name || req?.eventDescription || `Request ${id || ''}`;

  const normalizedStatus = req?.status ? normalizeReqStatus(req.status) : req?.status;
  const { text, variant } = statusLabel(normalizedStatus);

  const createdAt = req?.createdAt ? new Date(req.createdAt).toLocaleString() : '';

  const isPending = normalizedStatus?.toString?.().toLowerCase?.() === 'pending';
  const myRoleNorm = (myRole || '').toString().toUpperCase();

  const userName = req?.user
    ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim()
    : req?.user?.name || req?.requestedByName || '';

  // messages.html backend expects conversation/userId, not requestId
  // For vendor incoming requests, partner is the request.user
  const partnerUserId = req?.user?._id || req?.user?.id || '';

  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">
              ID: ${escapeHtml(id || '—')}${createdAt ? ` • ${escapeHtml(createdAt)}` : ''}
            </div>
            <div class="small mt-1"><strong>Requested by:</strong> ${escapeHtml(userName || '—')}</div>
            <div class="small mt-1"><strong>Event date:</strong> ${escapeHtml(formatDate(req?.eventDate))}</div>
            <div class="small"><strong>Location:</strong> ${escapeHtml(req?.eventLocation || '—')}</div>
          </div>
          <div>
            <span class="badge text-bg-${variant}">${escapeHtml(text)}</span>
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <a class="btn btn-soft btn-sm" href="messages.html?userId=${encodeURIComponent(
            partnerUserId
          )}">Message ${escapeHtml(userName || '')}</a>
          <a class="btn btn-soft btn-sm" href="bookings.html?requestId=${encodeURIComponent(
            id
          )}">Bookings</a>

          ${myRoleNorm === 'VENDOR' && isPending ? `
            <button class="btn btn-success btn-sm" type="button" data-action="accept" data-id="${escapeHtml(id || '')}">Accept</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="decline" data-id="${escapeHtml(id || '')}">Decline</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

export async function initVendorServicePage({ role } = {}) {
  const shell = document.getElementById('incomingShell');
  const authzError = document.getElementById('authzError');
  const requestList = document.getElementById('requestList');
  const noRequests = document.getElementById('noRequests');
  const btnShowIncoming = document.getElementById('btnShowIncoming');

  if (!shell || !requestList || !authzError) return;

  const myRole = (role || 'VENDOR').toString().toUpperCase();

  if (myRole !== 'VENDOR') {
    shell.classList.add('d-none');
    authzError.classList.remove('d-none');
    authzError.textContent = 'Incoming requests are available for vendors only.';
    return;
  }

  btnShowIncoming?.addEventListener('click', () => {
    shell.classList.remove('d-none');
  });

  // Ensure request.user is present by using backend-populated data (it should be)
  // but we also guard message link when partnerUserId is missing.

  async function load() {
    requestList.innerHTML = '';
    noRequests?.classList.add('d-none');

    try {
      // Vendor: backend already filters by vendor in getRequests when role is VENDOR.
      const res = await apiFetch('/api/v1/requests?status=PENDING&page=1&limit=50', {
        method: 'GET',
      });
      const data = res?.data || res;
      const items = Array.isArray(data) ? data : data?.data || data?.requests || data || [];

      const list = Array.isArray(items) ? items : [];

      if (!list.length) {
        noRequests?.classList.remove('d-none');
        shell.classList.remove('d-none');
        return;
      }

      requestList.innerHTML = list.map((r) => buildRequestCard(r, { myRole })).join('');

      requestList.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          if (!id || !action) return;

          try {
            if (action === 'accept') {
              await acceptRequest(id);
              toast({ title: 'Accepted', message: 'Request accepted.', variant: 'success' });
            } else if (action === 'decline') {
              await declineRequest(id);
              toast({ title: 'Declined', message: 'Request declined.', variant: 'danger' });
            }
            await load();
          } catch (e) {
            toast({ title: 'Action failed', message: e?.message || 'Try again.', variant: 'danger' });
          }
        });
      });
    } catch (e) {
      authzError.classList.remove('d-none');
      authzError.textContent = e?.message || 'Failed to load incoming requests.';
    }
  }

  shell.classList.remove('d-none');
  await load();
}

