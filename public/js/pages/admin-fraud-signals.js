import { setYear, clearToken } from '../ui.js';
import { apiFetch } from '../api.js';
import { initThemeToggle } from '../theme-toggle.js';

function normalizePagePayload(res) {
  return res?.data || res;
}

function escapeHtml(s) {
  return (s ?? '')
    .toString()
    .replace(/[&<>"']/g, (c) => {
      const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
      return m[c] || c;
    });
}

async function loadSignals({ days }) {
  const qs = new URLSearchParams();
  if (days) qs.set('days', days);
  const url = `/api/v1/fraud/signals${qs.toString() ? `?${qs.toString()}` : ''}`;
  return apiFetch(url, { method: 'GET' });
}

function renderTableRows(bodyEl, rows, formatter) {
  if (!bodyEl) return;
  bodyEl.innerHTML = '';

  if (!Array.isArray(rows) || rows.length === 0) {
    bodyEl.innerHTML = `<tr><td colspan="${formatter?.colspan || 3}" class="text-muted-soft">No data</td></tr>`;
    return;
  }

  bodyEl.innerHTML = rows.map((r) => formatter?.rowHtml(r) || '').join('');
}

async function init() {
  initThemeToggle();
  setYear('year');

  const loadingBox = document.getElementById('loadingBox');
  const errorBox = document.getElementById('errorBox');
  const signalsRoot = document.getElementById('signalsRoot');

  const daysWindowEl = document.getElementById('daysWindow');
  const btnRefreshEl = document.getElementById('btnRefresh');

  const pendingKycCountEl = document.getElementById('pendingKycCount');
  const rejectedKycCountEl = document.getElementById('rejectedKycCount');
  const windowSinceEl = document.getElementById('windowSince');

  const failedByUserBody = document.getElementById('failedByUserBody');
  const microFailedByVendorBody = document.getElementById('microFailedByVendorBody');
  const mismatchByVendorBody = document.getElementById('mismatchByVendorBody');

  const btnLogout = document.getElementById('btnLogout');
  btnLogout?.addEventListener('click', () => {
    clearToken();
    window.location.href = 'auth-login.html';
  });

  async function refresh() {
    if (loadingBox) loadingBox.classList.remove('d-none');
    if (errorBox) errorBox.classList.add('d-none');
    if (signalsRoot) signalsRoot.classList.add('d-none');

    try {
      const days = daysWindowEl?.value ? Number(daysWindowEl.value) : 30;
      const res = await loadSignals({ days });
      const data = normalizePagePayload(res);

      const window = data?.window;
      const kyc = data?.kyc;

      if (pendingKycCountEl) pendingKycCountEl.textContent = kyc?.pendingKycVendorsCount ?? '—';
      if (rejectedKycCountEl) rejectedKycCountEl.textContent = kyc?.rejectedVendorsCount ?? '—';
      if (windowSinceEl)
        windowSinceEl.textContent = window?.since ? new Date(window.since).toLocaleDateString() : '—';

      renderTableRows(failedByUserBody, data?.failedPaymentsByUser, {
        colspan: 3,
        rowHtml: (r) => {
          const id = r?._id ?? '';
          return `
            <tr>
              <td>${escapeHtml(id.toString())}</td>
              <td>${escapeHtml(r?.failedCount ?? 0)}</td>
              <td>${escapeHtml(r?.failedAmount ?? 0)}</td>
            </tr>
          `;
        },
      });

      renderTableRows(microFailedByVendorBody, data?.microFailedByVendor, {
        colspan: 2,
        rowHtml: (r) => `
          <tr>
            <td>${escapeHtml((r?._id ?? '').toString())}</td>
            <td>${escapeHtml(r?.microFailedCount ?? 0)}</td>
          </tr>
        `,
      });

      renderTableRows(mismatchByVendorBody, data?.completedBookingWithoutCompletedPaymentByVendor, {
        colspan: 2,
        rowHtml: (r) => `
          <tr>
            <td>${escapeHtml((r?._id ?? '').toString())}</td>
            <td>${escapeHtml(r?.mismatchCount ?? 0)}</td>
          </tr>
        `,
      });

      if (signalsRoot) signalsRoot.classList.remove('d-none');
    } catch (e) {
      if (errorBox) {
        errorBox.classList.remove('d-none');
        errorBox.textContent = e?.message || 'Failed to load fraud signals.';
      }
    } finally {
      if (loadingBox) loadingBox.classList.add('d-none');
    }
  }

  btnRefreshEl?.addEventListener('click', refresh);
  await refresh();
}

init();

