import { fetchMe, loginUser, logoutUser, registerUser, resetPassword, forgotPassword, setToken, clearToken } from './api.js';

export function requireAuth(redirectTo = 'auth-login.html') {
  const token = localStorage.getItem('bme_token');
  if (!token) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

export async function loginFlow({ email, password }) {
  const res = await loginUser({ email, password });
  if (res?.token) setToken(res.token);
  return res;
}

export async function registerFlow(payload) {
  const res = await registerUser(payload);
  if (res?.token) setToken(res.token);
  return res;
}

export async function forgotPasswordFlow({ email }) {
  return forgotPassword({ email });
}

export async function resetPasswordFlow({ token, password, passwordConfirm }) {
  return resetPassword({ token, password, passwordConfirm });
}

export async function logoutFlow() {
  try {
    await logoutUser();
  } finally {
    clearToken();
    window.location.href = 'index.html';
  }
}

export async function getRole() {
  const meRes = await fetchMe();
  const me = meRes?.data || meRes;
  return (me?.role || '').toString().toUpperCase();
}

