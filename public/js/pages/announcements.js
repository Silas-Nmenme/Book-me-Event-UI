import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function escapeHtml(s) {
  return (s ?? '')
    .toString()
    .replace(/[&<>"']/g, (c) => {
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

function renderAnnouncementItem(a) {
  const title = escapeHtml(a?.title || 'Announcement');
  const message = escapeHtml(a?.message || '');
  const date = a?.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—';
  return `
    <div class="col-12">
      <div class="card card-glass p-3">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${title}</div>
            <div class="small text-muted-soft mt-1">${escapeHtml(date)}</div>
          </div>
        </div>
        <div class="text-muted-soft mt-2" style="white-space: pre-wrap;">${message}</div>
      </div>
    </div>
  `;
}

function renderBellItem(a) {
  const title = escapeHtml(a?.title || 'Announcement');
  const date = a?.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—';
  const message = escapeHtml(a?.message || '');
  const preview = message.length > 80 ? `${message.slice(0, 80)}…` : message;

  return `
    <div class="dropdown-item-text">
      <div class="fw-bold" style="line-height:1.15;">${title}</div>
      <div class="small text-muted-soft mt-1" style="white-space:normal;">${preview}</div>
      <div class="small text-muted-soft mt-1">${escapeHtml(date)}</div>
    </div>
  `;
}

function setupBellUI(items) {
  const listEl = document.getElementById('announcementBellList');
  const emptyEl = document.getElementById('announcementBellEmpty');
  const dotEl = document.getElementById('announcementBellDot');
  if (!listEl) return;

  const safeItems = Array.isArray(items) ? items : [];
  listEl.innerHTML = '';

  if (!safeItems.length) {
    emptyEl?.classList.remove('d-none');
    dotEl && (dotEl.style.display = 'none');
    return;
  }

  emptyEl?.classList.add('d-none');
  if (dotEl) {
    dotEl.textContent = String(Math.min(99, safeItems.length));
    dotEl.style.display = 'inline-block';
  }

  // Show latest up to 5 in the dropdown preview.
  const previewItems = safeItems.slice(0, 5);
  listEl.innerHTML = previewItems.map(renderBellItem).join('');
}

export async function initAnnouncements({ role } = {}) {
  const shell = document.getElementById('announcementsShell');
  const listEl = document.getElementById('announcementsList');
  const emptyEl = document.getElementById('announcementsEmpty');

  // Support two UI modes:
  // 1) Full announcements list (dashboard page)
  // 2) Bell dropdown preview (header)
  const hasListUI = !!shell && !!listEl;

  if (!hasListUI) {
    // Still attempt to fill bell UI if present.
    try {
      const res = await apiFetch('/api/v1/announcements?page=1&limit=5', { method: 'GET' });
      const data = res?.data || res;
      const items = Array.isArray(data) ? data : data?.data || data?.items || [];
      setupBellUI(items);
    } catch {
      // Ignore bell failures.
    }
    return;
  }

  shell.classList.remove('d-none');
  listEl.innerHTML = '';
  emptyEl?.classList.add('d-none');

  try {
    const page = 1;
    const limit = 10;
    const res = await apiFetch(`/api/v1/announcements?page=${page}&limit=${limit}`, { method: 'GET' });
    const data = res?.data || res;
    const items = Array.isArray(data) ? data : data?.data || data?.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      emptyEl?.classList.remove('d-none');
      setupBellUI([]);
      return;
    }

    listEl.innerHTML = items.map(renderAnnouncementItem).join('');
    setupBellUI(items);
  } catch (e) {
    // Don’t break dashboard; just hide.
    // eslint-disable-next-line no-console
    console.error('Failed to load announcements', e);
    toast({ title: 'Announcements failed', message: e?.message || 'Try again.', variant: 'danger' });
    shell.classList.add('d-none');
  }
}


