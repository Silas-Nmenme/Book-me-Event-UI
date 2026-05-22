import { BACKEND_URL, TOKEN_KEY } from '../constant.js';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function setToken(token) {
  if (!token) clearToken();
  else localStorage.setItem(TOKEN_KEY, token);
}

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function buildUrl(path) {
  if (!path) return BACKEND_URL;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${p}`;
}

export async function apiFetch(path, options = {}) {
  const url = buildUrl(path);

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    const isJsonObjectBody = typeof options.body === 'object' && !(options.body instanceof FormData);
    const isJsonStringBody = typeof options.body === 'string' && /^[\s\[{]/.test(options.body);

    if (isJsonObjectBody || isJsonStringBody) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
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

export async function loginUser({ email, password }) {
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function registerUser({ firstName, lastName, email, phone, password, passwordConfirm, role }) {
  return apiFetch('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, phone, password, passwordConfirm, role }),
  });
}

export async function forgotPassword({ email }) {
  return apiFetch('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword({ token, password, passwordConfirm }) {
  return apiFetch(`/api/v1/auth/reset-password/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify({ password, passwordConfirm }),
  });
}

export async function logoutUser() {
  // Clear locally first so the app cannot keep an auth header on subsequent calls.
  // The backend logout endpoint may return 401 if the token is already gone/expired,
  // which should not block client-side logout.
  clearToken();

  try {
    return await apiFetch('/api/v1/auth/logout', { method: 'POST' });
  } catch (err) {
    // Swallow auth-related failures (e.g., 401 Unauthorized) since we already cleared the session.
    return { message: 'Logged out' };
  }
}

export async function fetchMe() {
  return apiFetch('/api/v1/auth/me', { method: 'GET' });
}

export async function sendVerificationEmail() {
  return apiFetch('/api/v1/auth/send-verification-email', { method: 'POST' });
}

