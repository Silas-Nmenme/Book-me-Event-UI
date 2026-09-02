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
} from '../api.js';

import { toast, setYear } from '../ui.js';
import { initThemeToggle } from '../theme-toggle.js';

// Client-side filter/pagination state for the users & vendors tables.
const usersState = { role: '', search: '', page: 1, limit: 10, pages: 1 };
const vendorsState = { status: '', search: '', page: 1, limit: 10, pages: 1 };

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

async function renderUsers() {
  const loadingEl = document.getElementById('usersLoading');
  const errorEl = document.getElementById('usersError');
  const bodyEl = document.getElementById('usersBody');
  const pageInfoEl = document.getElementById('usersPageInfo');

  if (!bodyEl) return;

  loadingEl?.classList.remove('d-none');
  errorEl?.classList.add('d-none');
  bodyEl.innerHTML = '';

  try {
    const res = await loadUsers(usersState);
    const users = res?.data || [];
    usersState.pages = res?.pages || 1;

    if (pageInfoEl) {
      const total = res?.total ?? users.length;
      pageInfoEl.textContent = `Page ${usersState.page} of ${usersState.pages} (${total} users)`;
    }

    if (!Array.isArray(users) || users.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="5" class="text-muted-soft">No users found.</td></tr>`;
      return;
    }

    bodyEl.innerHTML = users
      .map((u) => {
        const { text, variant } = statusText(u?.isActive);
        return `
          <tr>
            <td>${escapeHtml(u?.firstName || '')} ${escapeHtml(u?.lastName || '')}</td>
            <td>${escapeHtml(u?.email || '')}</td>
            <td>${escapeHtml(u?.role || 'USER')}</td>
            <td><span class="badge text-bg-${escapeHtml(variant)}">${escapeHtml(text)}</span></td>
            <td>
              <button class="btn btn-soft btn-sm" data-action="toggle" data-user-id="${escapeHtml(u?._id || '')}">
                ${u?.isActive ? 'Disable' : 'Enable'}
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

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

async function renderAllVendors() {
  const loadingEl = document.getElementById('vendorsLoading');
  const errorEl = document.getElementById('vendorsError');
  const bodyEl = document.getElementById('vendorsBody');
  const pageInfoEl = document.getElementById('vendorsPageInfo');

  if (!bodyEl) return;

  loadingEl?.classList.remove('d-none');
  errorEl?.classList.add('d-none');
  bodyEl.innerHTML = '';

  try {
    const res = await loadAllVendors(vendorsState);
    const vendors = res?.data || [];
    vendorsState.pages = res?.pages || 1;

    if (pageInfoEl) {
      const total = res?.total ?? vendors.length;
      pageInfoEl.textContent = `Page ${vendorsState.page} of ${vendorsState.pages} (${total} vendors)`;
    }

    if (!Array.isArray(vendors) || vendors.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="5" class="text-muted-soft">No vendors found.</td></tr>`;
      return;
    }

    bodyEl.innerHTML = vendors
      .map((v) => {
        const user = v?.user;
        const { text, variant } = vendorStatusBadge(v?.kycStatus);
        const isPending = (v?.kycStatus || 'PENDING').toUpperCase() === 'PENDING';
        return `
          <tr>
            <td>${escapeHtml(user?.firstName || '')} ${escapeHtml(user?.lastName || '')}<div class="small text-muted-soft">${escapeHtml(user?.email || '')}</div></td>
            <td>${escapeHtml(v?.businessName || '—')}</td>
            <td><span class="badge text-bg-${escapeHtml(variant)}">${escapeHtml(text)}</span></td>
            <td>${escapeHtml(formatDateMaybe(v?.createdAt))}</td>
            <td>
              ${
                isPending
                  ? `<div class="d-flex gap-2">
                      <button class="btn btn-success btn-sm" data-action="verify" data-vendor-id="${escapeHtml(v?._id || '')}">Verify</button>
                      <button class="btn btn-danger btn-sm" data-action="reject" data-vendor-id="${escapeHtml(v?._id || '')}">Reject</button>
                    </div>`
                  : `<span class="text-muted-soft">—</span>`
              }
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

