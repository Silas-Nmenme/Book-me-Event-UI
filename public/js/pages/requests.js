import { apiFetch, fetchMe, logoutUser, clearToken, getRequests, acceptRequest, declineRequest, cancelRequest } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function statusLabel(status) {
  const s = (status || '').toString().toLowerCase();
  if (s === 'pending') return { text: 'Pending', variant: 'warning' };
  if (s === 'accepted') return { text: 'Accepted', variant: 'success' };
  if (s === 'declined') return { text: 'Declined', variant: 'danger' };
  if (s === 'canceled') return { text: 'Canceled', variant: 'secondary' };
  if (s === 'completed') return { text: 'Completed', variant: 'success' };
  return { text: status || '—', variant: 'secondary' };
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

function buildCard(req) {
  const id = req?._id || req?.id;
  const title = req?.title || req?.serviceName || req?.eventType || `Request ${id || ''}`.trim();
  const { text, variant } = statusLabel(req?.status);
  const createdAt = req?.createdAt ? new Date(req.createdAt).toLocaleString() : '';

  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(title)}</div>
            <div class="small text-muted-soft">ID: ${escapeHtml(id || '—')}${createdAt ? ` • ${escapeHtml(createdAt)}` : ''}</div>
          </div>
          <div>
            <span class="badge text-bg-${variant}">${escapeHtml(text)}</span>
          </div>
        </div>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <button class="btn btn-soft btn-sm" data-action="openMessages" type="button" data-id="${escapeHtml(id || '')}">Message</button>
          <button class="btn btn-soft btn-sm" data-action="viewBookings" type="button" data-id="${escapeHtml(id || '')}">Bookings</button>
          <button class="btn btn-soft btn-sm" data-action="cancelRequest" type="button" data-id="${escapeHtml(id || '')}">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

export async function initRequestsPage({ me, role } = {}) {
  const shell = document.getElementById('requestsShell');
  const roleNotice = document.getElementById('roleNotice');
  const authzError = document.getElementById('authzError');
  const requestList = document.getElementById('requestList');
  const noRequests = document.getElementById('noRequests');

  const btnCreateRequest = document.getElementById('btnCreateRequest');

  const myRole = (role || qs('role') || 'USER').toString().toUpperCase();

  shell?.classList.remove('d-none');

  if (roleNotice) {
    if (myRole === 'VENDOR') {
      roleNotice.classList.remove('d-none');
      roleNotice.textContent = 'Vendor mode: you can accept/decline incoming requests (if allowed by backend).';
    } else {
      roleNotice.classList.remove('d-none');
      roleNotice.textContent = 'User mode: create requests and track vendor responses.';
    }
  }

  btnCreateRequest?.addEventListener('click', () => {
    // Minimal UX: create request payload via prompt.
    const title = window.prompt('Request title (e.g., Wedding DJ, Catering, Photography):');
    if (!title) return;
    const eventDate = window.prompt('Event date (YYYY-MM-DD) (optional):') || undefined;
    const payload = { title, eventDate };
    (async () => {
      try {
        await apiFetch('/api/v1/requests', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Created', message: 'Your request was submitted.', variant: 'success' });
        window.location.reload();
      } catch (e) {
        toast({ title: 'Create failed', message: e?.message || 'Try again.', variant: 'danger' });
      }
    })();
  });

  const status = qs('status') || undefined;

  async function load() {
    requestList.innerHTML = '';
    noRequests?.classList.add('d-none');
    try {
      const res = await getRequests({ status, page: 1, limit: 20 });
      const data = res?.data || res;
      const items = data?.results || data?.requests || data?.items || data || [];

      if (!Array.isArray(items) || items.length === 0) {
        noRequests?.classList.remove('d-none');
        return;
      }

      requestList.innerHTML = items.map((r) => buildCard(r)).join('');

      requestList.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');

          if (!id) return;

          if (action === 'openMessages') {
            // Requires partner userId; backend model may allow conversation by request.
            // Minimal UX: open messages with partner unknown.
            window.location.href = `messages.html?requestId=${encodeURIComponent(id)}`;
            return;
          }

          if (action === 'viewBookings') {
            window.location.href = `bookings.html?requestId=${encodeURIComponent(id)}`;
            return;
          }

          if (action === 'cancelRequest') {
            try {
              await cancelRequest(id);
              toast({ title: 'Canceled', message: 'Request canceled.', variant: 'success' });
              window.location.reload();
            } catch (e) {
              toast({ title: 'Cancel failed', message: e?.message || 'Try again.', variant: 'danger' });
            }
          }
        });
      });
    } catch (e) {
      authzError?.classList.remove('d-none');
      if (authzError) authzError.textContent = e?.message || 'Failed to load requests.';
    }
  }

  await load();

  // Vendor accept/decline buttons (if we render them later)
  // Reserved: backend may provide request actions via role.
}

