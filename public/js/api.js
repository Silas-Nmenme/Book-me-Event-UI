const API_BASE = (() => {
  // Preferred: meta tag injected at build/deploy time
  const meta = document.querySelector('meta[name="API_BASE"]');
  if (meta?.content) return meta.content;

  // Fallback: allow manual override without redeploy
  const ls = localStorage.getItem('bme_api_base');
  if (ls) return ls;

  // Last resort default (kept for backward compatibility)
  // Netlify frontend should call the Vercel backend deployed API
  return 'https://book-me-events.vercel.app';
})();

function getToken() {
  return localStorage.getItem('bme_token') || '';
}

function setToken(token) {
  if (!token) localStorage.removeItem('bme_token');
  else localStorage.setItem('bme_token', token);
}

function clearToken() {
  localStorage.removeItem('bme_token');
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // If body is an object (not FormData), assume JSON
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function safeText(v) {
  return (v ?? '').toString();
}

function formatMoneyNaira(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return safeText(value);
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return safeText(iso);
  return d.toLocaleString('en-NG', { year: 'numeric', month: 'short', day: '2-digit' });
}


