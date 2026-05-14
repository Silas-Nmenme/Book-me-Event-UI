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

export async function initAnnouncements({ role } = {}) {
  const shell = document.getElementById('announcementsShell');
  const listEl = document.getElementById('announcementsList');
  const emptyEl = document.getElementById('announcementsEmpty');
  if (!shell || !listEl) return;

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
      return;
    }

    listEl.innerHTML = items.map(renderAnnouncementItem).join('');
  } catch (e) {
    // Don’t break dashboard; just hide.
    // eslint-disable-next-line no-console
    console.error('Failed to load announcements', e);
    toast({ title: 'Announcements failed', message: e?.message || 'Try again.', variant: 'danger' });
    shell.classList.add('d-none');
  }
}

