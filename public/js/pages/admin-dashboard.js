import {
  fetchMe,
  logoutUser,
  clearToken,
  apiFetch,
  getAdminDashboard,
  getPendingVendors,
  getAdminVendors,
  verifyVendor,
  rejectVendor,
  getAdminUsers,
  toggleUserStatus,
  getAdminBookings,
  getAdminPayments,
  getAdminStats,
  sendAnnouncement,
  exportAdminUsersCsv,
  exportAdminVendorsCsv,
  bulkToggleUsers,
  bulkVendorAction,
  adminGlobalSearch,
  getUser,
  getUserBookings,
  getUserRequests,
  deleteUser,
} from '../api.js';

import { toast, setYear } from '../ui.js';
import { initThemeToggle } from '../theme-toggle.js';

// Client-side filter/pagination state for the users & vendors tables.
const usersState = { role: '', search: '', page: 1, limit: 10, pages: 1 };
const vendorsState = { status: '', search: '', page: 1, limit: 10, pages: 1 };

// Row selection state for bulk actions (cleared whenever a table re-renders).
const selectedUserIds = new Set();
const selectedVendorIds = new Set();

let revenueChart = null;
let growthChart = null;

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

function normalizePagePayload(res) {
  return res?.data || res;
}

function statusText(isActive) {
  // Backend uses isActive toggle; keep UI consistent.
  if (typeof isActive === 'boolean') {
    return isActive ? { text: 'Active', variant: 'success' } : { text: 'Disabled', variant: 'secondary' };
  }
  return { text: isActive ?? '—', variant: 'secondary' };
}

