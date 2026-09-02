import { BACKEND_URL, TOKEN_KEY } from '../constant.js';

const LEGACY_TOKEN_KEYS = ['token'];

function getStorage() {
  try {
    return window?.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function getLegacyTokenCandidates() {
  return [TOKEN_KEY, ...LEGACY_TOKEN_KEYS];
}

export function getToken() {
  const store = getStorage();
  if (!store) return '';

  for (const key of getLegacyTokenCandidates()) {
    try {
      const token = store.getItem(key);
      if (token && token.trim()) return token.trim();
    } catch {}
  }

  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('token');
    if (sessionToken && sessionToken.trim()) return sessionToken.trim();
  } catch {}

  return '';
}

export function clearToken() {
  for (const key of getLegacyTokenCandidates()) {
    try {
      localStorage.removeItem(key);
    } catch {}
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

export function setToken(token) {
  const normalized = (token || '').toString().trim();
  if (!normalized) {
    clearToken();
    return;
  }

  const keys = getLegacyTokenCandidates();
  try {
    keys.forEach((key) => localStorage.setItem(key, normalized));
    return;
  } catch {
    // Ignore storage quota failures and fall back to temporary in-session storage.
    try {
      keys.forEach((key) => sessionStorage.setItem(key, normalized));
    } catch {}
  }
}

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function buildUrl(path) {
  if (!path) return BACKEND_URL;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${p}`;
}

function addFormValue(form, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => form.append(key, item));
    return;
  }
  form.append(key, value);
}

function createMultipartBody(payload = {}, files = [], fileField = 'images') {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => addFormValue(form, key, value));
  Array.from(files || []).filter(Boolean).forEach((file) => form.append(fileField, file));
  return form;
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

  const timeoutMs = Number(options.timeoutMs || 0);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller?.signal,
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

      if (res.status === 401 || res.status === 403) {
        clearToken();
      }

      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutError = new Error('The payment service is taking too long. Please try again in a moment.');
      timeoutError.status = 504;
      timeoutError.data = { message: timeoutError.message };
      throw timeoutError;
    }

    if (err?.status === 401 || err?.status === 403) {
      clearToken();
    }

    throw err;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export async function loginUser({ email, password, totpCode } = {}) {
  const payload = totpCode ? { email, password, totpCode } : { email, password };
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerUser({ firstName, lastName, email, phone, password, passwordConfirm } = {}) {
  if (!firstName || !lastName || !email || !phone || !password || !passwordConfirm) {
    const error = new Error('firstName, lastName, email, phone, password, and passwordConfirm are required');
    error.status = 400;
    throw error;
  }

  return apiFetch('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, phone, password, passwordConfirm }),
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
  const token = getToken();
  try {
    return await apiFetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err) {
    return { message: 'Logged out' };
  } finally {
    clearToken();
  }
}

export async function fetchMe() {
  return apiFetch('/api/v1/auth/me', { method: 'GET' });
}

export async function verifyUserOtp({ email, otp } = {}) {
  return apiFetch('/api/v1/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
}

export async function registerVendorPage1(payload) {
  return apiFetch('/api/v1/vendors/register/page1', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerVendorPage2(payload) {
  return apiFetch('/api/v1/vendors/register/page2', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerVendorPage3({ email } = {}) {
  return apiFetch('/api/v1/vendors/register/page3', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyVendorOtp({ email, otp } = {}) {
  return apiFetch('/api/v1/vendors/register/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
}

export async function registerAdminPage1(payload) {
  return apiFetch('/api/v1/admin/register/page1', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyAdminOtp({ email, otp } = {}) {
  return apiFetch('/api/v1/admin/register/page2/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
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

export async function getUserBookings(id, { page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/v1/users/${encodeURIComponent(id)}/bookings?${params}`, { method: 'GET' });
}

export async function getUserRequests(id, { page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/v1/users/${encodeURIComponent(id)}/requests?${params}`, { method: 'GET' });
}

export async function getUsers({ page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/v1/users?${params}`, { method: 'GET' });
}

// =====================
// Vendors and services
// =====================
export async function getVendors({ category, search, verified, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  if (verified !== undefined) params.set('verified', verified);
  return apiFetch(`/api/v1/vendors?${params}`, { method: 'GET' });
}

export async function getVendor(id) {
  return apiFetch(`/api/v1/vendors/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function getVendorServices(id) {
  return apiFetch(`/api/v1/vendors/${encodeURIComponent(id)}/services`, { method: 'GET' });
}

export async function getVendorReviews(id) {
  return apiFetch(`/api/v1/vendors/${encodeURIComponent(id)}/reviews`, { method: 'GET' });
}

export async function getVendorBookings(id, { page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/v1/vendors/${encodeURIComponent(id)}/bookings?${params}`, { method: 'GET' });
}

export async function getServices({ category, search, featured, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  if (featured !== undefined) params.set('featured', featured);
  return apiFetch(`/api/v1/services?${params}`, { method: 'GET' });
}

export async function getService(id) {
  return apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function createService(payload = {}, files = []) {
  const body = files?.length ? createMultipartBody(payload, files) : JSON.stringify(payload);
  return apiFetch('/api/v1/services', { method: 'POST', body });
}

export async function updateService(id, payload = {}, files = []) {
  const body = files?.length ? createMultipartBody(payload, files) : JSON.stringify(payload);
  return apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

export async function deleteService(id) {
  return apiFetch(`/api/v1/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

export async function deleteRequest(id) {
  return apiFetch(`/api/v1/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

export async function getUpcomingBookings() {
  return apiFetch('/api/v1/bookings/upcoming', { method: 'GET' });
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

export async function getMessagesPreview() {
  return apiFetch('/api/v1/messages/preview', { method: 'GET' });
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
    body: JSON.stringify({
      messageContent,
      attachments,
      subject,
      booking,
    }),
  });
}

// Upload one or more files and return Cloudinary URLs.
// Used for chat attachments.
export async function uploadMessageAttachments(files = []) {
  if (!Array.isArray(files) || !files.length) return [];

  const form = new FormData();
  // Backend upload expects multipart/form-data with field name `image`.
  // We'll upload each file as a separate request to keep response handling simple/reliable.
  const urls = [];
  for (const file of files) {
    if (!file) continue;
    form.delete('image');
    form.set('image', file);
    const res = await apiFetch('/api/v1/uploads/generic', { method: 'POST', body: form });
    const data = res?.data || res;
    if (data?.url) urls.push(data.url);
  }
  return urls;
}

export async function uploadProfilePicture(file) {
  const body = createMultipartBody({}, [file], 'image');
  return apiFetch('/api/v1/uploads/profile-picture', { method: 'POST', body });
}

export async function uploadVendorKyc(file) {
  const body = createMultipartBody({}, [file], 'image');
  return apiFetch('/api/v1/uploads/vendor-kyc', { method: 'POST', body });
}



export async function markMessageAsRead(id) {
  return apiFetch(`/api/v1/messages/${id}/read`, { method: 'PUT' });
}

export async function deleteMessage(id) {
  return apiFetch(`/api/v1/messages/${id}`, { method: 'DELETE' });
}

// =====================
// Dashboards and widgets
// =====================
export async function getUserDashboard() {
  return apiFetch('/api/v1/dashboard/user', { method: 'GET' });
}

export async function getVendorDashboard() {
  return apiFetch('/api/v1/dashboard/vendor', { method: 'GET' });
}

export async function getPlatformStats() {
  return apiFetch('/api/v1/stats/platform', { method: 'GET' });
}

export async function getActivityFeed() {
  return apiFetch('/api/v1/activity-feed', { method: 'GET' });
}

export async function getCompletedUnreviewedBookings() {
  return apiFetch('/api/v1/bookings?status=completed&reviewed=false', { method: 'GET' });
}

export async function getLandingVendorMarquee() {
  return apiFetch('/api/v1/landing/vendor-marquee', { method: 'GET' });
}

// =====================
// Support tickets and activity
// =====================
export async function createTicket(payload) {
  return apiFetch('/api/v1/tickets', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getMyTickets({ status, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  return apiFetch(`/api/v1/tickets/me?${params}`, { method: 'GET' });
}

export async function getTicket(id) {
  return apiFetch(`/api/v1/tickets/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function getMyActivity({ page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/v1/users/activity?${params}`, { method: 'GET' });
}

export async function getMyBookingTracking({ page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/v1/users/bookings/tracking?${params}`, { method: 'GET' });
}

// =====================
// Announcements
// =====================
export async function getMyAnnouncements({ page = 1, limit = 20, unreadOnly } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (unreadOnly !== undefined) params.set('unreadOnly', unreadOnly);
  return apiFetch(`/api/v1/announcements?${params}`, { method: 'GET' });
}

export async function markAnnouncementRead(id) {
  return apiFetch(`/api/v1/announcements/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

// =====================
// Vendor profile and promotions
// =====================
export async function createVendor(payload) {
  return apiFetch('/api/v1/vendors', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateVendor(id, payload) {
  return apiFetch(`/api/v1/vendors/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteVendor(id) {
  return apiFetch(`/api/v1/vendors/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getVendorAnalytics() {
  return apiFetch('/api/v1/vendors/analytics', { method: 'GET' });
}

export async function getVendorSla() {
  return apiFetch('/api/v1/vendors/sla', { method: 'GET' });
}

export async function getVendorTickets({ status, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  return apiFetch(`/api/v1/vendors/tickets?${params}`, { method: 'GET' });
}

export async function getMyPromotions({ page = 1, limit = 20, isActive } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (isActive !== undefined) params.set('isActive', isActive);
  return apiFetch(`/api/v1/vendors/promotions?${params}`, { method: 'GET' });
}

export async function createPromotion(payload) {
  return apiFetch('/api/v1/vendors/promotions', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updatePromotion(id, payload) {
  return apiFetch(`/api/v1/vendors/promotions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deletePromotion(id) {
  return apiFetch(`/api/v1/vendors/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getPublicPromotions({ serviceCategory, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (serviceCategory) params.set('serviceCategory', serviceCategory);
  return apiFetch(`/api/v1/vendors/promotions/public?${params}`, { method: 'GET' });
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

export async function getPaymentStats() {
  return apiFetch('/api/v1/payments/stats/overview', { method: 'GET' });
}

export async function getPaymentsSummary() {
  return apiFetch('/api/v1/payments/summary', { method: 'GET' });
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
    timeoutMs: 20000,
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

export async function getAdminAudit({
  userId,
  actionType,
  actorId,
  entityType,
  entityId,
  severity,
  page = 1,
  limit = 20,
} = {}) {
  const params = new URLSearchParams({ page, limit });
  const filters = { userId, actionType, actorId, entityType, entityId, severity };
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return apiFetch(`/api/v1/admin/audit?${params}`, { method: 'GET' });
}

// =====================
// Admin fraud signals
// =====================
export async function getFraudSignals({ days = 30 } = {}) {
  const params = new URLSearchParams();
  if (days) params.set('days', days);
  return apiFetch(`/api/v1/fraud/signals?${params.toString()}`, { method: 'GET' });
}






