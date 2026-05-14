import {
  fetchMe,
  logoutUser,
  clearToken,
  apiFetch,
  getAdminDashboard,
  getPendingVendors,
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

async function loadUsers({ role } = {}) {
  const res = await getAdminUsers({ role, page: 1, limit: 10 });
  const data = normalizePagePayload(res);
  return data;
}

async function loadAdminCounts() {
  const [bookingsRes, paymentsRes] = await Promise.all([
    getAdminBookings({ page: 1, limit: 1 }),
    getAdminPayments({ page: 1, limit: 1 }),
  ]);

  const bookingsData = normalizePagePayload(bookingsRes);
  const paymentsData = normalizePagePayload(paymentsRes);

  return {
    totalBookings: bookingsData?.total ?? bookingsData?.count ?? '—',
    totalPayments: paymentsData?.total ?? paymentsData?.count ?? '—',
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
        const requested = formatDateMaybe(v?.createdAt || v?.verificationRequestedAt);

        const kycUrl = v?.kycDocumentUrl;
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

  if (!bodyEl) return;

  loadingEl?.classList.remove('d-none');
  errorEl?.classList.add('d-none');
  bodyEl.innerHTML = '';

  try {
    // Default: show all roles (no role filter)
    const data = await loadUsers();
    const users = data?.data || [];

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
        window.location.href = 'auth-login.html';
      }

      return me;
    } catch {
      clearToken();
      toast({ title: 'Session expired', message: 'Please log in again.', variant: 'danger' });
      window.location.href = 'auth-login.html';
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
    window.location.href = 'auth-login.html';
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
  } catch {
    // ignore
  }

  await Promise.all([renderPendingVendors(), renderUsers(), renderBillingViews()]);

  document.getElementById('btnRefreshPending')?.addEventListener('click', renderPendingVendors);
  document.getElementById('btnRefreshUsers')?.addEventListener('click', renderUsers);

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

