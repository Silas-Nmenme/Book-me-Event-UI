import { initThemeToggle } from '../theme-toggle.js';
import { apiFetch } from '../api.js';
import { setYear, clearToken } from '../ui.js';

function escapeHtml(s) {
  return (s ?? '')
    .toString()
    .replace(/[&<>"']/g, (c) => {
      const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
      return m[c] || c;
    });
}

function renderRows(tbody, items) {
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted-soft">No audit events</td></tr>`;
    return;
  }

  tbody.innerHTML = items
    .map((a) => {
      const occurredAt = a?.occurredAt ? new Date(a.occurredAt).toLocaleString() : '—';
      return `
        <tr>
          <td>${escapeHtml(a?.entityType ?? '—')}</td>
          <td>${escapeHtml(a?.actionType ?? '—')}</td>
          <td>${escapeHtml(a?.user ?? a?.user?._id ?? '—')}</td>
          <td>${escapeHtml(a?.actor ?? a?.actor?._id ?? '—')}</td>
          <td>${escapeHtml(a?.entityId ?? '—')}</td>
          <td>${escapeHtml(a?.severity ?? 'INFO')}</td>
          <td>${escapeHtml(occurredAt)}</td>
        </tr>
      `;
    })
    .join('');
}

async function init() {
  initThemeToggle();
  setYear('year');

  const loadingEl = document.getElementById('loadingBox');
  const errorEl = document.getElementById('errorBox');
  const rootEl = document.getElementById('signalsRoot');

  const filterEntityTypeEl = document.getElementById('filterEntityType');
  const filterActionTypeEl = document.getElementById('filterActionType');
  const btnRefreshEl = document.getElementById('btnRefresh');

  const tbody = document.getElementById('auditBody');

  const btnLogout = document.getElementById('btnLogout');
  btnLogout?.addEventListener('click', () => {
    clearToken();
    window.location.href = 'auth-login.html';
  });

  async function refresh() {
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (errorEl) errorEl.classList.add('d-none');
    if (rootEl) rootEl.classList.add('d-none');

    try {
      const params = new URLSearchParams();
      const entityType = filterEntityTypeEl?.value?.trim();
      const actionType = filterActionTypeEl?.value?.trim();
      if (entityType) params.set('entityType', entityType);
      if (actionType) params.set('actionType', actionType);

      const qs = params.toString();
      const res = await apiFetch(`/api/v1/admin/audit${qs ? `?${qs}` : ''}`, { method: 'GET' });
      const items = res?.data || res?.items || [];
      renderRows(tbody, items);
      if (rootEl) rootEl.classList.remove('d-none');
    } catch (e) {
      if (errorEl) {
        errorEl.classList.remove('d-none');
        errorEl.textContent = e?.message || 'Failed to load audit events.';
      }
    } finally {
      if (loadingEl) loadingEl.classList.add('d-none');
    }
  }

  btnRefreshEl?.addEventListener('click', refresh);
  await refresh();
}

init();


