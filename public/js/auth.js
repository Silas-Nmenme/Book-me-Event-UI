import { fetchMe, loginUser, logoutUser, registerUser, resetPassword, forgotPassword, setToken, clearToken, getToken } from './api.js';

export function redirectToLogin(redirectTo = 'auth-login.html') {
  clearToken();
  window.location.replace(redirectTo);
}

export function requireAuth(redirectTo = 'auth-login.html') {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    redirectToLogin(redirectTo);
    return false;
  }
  return true;
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return !payload.exp || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
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
    window.location.replace('index.html');
  }
}

export async function getRole() {
  const meRes = await fetchMe();
  const me = meRes?.data || meRes;
  return (me?.role || '').toString().toUpperCase();
}

