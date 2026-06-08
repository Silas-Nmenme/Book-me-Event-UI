import { fetchMe, clearToken, logoutUser, apiFetch } from '../api.js';
import { toast } from '../ui.js';
import { initThemeToggle } from '../theme-toggle.js';
import { initAnnouncements } from './announcements.js';

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function toNumberOrDash(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return v.toString();
  const n = Number(v);
  return Number.isFinite(n) ? n.toString() : '—';
}

export async function initUserDashboard() {
  initThemeToggle();

  const avatarEl = document.getElementById('avatar');
  const avatarFileInput = document.getElementById('profilePictureInput');
  const banner = document.getElementById('emailVerifyBanner');

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

  async function loadStats() {
    const ids = {

      statRequests: 'requestsTotal',
      statBookings: 'bookingsTotal',
      statTickets: 'ticketsTotal',
      statPendingRequests: 'requestsPending',
      statCompletedBookings: 'bookingsCompleted',
      statAvgRating: 'averageRating',
    };

    try {
      const res = await apiFetch('/api/v1/dashboard/user', { method: 'GET' });
      const data = res?.data || res;
      Object.entries(ids).forEach(([domId, key]) => {
        const val = data?.[key];
        setText(domId, toNumberOrDash(val));
      });
    } catch (e) {
      // keep dashes on failure
      console.warn('Failed to load user dashboard stats:', e?.message || e);
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

  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async () => {
      const file = avatarFileInput.files?.[0];
      if (!file) return;

      try {
        avatarFileInput.disabled = true;
        toast({ title: 'Uploading', message: 'Updating profile picture…', variant: 'warning' });

        const fd = new FormData();
        fd.append('image', file);

        const r = await apiFetch('/api/v1/uploads/profile-picture', { method: 'POST', body: fd });
        const d = r?.data || r;
        if (d?.url) setAvatarUrl(d.url);
        toast({ title: 'Updated', message: 'Profile picture updated.', variant: 'success' });
      } catch (e) {
        toast({ title: 'Upload failed', message: e?.message || 'Try again.', variant: 'danger' });
      } finally {
        avatarFileInput.disabled = false;
        avatarFileInput.value = '';
      }
    });
  }

  const me = await fetchMe().catch(() => {
    clearToken();
    window.location.href = 'auth-login.html';
    return null;
  });

  if (!me) return;

  const user = me?.data || me;
  if (!user) return;

  const meNameEl = document.getElementById('meName');
  if (meNameEl) {
    meNameEl.textContent = user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : '—';
  }
  document.getElementById('meEmail')?.textContent = user?.email || '—';

  if (user?.profilePicture) setAvatarUrl(user.profilePicture);
  else {
    if (avatarEl) {
      avatarEl.textContent = getAvatarInitials(user?.firstName || 'BME');
      avatarEl.style.backgroundImage = '';
      avatarEl.style.background = 'rgba(124,92,255,0.12)';
      avatarEl.style.fontWeight = '900';
    }
  }

  // unlock banner
  if (banner) {
    const isVerified = !!user?.isVerified;
    banner.classList.toggle('d-none', isVerified);
  }

  try {
    const role = user?.role || user?.user?.role;
    await initAnnouncements({ role });
  } catch {}

  await loadStats();
}