export async function verifyEmail({ token } = {}) {
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return apiFetch(`/api/v1/auth/verify-email${q}`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}


// =====================
// Users (profile + related resources)
// =====================
export async function getUser(id) {
  return apiFetch(`/api/v1/users/${id}`, { method: 'GET' });
}

export async function updateUser(id, payload) {
  return apiFetch(`/api/v1/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(id) {
  return apiFetch(`/api/v1/users/${id}`, { method: 'DELETE' });
}


// =====================
// Requests
// =====================
export async function getRequests({ status, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/requests${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}

export async function getRequest(id) {
  return apiFetch(`/api/v1/requests/${id}`, { method: 'GET' });
}


export async function createRequest(payload) {
  return apiFetch('/api/v1/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function acceptRequest(id) {
  return apiFetch(`/api/v1/requests/${id}/accept`, { method: 'PUT' });
}

export async function declineRequest(id) {
  return apiFetch(`/api/v1/requests/${id}/decline`, { method: 'PUT' });
}

export async function cancelRequest(id, payload = {}) {
  return apiFetch(`/api/v1/requests/${id}/cancel`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateRequest(id, payload) {
  return apiFetch(`/api/v1/requests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// =====================
// Bookings
// =====================
export async function getBookings({ status, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/bookings${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}

export async function getBooking(id) {
  return apiFetch(`/api/v1/bookings/${id}`, { method: 'GET' });
}

export async function createBooking(payload) {
  return apiFetch('/api/v1/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBooking(id, payload) {
  return apiFetch(`/api/v1/bookings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function cancelBooking(id, payload = {}) {
  return apiFetch(`/api/v1/bookings/${id}/cancel`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function completeBooking(id) {
  return apiFetch(`/api/v1/bookings/${id}/complete`, { method: 'PUT' });
}

export async function deleteBooking(id) {
  return apiFetch(`/api/v1/bookings/${id}`, { method: 'DELETE' });
}

// =====================
// Messages
// =====================
export async function getMessages({ conversation, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (conversation) params.set('conversation', conversation);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/messages${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}

export async function getUnreadCount() {
  return apiFetch('/api/v1/messages/unread/count', { method: 'GET' });
}

export async function getConversation(userId, { page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/messages/conversation/${userId}${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}

export async function getRequestConversation(requestId, { page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/messages/request/${encodeURIComponent(requestId)}${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}


export async function getMessage(id) {
  return apiFetch(`/api/v1/messages/${id}`, { method: 'GET' });
}

export async function sendMessage(payload) {
  return apiFetch('/api/v1/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function sendMessageByRequestId({ requestId, messageContent, attachments, subject, booking } = {}) {
  return apiFetch(`/api/v1/messages/request/${encodeURIComponent(requestId)}`, {
    method: 'POST',
    body: JSON.stringify({ messageContent, attachments, subject, booking }),
  });
}


export async function markMessageAsRead(id) {
  return apiFetch(`/api/v1/messages/${id}/read`, { method: 'PUT' });
}

export async function deleteMessage(id) {
  return apiFetch(`/api/v1/messages/${id}`, { method: 'DELETE' });
}

// =====================
// Payments
// =====================
export async function getPayments({ status, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/payments${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}

export async function getPayment(id) {
  return apiFetch(`/api/v1/payments/${id}`, { method: 'GET' });
}

export async function getPaymentByRef(ref) {
  return apiFetch(`/api/v1/payments/ref/${encodeURIComponent(ref)}`, { method: 'GET' });
}

export async function createPayment(payload) {
  return apiFetch('/api/v1/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function initializeFlutterwavePayment(bookingId) {
  return apiFetch('/api/v1/payments/initialize', {
    method: 'POST',
    body: JSON.stringify({ bookingId }),
  });
}

export async function refundPayment(id, payload = {}) {
  return apiFetch(`/api/v1/payments/${id}/refund`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// =====================
// Reviews
// =====================
export async function getReviews({ vendor, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (vendor) params.set('vendor', vendor);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  const qsStr = params.toString();
  return apiFetch(`/api/v1/reviews${qsStr ? `?${qsStr}` : ''}`, { method: 'GET' });
}

export async function getReview(id) {
  return apiFetch(`/api/v1/reviews/${id}`, { method: 'GET' });
}

export async function createReview(payload) {
  return apiFetch('/api/v1/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateReview(id, payload) {
  return apiFetch(`/api/v1/reviews/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteReview(id) {
  return apiFetch(`/api/v1/reviews/${id}`, { method: 'DELETE' });
}

export async function addVendorResponse(id, payload) {
  return apiFetch(`/api/v1/reviews/${id}/vendor-response`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function markReviewHelpful(id) {
  return apiFetch(`/api/v1/reviews/${id}/helpful`, { method: 'PUT' });
}

export async function markReviewUnhelpful(id) {
  return apiFetch(`/api/v1/reviews/${id}/unhelpful`, { method: 'PUT' });
}

// =====================
// Admin
// =====================
export async function getAdminDashboard() {
  return apiFetch('/api/v1/admin/dashboard', { method: 'GET' });
}

export async function getPendingVendors({ page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  return apiFetch(`/api/v1/admin/vendors/pending?${params.toString()}`, { method: 'GET' });
}

export async function verifyVendor(vendorId) {
  return apiFetch(`/api/v1/admin/vendors/${vendorId}/verify`, { method: 'PUT' });
}

export async function rejectVendor(vendorId, payload = {}) {
  return apiFetch(`/api/v1/admin/vendors/${vendorId}/reject`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getAdminUsers({ role, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  return apiFetch(`/api/v1/admin/users?${params.toString()}`, { method: 'GET' });
}

export async function toggleUserStatus(userId) {
  return apiFetch(`/api/v1/admin/users/${userId}/toggle-status`, { method: 'PUT' });
}

export async function getAdminBookings({ status, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  return apiFetch(`/api/v1/admin/bookings?${params.toString()}`, { method: 'GET' });
}

export async function getAdminPayments({ status, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  return apiFetch(`/api/v1/admin/payments?${params.toString()}`, { method: 'GET' });
}

export async function getAdminStats() {
  return apiFetch('/api/v1/admin/stats', { method: 'GET' });
}

export async function sendAnnouncement(payload) {
  // Admin UI can send recipientType=ALL. Backend expands it.
  return apiFetch('/api/v1/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}





