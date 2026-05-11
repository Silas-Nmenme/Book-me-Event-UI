import { fetchMe, clearToken } from './api.js';

function getRole() {
  return (document.documentElement.dataset.role || '').toString().toUpperCase();
}

function roleToDashboard(role) {
  const r = (role || '').toString().toUpperCase();
  if (r === 'USER') return 'user-dashboard.html';
  if (r === 'VENDOR') return 'vendor-dashboard.html';
  if (r === 'ADMIN') return 'admin-dashboard.html';
  return 'auth-login.html';
}

export async function initNavbarBrandRoleRedirect({ selector = '.bme-navbar .navbar-brand', onAuthRequired } = {}) {
  const brand = document.querySelector(selector);
  if (!brand) return;

  brand.addEventListener('click', async (e) => {
    e.preventDefault();

    try {
      const res = await fetchMe();
      const me = res?.data || res;
      const role = (me?.role || me?.user?.role || '').toString().toUpperCase();
      document.documentElement.dataset.role = role;

      const next = roleToDashboard(role);
      window.location.href = next;
    } catch (err) {
      clearToken();
      if (typeof onAuthRequired === 'function') onAuthRequired(err);
      window.location.href = 'auth-login.html';
    }
  });
}