function formatDateMaybe(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

async function loadStats() {
  const res = await getAdminDashboard();
  const data = normalizePagePayload(res)?.data || normalizePagePayload(res);
  return data;
}

async function loadPendingVendors() {
  const res = await getPendingVendors({ page: 1, limit: 10 });
  const data = normalizePagePayload(res);
  return data;
}

async function loadUsers({ role, search, page, limit } = {}) {
  // Pagination/count fields (total, pages, currentPage) live on the top-level
  // response, not inside `.data` (which is just the array) — return the raw response.
  return getAdminUsers({ role, search, page, limit });
}

async function loadAllVendors({ status, search, page, limit } = {}) {
  return getAdminVendors({ status, search, page, limit });
}

async function loadAdminCounts() {
  const [bookingsRes, paymentsRes] = await Promise.all([
    getAdminBookings({ page: 1, limit: 1 }),
    getAdminPayments({ page: 1, limit: 1 }),
  ]);

  return {
    totalBookings: bookingsRes?.total ?? bookingsRes?.count ?? '—',
    totalPayments: paymentsRes?.total ?? paymentsRes?.count ?? '—',
  };
}

async function renderPendingVendors() {
  const loadingEl = document.getElementById('pendingVendorsLoading');
  const errorEl = document.getElementById('pendingVendorsError');
  const bodyEl = document.getElementById('pendingVendorsBody');

  if (!bodyEl) return;

  loadingEl?.classList.remove('d-none');
  errorEl?.classList.add('d-none');
  if (bodyEl) bodyEl.innerHTML = '';

  try {
    const data = await loadPendingVendors();
    const vendors = data?.data || data?.results || data || [];

    if (!Array.isArray(vendors) || vendors.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="5" class="text-muted-soft">No pending vendors.</td></tr>`;
      return;
    }

    bodyEl.innerHTML = vendors
      .map((v) => {
        const user = v?.user;
        const requested = formatDateMaybe(
          v?.createdAt ||
            v?.verificationRequestedAt ||
            v?.kycReviewedAt ||
            v?.kycSubmittedAt
        );

        // Vendor schema field is `kycDocumentUrl` (uploaded by vendor).
        // Keep UI resilient to alternate naming.
        const kycUrl = v?.kycDocumentUrl || v?.kycDocUrl;

        const hasKyc = !!kycUrl;
        return `
          <tr>
            <td>${escapeHtml(user?.firstName || '')} ${escapeHtml(user?.lastName || '')}</td>
            <td>${escapeHtml(v?.businessName || '—')}</td>
            <td>${escapeHtml(requested)}</td>
            <td>
              ${hasKyc ? `<a class="btn btn-soft btn-sm" target="_blank" rel="noreferrer" href="${escapeHtml(kycUrl)}">View</a>` : `<span class="text-muted-soft">—</span>`}
            </td>
            <td>
              <div class="d-flex gap-2">
                <button class="btn btn-success btn-sm" data-action="verify" data-vendor-id="${escapeHtml(v?._id || '')}">Verify</button>
                <button class="btn btn-danger btn-sm" data-action="reject" data-vendor-id="${escapeHtml(v?._id || '')}">Reject</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    bodyEl.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const vendorId = btn.getAttribute('data-vendor-id');
        const action = btn.getAttribute('data-action');
        if (!vendorId) return;

        try {
          if (action === 'verify') {
            await verifyVendor(vendorId);
            toast({ title: 'Vendor verified', message: 'Verification completed successfully.', variant: 'success' });
          } else {
            const reason = prompt('Rejection reason (optional):') || undefined;
            await rejectVendor(vendorId, { reason });
            toast({ title: 'Vendor rejected', message: 'Vendor has been rejected.', variant: 'success' });
          }
          await renderPendingVendors();
        } catch (e) {
          toast({ title: 'Action failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    });
  } catch (e) {
    errorEl?.classList.remove('d-none');
    if (errorEl) errorEl.textContent = e?.message || 'Failed to load pending vendors.';
  } finally {
    loadingEl?.classList.add('d-none');
  }
}

async function openUserDetailModal(userId) {
  const modalEl = document.getElementById('userDetailModal');
  const bodyEl = document.getElementById('userDetailModalBody');
  if (!modalEl || !bodyEl || typeof window.bootstrap === 'undefined') return;

  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  bodyEl.innerHTML = `<div class="text-muted-soft small">Loading…</div>`;
  modal.show();

  try {
    const [userRes, bookingsRes, requestsRes] = await Promise.all([
      getUser(userId),
      getUserBookings(userId, { page: 1, limit: 5 }),
      getUserRequests(userId, { page: 1, limit: 5 }),
    ]);

    const user = userRes?.data || userRes;
    const bookings = bookingsRes?.data || [];
    const requests = requestsRes?.data || [];

    const bookingRows = bookings.length
      ? bookings
          .map(
            (b) =>
              `<tr><td>${escapeHtml(b?.service?.serviceName || b?.service?.name || '—')}</td><td>${escapeHtml(b?.vendor?.businessName || '—')}</td><td>${escapeHtml(b?.bookingStatus || '—')}</td><td>${escapeHtml(formatDateMaybe(b?.createdAt))}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="4" class="text-muted-soft">No bookings.</td></tr>`;

    const requestRows = requests.length
      ? requests
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r?.service?.serviceName || r?.service?.name || '—')}</td><td>${escapeHtml(r?.vendor?.businessName || '—')}</td><td>${escapeHtml(r?.status || '—')}</td><td>${escapeHtml(formatDateMaybe(r?.createdAt))}</td></tr>`
          )
          .join('')
      : `<tr><td colspan="4" class="text-muted-soft">No requests.</td></tr>`;

    bodyEl.innerHTML = `
      <div class="mb-3">
        <div class="fw-bold h6">${escapeHtml(user?.firstName || '')} ${escapeHtml(user?.lastName || '')}</div>
        <div class="text-muted-soft small">${escapeHtml(user?.email || '')} · ${escapeHtml(user?.phone || '—')}</div>
        <div class="small mt-1">
          Role: <span class="badge text-bg-secondary">${escapeHtml(user?.role || 'USER')}</span>
          Status: <span class="badge text-bg-${user?.isActive ? 'success' : 'secondary'}">${user?.isActive ? 'Active' : 'Disabled'}</span>
          Verified: <span class="badge text-bg-${user?.isVerified ? 'success' : 'warning'}">${user?.isVerified ? 'Yes' : 'No'}</span>
        </div>
      </div>

      <div class="mb-3">
        <div class="fw-bold small mb-2">Recent bookings</div>
        <div class="table-responsive">
          <table class="table table-dark table-sm mb-0">
            <thead><tr><th>Service</th><th>Vendor</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>${bookingRows}</tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="fw-bold small mb-2">Recent requests</div>
        <div class="table-responsive">
          <table class="table table-dark table-sm mb-0">
            <thead><tr><th>Service</th><th>Vendor</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>${requestRows}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    bodyEl.innerHTML = `<div class="text-danger small">${escapeHtml(e?.message || 'Failed to load user details.')}</div>`;
  }
}

function updateUsersBulkToolbar() {
  const countEl = document.getElementById('usersSelectedCount');
  const enableBtn = document.getElementById('btnBulkEnableUsers');
  const disableBtn = document.getElementById('btnBulkDisableUsers');
  const hasSelection = selectedUserIds.size > 0;

  if (countEl) countEl.textContent = `${selectedUserIds.size} selected`;
  if (enableBtn) enableBtn.disabled = !hasSelection;
  if (disableBtn) disableBtn.disabled = !hasSelection;
}

async function renderUsers() {
  const loadingEl = document.getElementById('usersLoading');
  const errorEl = document.getElementById('usersError');
  const bodyEl = document.getElementById('usersBody');
  const pageInfoEl = document.getElementById('usersPageInfo');
  const selectAllEl = document.getElementById('usersSelectAll');

  if (!bodyEl) return;

  loadingEl?.classList.remove('d-none');
  errorEl?.classList.add('d-none');
  bodyEl.innerHTML = '';
  selectedUserIds.clear();
  updateUsersBulkToolbar();
  if (selectAllEl) selectAllEl.checked = false;

  try {
    const res = await loadUsers(usersState);
    const users = res?.data || [];
    usersState.pages = res?.pages || 1;

    if (pageInfoEl) {
      const total = res?.total ?? users.length;
      pageInfoEl.textContent = `Page ${usersState.page} of ${usersState.pages} (${total} users)`;
    }

    if (!Array.isArray(users) || users.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="6" class="text-muted-soft">No users found.</td></tr>`;
      return;
    }

    bodyEl.innerHTML = users
      .map((u) => {
        const { text, variant } = statusText(u?.isActive);
        const id = escapeHtml(u?._id || '');
        return `
          <tr>
            <td><input type="checkbox" class="user-row-checkbox" data-user-id="${id}" /></td>
            <td>${escapeHtml(u?.firstName || '')} ${escapeHtml(u?.lastName || '')}</td>
            <td>${escapeHtml(u?.email || '')}</td>
            <td>${escapeHtml(u?.role || 'USER')}</td>
            <td><span class="badge text-bg-${escapeHtml(variant)}">${escapeHtml(text)}</span></td>
            <td>
              <div class="d-flex gap-2">
                <button class="btn btn-soft btn-sm" data-action="view" data-user-id="${id}">View</button>
                <button class="btn btn-soft btn-sm" data-action="toggle" data-user-id="${id}">
                  ${u?.isActive ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-danger btn-sm" data-action="delete" data-user-id="${id}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    bodyEl.querySelectorAll('.user-row-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-user-id');
        if (!id) return;
        if (cb.checked) selectedUserIds.add(id);
        else selectedUserIds.delete(id);
        updateUsersBulkToolbar();
      });
    });

    bodyEl.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        if (!userId) return;

        try {
          await toggleUserStatus(userId);
          toast({ title: 'User updated', message: 'Status changed successfully.', variant: 'success' });
          await renderUsers();
        } catch (e) {
          toast({ title: 'Update failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    });

    bodyEl.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-user-id');
        if (userId) openUserDetailModal(userId);
      });
    });

    bodyEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-user-id');
        if (!userId) return;
        if (!confirm('Delete this user account? This cannot be undone.')) return;

        try {
          await deleteUser(userId);
          toast({ title: 'User deleted', message: 'Account removed successfully.', variant: 'success' });
          await renderUsers();
        } catch (e) {
          toast({ title: 'Delete failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    });
  } catch (e) {
    errorEl?.classList.remove('d-none');
    if (errorEl) errorEl.textContent = e?.message || 'Failed to load users.';
  } finally {
    loadingEl?.classList.add('d-none');
  }
}

function vendorStatusBadge(kycStatus) {
  const s = (kycStatus || 'PENDING').toUpperCase();
  if (s === 'APPROVED') return { text: 'Approved', variant: 'success' };
  if (s === 'REJECTED') return { text: 'Rejected', variant: 'danger' };
  return { text: 'Pending', variant: 'warning' };
}

function updateVendorsBulkToolbar() {
  const countEl = document.getElementById('vendorsSelectedCount');
  const verifyBtn = document.getElementById('btnBulkVerifyVendors');
  const rejectBtn = document.getElementById('btnBulkRejectVendors');
  const hasSelection = selectedVendorIds.size > 0;

  if (countEl) countEl.textContent = `${selectedVendorIds.size} selected`;
  if (verifyBtn) verifyBtn.disabled = !hasSelection;
  if (rejectBtn) rejectBtn.disabled = !hasSelection;
}

async function renderAllVendors() {
  const loadingEl = document.getElementById('vendorsLoading');
  const errorEl = document.getElementById('vendorsError');
  const bodyEl = document.getElementById('vendorsBody');
  const pageInfoEl = document.getElementById('vendorsPageInfo');
  const selectAllEl = document.getElementById('vendorsSelectAll');

  if (!bodyEl) return;

  loadingEl?.classList.remove('d-none');
  errorEl?.classList.add('d-none');
  bodyEl.innerHTML = '';
  selectedVendorIds.clear();
  updateVendorsBulkToolbar();
  if (selectAllEl) selectAllEl.checked = false;

  try {
    const res = await loadAllVendors(vendorsState);
    const vendors = res?.data || [];
    vendorsState.pages = res?.pages || 1;

    if (pageInfoEl) {
      const total = res?.total ?? vendors.length;
      pageInfoEl.textContent = `Page ${vendorsState.page} of ${vendorsState.pages} (${total} vendors)`;
    }

    if (!Array.isArray(vendors) || vendors.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="6" class="text-muted-soft">No vendors found.</td></tr>`;
      return;
    }

    bodyEl.innerHTML = vendors
      .map((v) => {
        const user = v?.user;
        const { text, variant } = vendorStatusBadge(v?.kycStatus);
        const isPending = (v?.kycStatus || 'PENDING').toUpperCase() === 'PENDING';
        const id = escapeHtml(v?._id || '');
        return `
          <tr>
            <td><input type="checkbox" class="vendor-row-checkbox" data-vendor-id="${id}" /></td>
            <td>${escapeHtml(user?.firstName || '')} ${escapeHtml(user?.lastName || '')}<div class="small text-muted-soft">${escapeHtml(user?.email || '')}</div></td>
            <td>${escapeHtml(v?.businessName || '—')}</td>
            <td><span class="badge text-bg-${escapeHtml(variant)}">${escapeHtml(text)}</span></td>
            <td>${escapeHtml(formatDateMaybe(v?.createdAt))}</td>
            <td>
              ${
                isPending
                  ? `<div class="d-flex gap-2">
                      <button class="btn btn-success btn-sm" data-action="verify" data-vendor-id="${id}">Verify</button>
                      <button class="btn btn-danger btn-sm" data-action="reject" data-vendor-id="${id}">Reject</button>
                    </div>`
                  : `<span class="text-muted-soft">—</span>`
              }
            </td>
          </tr>
        `;
      })
      .join('');

    bodyEl.querySelectorAll('.vendor-row-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-vendor-id');
        if (!id) return;
        if (cb.checked) selectedVendorIds.add(id);
        else selectedVendorIds.delete(id);
        updateVendorsBulkToolbar();
      });
    });

    bodyEl.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const vendorId = btn.getAttribute('data-vendor-id');
        const action = btn.getAttribute('data-action');
        if (!vendorId) return;

        try {
          if (action === 'verify') {
            await verifyVendor(vendorId);
            toast({ title: 'Vendor verified', message: 'Verification completed successfully.', variant: 'success' });
          } else {
            const reason = prompt('Rejection reason (optional):') || undefined;
            await rejectVendor(vendorId, { reason });
            toast({ title: 'Vendor rejected', message: 'Vendor has been rejected.', variant: 'success' });
          }
          await Promise.all([renderAllVendors(), renderPendingVendors()]);
        } catch (e) {
          toast({ title: 'Action failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    });
  } catch (e) {
    errorEl?.classList.remove('d-none');
    if (errorEl) errorEl.textContent = e?.message || 'Failed to load vendors.';
  } finally {
    loadingEl?.classList.add('d-none');
  }
}

async function renderBillingViews() {
  const bookingsCountEl = document.getElementById('bookingsCount');
  const paymentsCountEl = document.getElementById('paymentsCount');
  if (!bookingsCountEl || !paymentsCountEl) return;

  try {
    const counts = await loadAdminCounts();
    bookingsCountEl.textContent = counts?.totalBookings ?? '—';
    paymentsCountEl.textContent = counts?.totalPayments ?? '—';
  } catch {
    bookingsCountEl.textContent = '—';
    paymentsCountEl.textContent = '—';
  }
}

function renderCharts(stats) {
  if (typeof window.Chart === 'undefined') return;

  const revenueCanvas = document.getElementById('chartRevenue');
  const growthCanvas = document.getElementById('chartGrowth');
  if (!revenueCanvas || !growthCanvas) return;

  const monthlyRevenue = Array.isArray(stats?.monthlyRevenue) ? stats.monthlyRevenue : [];
  const monthlySignups = Array.isArray(stats?.monthlySignups) ? stats.monthlySignups : [];
  const monthlyBookings = Array.isArray(stats?.monthlyBookings) ? stats.monthlyBookings : [];

  revenueChart?.destroy();
  revenueChart = new window.Chart(revenueCanvas, {
    type: 'line',
    data: {
      labels: monthlyRevenue.map((m) => m._id),
      datasets: [
        {
          label: 'Revenue',
          data: monthlyRevenue.map((m) => m.total),
          borderColor: '#0EA5E9',
          backgroundColor: 'rgba(14,165,233,0.15)',
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: 'Monthly revenue' } },
    },
  });

  // Merge signup/booking months so both series share the same x-axis labels.
  const allMonths = Array.from(
    new Set([...monthlySignups.map((m) => m._id), ...monthlyBookings.map((m) => m._id)])
  ).sort();
  const signupsByMonth = Object.fromEntries(monthlySignups.map((m) => [m._id, m.count]));
  const bookingsByMonth = Object.fromEntries(monthlyBookings.map((m) => [m._id, m.count]));

  growthChart?.destroy();
  growthChart = new window.Chart(growthCanvas, {
    type: 'bar',
    data: {
      labels: allMonths,
      datasets: [
        {
          label: 'New signups',
          data: allMonths.map((m) => signupsByMonth[m] || 0),
          backgroundColor: '#7C5CFF',
        },
        {
          label: 'Bookings',
          data: allMonths.map((m) => bookingsByMonth[m] || 0),
          backgroundColor: '#22c55e',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: 'New signups & bookings' } },
    },
  });
}

function renderGlobalSearchResults(data) {
  const resultsEl = document.getElementById('globalSearchResults');
  if (!resultsEl) return;

  const users = data?.users || [];
  const vendors = data?.vendors || [];
  const bookings = data?.bookings || [];

  if (users.length === 0 && vendors.length === 0 && bookings.length === 0) {
    resultsEl.innerHTML = `<div class="list-group-item text-muted-soft small">No matches found.</div>`;
    resultsEl.classList.remove('d-none');
    return;
  }

  const sections = [];

  if (users.length) {
    sections.push(`<div class="list-group-item bg-dark text-muted-soft small fw-bold">Users</div>`);
    sections.push(
      ...users.map(
        (u) =>
          `<div class="list-group-item list-group-item-action">${escapeHtml(u.firstName || '')} ${escapeHtml(u.lastName || '')} <span class="text-muted-soft small">${escapeHtml(u.email || '')} · ${escapeHtml(u.role || '')}</span></div>`
      )
    );
  }

  if (vendors.length) {
    sections.push(`<div class="list-group-item bg-dark text-muted-soft small fw-bold">Vendors</div>`);
    sections.push(
      ...vendors.map(
        (v) =>
          `<div class="list-group-item list-group-item-action">${escapeHtml(v.businessName || '')} <span class="text-muted-soft small">${escapeHtml(v.user?.email || '')} · ${escapeHtml(v.kycStatus || '')}</span></div>`
      )
    );
  }

  if (bookings.length) {
    sections.push(`<div class="list-group-item bg-dark text-muted-soft small fw-bold">Bookings</div>`);
    sections.push(
      ...bookings.map(
        (b) =>
          `<div class="list-group-item list-group-item-action">${escapeHtml(b.user?.firstName || '')} ${escapeHtml(b.user?.lastName || '')} → ${escapeHtml(b.vendor?.businessName || '')} <span class="text-muted-soft small">${escapeHtml(b.bookingStatus || '')}</span></div>`
      )
    );
  }

  resultsEl.innerHTML = sections.join('');
  resultsEl.classList.remove('d-none');
}

function setupGlobalSearch() {
  const inputEl = document.getElementById('globalSearchInput');
  const resultsEl = document.getElementById('globalSearchResults');
  if (!inputEl || !resultsEl) return;

  let debounceTimer = null;

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    clearTimeout(debounceTimer);

    if (!q) {
      resultsEl.classList.add('d-none');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await adminGlobalSearch(q);
        renderGlobalSearchResults(res?.data || res);
      } catch (e) {
        resultsEl.innerHTML = `<div class="list-group-item text-danger small">${escapeHtml(e?.message || 'Search failed.')}</div>`;
        resultsEl.classList.remove('d-none');
      }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!resultsEl.contains(e.target) && e.target !== inputEl) {
      resultsEl.classList.add('d-none');
    }
  });
}

async function initAdminDashboard() {
  initThemeToggle();
  setYear('year');

  const avatarEl = document.getElementById('avatar');
  const avatarFileInput = document.getElementById('profilePictureInput');

  function setAvatarUrl(url) {
    if (!avatarEl) return;
    if (url) {
      avatarEl.style.backgroundImage = `url(${url})`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
      avatarEl.style.fontWeight = 'normal';
      return;
    }
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = 'BME';
    avatarEl.style.fontWeight = '900';
  }

  function getAvatarInitials(name) {
    return (name || 'BME')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0].toUpperCase())
      .join('');
  }

  async function loadMe() {
    try {
      const res = await fetchMe();
      const me = res?.data || res;

      document.getElementById('meName').textContent = me?.firstName
        ? `${me.firstName} ${me.lastName || ''}`.trim()
        : '—';
      document.getElementById('meEmail').textContent = me?.email || '—';

      const role = (me?.role || '').toString().toUpperCase();
      document.getElementById('meRole').textContent = role || 'ADMIN';

      // 2FA status (admin)
      const me2faStatusEl = document.getElementById('me2faStatus');
      const totpEnabled = !!me?.totpEnabled;
      if (me2faStatusEl) {
        me2faStatusEl.textContent = totpEnabled ? 'Enabled' : 'Not enabled';
        me2faStatusEl.style.color = totpEnabled ? 'var(--success, #22c55e)' : 'var(--muted, #94a3b8)';
      }

      if (me?.profilePicture) setAvatarUrl(me.profilePicture);

      else {
        avatarEl.textContent = getAvatarInitials(me?.firstName || 'BME');
        avatarEl.style.backgroundImage = '';
        avatarEl.style.background = 'rgba(124,92,255,0.12)';
        avatarEl.style.fontWeight = '900';
      }

      // Guard: ensure admin
      if (role !== 'ADMIN') {
        toast({ title: 'Forbidden', message: 'Admin access required.', variant: 'danger' });
        window.location.replace('auth-login.html');
      }

      return me;
    } catch {
      clearToken();
      toast({ title: 'Session expired', message: 'Please log in again.', variant: 'danger' });
      window.location.replace('auth-login.html');
      return null;
    }
  }

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await logoutUser();
    } finally {
      clearToken();
    }
    toast({ title: 'Logged out', message: 'See you again.', variant: 'success' });
    window.location.replace('auth-login.html');
  });

  // Profile picture upload (best-effort)
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async () => {
      const file = avatarFileInput.files?.[0];
      if (!file) return;

      try {
        avatarFileInput.disabled = true;
        toast({ title: 'Uploading', message: 'Updating profile picture…', variant: 'warning' });

        const fd = new FormData();
        fd.append('image', file);

        const res = await apiFetch('/api/v1/uploads/profile-picture', { method: 'POST', body: fd });
        const data = res?.data || res;
        if (data?.url) setAvatarUrl(data.url);
        toast({ title: 'Updated', message: 'Profile picture updated.', variant: 'success' });
      } catch (e) {
        toast({ title: 'Upload failed', message: e?.message || 'Try again.', variant: 'danger' });
      } finally {
        avatarFileInput.disabled = false;
        avatarFileInput.value = '';
      }
    });
  }

  // Load all widgets
  await loadMe();

  // Stats
  try {
    const stats = await loadStats();
    document.getElementById('statTotalUsers').textContent = stats?.totalUsers ?? '—';
    document.getElementById('statTotalVendors').textContent = stats?.totalVendors ?? '—';
    document.getElementById('statTotalBookings').textContent = stats?.totalBookings ?? '—';
    document.getElementById('statCompletedBookings').textContent = stats?.completedBookings ?? '—';
    document.getElementById('statTotalRevenue').textContent = stats?.totalRevenue != null ? stats.totalRevenue : '—';
    document.getElementById('statAvgRating').textContent = stats?.averageRating ?? '—';
    document.getElementById('statActiveUsers').textContent = stats?.activeUsers ?? '—';
    document.getElementById('statPendingVendors').textContent = stats?.pendingVendors ?? '—';
  } catch {
    // ignore
  }

  // Charts
  try {
    const platformStats = await getAdminStats();
    renderCharts(platformStats?.data || platformStats);
  } catch {
    // ignore
  }

  setupGlobalSearch();

  await Promise.all([renderPendingVendors(), renderAllVendors(), renderUsers(), renderBillingViews()]);

  document.getElementById('btnRefreshPending')?.addEventListener('click', renderPendingVendors);
  document.getElementById('btnRefreshUsers')?.addEventListener('click', () => {
    usersState.page = 1;
    renderUsers();
  });
  document.getElementById('btnRefreshVendors')?.addEventListener('click', () => {
    vendorsState.page = 1;
    renderAllVendors();
  });

  // Users: select-all, bulk actions, export
  document.getElementById('usersSelectAll')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.user-row-checkbox').forEach((cb) => {
      cb.checked = checked;
      const id = cb.getAttribute('data-user-id');
      if (!id) return;
      if (checked) selectedUserIds.add(id);
      else selectedUserIds.delete(id);
    });
    updateUsersBulkToolbar();
  });

  async function runBulkUserToggle(isActive) {
    if (selectedUserIds.size === 0) return;
    try {
      const res = await bulkToggleUsers({ userIds: Array.from(selectedUserIds), isActive });
      toast({ title: 'Bulk update complete', message: res?.message || 'Users updated.', variant: 'success' });
      await renderUsers();
    } catch (e) {
      toast({ title: 'Bulk update failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  }

  document.getElementById('btnBulkEnableUsers')?.addEventListener('click', () => runBulkUserToggle(true));
  document.getElementById('btnBulkDisableUsers')?.addEventListener('click', () => runBulkUserToggle(false));

  document.getElementById('btnExportUsers')?.addEventListener('click', async () => {
    try {
      await exportAdminUsersCsv({ role: usersState.role, search: usersState.search });
    } catch (e) {
      toast({ title: 'Export failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  });

  // Vendors: select-all, bulk actions, export
  document.getElementById('vendorsSelectAll')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.vendor-row-checkbox').forEach((cb) => {
      cb.checked = checked;
      const id = cb.getAttribute('data-vendor-id');
      if (!id) return;
      if (checked) selectedVendorIds.add(id);
      else selectedVendorIds.delete(id);
    });
    updateVendorsBulkToolbar();
  });

  async function runBulkVendorAction(action) {
    if (selectedVendorIds.size === 0) return;
    const reason = action === 'reject' ? prompt('Rejection reason (optional):') || undefined : undefined;

    try {
      const res = await bulkVendorAction({ vendorIds: Array.from(selectedVendorIds), action, reason });
      toast({ title: 'Bulk action complete', message: res?.message || 'Vendors updated.', variant: 'success' });
      await Promise.all([renderAllVendors(), renderPendingVendors()]);
    } catch (e) {
      toast({ title: 'Bulk action failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  }

  document.getElementById('btnBulkVerifyVendors')?.addEventListener('click', () => runBulkVendorAction('verify'));
  document.getElementById('btnBulkRejectVendors')?.addEventListener('click', () => runBulkVendorAction('reject'));

  document.getElementById('btnExportVendors')?.addEventListener('click', async () => {
    try {
      await exportAdminVendorsCsv({ status: vendorsState.status, search: vendorsState.search });
    } catch (e) {
      toast({ title: 'Export failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  });

  // Users: role filter, search, pagination
  document.getElementById('usersRoleFilter')?.addEventListener('change', (e) => {
    usersState.role = e.target.value;
    usersState.page = 1;
    renderUsers();
  });
  document.getElementById('btnUsersSearch')?.addEventListener('click', () => {
    usersState.search = document.getElementById('usersSearchInput')?.value?.trim() || '';
    usersState.page = 1;
    renderUsers();
  });
  document.getElementById('usersSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnUsersSearch')?.click();
  });
  document.getElementById('btnUsersPrev')?.addEventListener('click', () => {
    if (usersState.page > 1) {
      usersState.page -= 1;
      renderUsers();
    }
  });
  document.getElementById('btnUsersNext')?.addEventListener('click', () => {
    if (usersState.page < usersState.pages) {
      usersState.page += 1;
      renderUsers();
    }
  });

  // Vendors: status filter, search, pagination
  document.getElementById('vendorsStatusFilter')?.addEventListener('change', (e) => {
    vendorsState.status = e.target.value;
    vendorsState.page = 1;
    renderAllVendors();
  });
  document.getElementById('btnVendorsSearch')?.addEventListener('click', () => {
    vendorsState.search = document.getElementById('vendorsSearchInput')?.value?.trim() || '';
    vendorsState.page = 1;
    renderAllVendors();
  });
  document.getElementById('vendorsSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnVendorsSearch')?.click();
  });
  document.getElementById('btnVendorsPrev')?.addEventListener('click', () => {
    if (vendorsState.page > 1) {
      vendorsState.page -= 1;
      renderAllVendors();
    }
  });
  document.getElementById('btnVendorsNext')?.addEventListener('click', () => {
    if (vendorsState.page < vendorsState.pages) {
      vendorsState.page += 1;
      renderAllVendors();
    }
  });

  // Announcement form
  document.getElementById('announcementForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('announcementTitle')?.value?.trim();
    const message = document.getElementById('announcementMessage')?.value?.trim();
    const recipientType = document.getElementById('announcementRecipientType')?.value;

    if (!title || !message || !recipientType) {
      toast({ title: 'Missing fields', message: 'Provide title, message, and recipient type.', variant: 'warning' });
      return;
    }

    try {
      await sendAnnouncement({ title, message, recipientType });
      toast({ title: 'Announcement sent', message: 'Notification created successfully.', variant: 'success' });
      document.getElementById('announcementForm').reset();
    } catch (err) {
      toast({ title: 'Send failed', message: err?.message || 'Try again.', variant: 'danger' });
    }
  });
}

// Auto-init when loaded on admin-dashboard.html
initAdminDashboard();

