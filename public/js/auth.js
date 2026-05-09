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

function requireAuth(redirectTo = '/Frontend/pages/auth-login.html') {
  if (!getToken()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}


async function loginUser({ email, password }) {
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

async function registerUser(payload) {
  return apiFetch('/api/v1/auth/register', {
    method: 'POST',
    body: payload,
  });
}

async function logoutUser() {
  try {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
  } finally {
    clearToken();
  }
}

async function fetchMe() {
  return apiFetch('/api/v1/auth/me', { method: 'GET' });
}


