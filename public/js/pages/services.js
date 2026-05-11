import { fetchMe, logoutUser, clearToken } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

export async function initServicesPage({ me, role } = {}) {
  const shell = document.getElementById('servicesShell');
  const content = document.getElementById('contentArea');
  const authzError = document.getElementById('authzError');
  const roleNotice = document.getElementById('roleNotice');
  const serviceList = document.getElementById('serviceList');
  const noServices = document.getElementById('noServices');

  const linkRequests = document.getElementById('linkRequests');
  const linkMessages = document.getElementById('linkMessages');
  const linkBookings = document.getElementById('linkBookings');

  // These pages are UX only right now; CRUD may be restricted by backend.
  // Keep the UI responsive and guide users to requests/messages/bookings.
  if (!shell || !serviceList || !authzError) return;

  shell.classList.remove('d-none');

  const myRole = (role || qs('role') || 'USER').toString().toUpperCase();

  if (myRole === 'VENDOR') {
    if (linkRequests) linkRequests.classList.remove('btn-soft');
    if (linkMessages) linkMessages.classList.remove('btn-soft');
    if (linkBookings) linkBookings.classList.remove('btn-soft');
    // Vendor can typically act on requests/bookings/messages.
    roleNotice?.classList.remove('d-none');
    if (roleNotice) roleNotice.textContent = 'Vendor mode: manage your services indirectly via requests, messages, and bookings.';
  } else {
    roleNotice?.classList.remove('d-none');
    if (roleNotice) roleNotice.textContent = 'User mode: browse services, then create requests and message vendors.';
  }

  // Placeholder service list (since service CRUD endpoints may be restricted/not yet wired).
  serviceList.innerHTML = '';
  noServices?.classList.remove('d-none');

  // Ensure quick actions still work
  const btnGoCreateRequest = document.getElementById('btnGoCreateRequest');
  const btnGoIncoming = document.getElementById('btnGoIncoming');

  btnGoCreateRequest?.addEventListener('click', () => {
    window.location.href = 'requests.html';
  });

  btnGoIncoming?.addEventListener('click', () => {
    window.location.href = 'requests.html?status=pending';
  });

  // If backend returns a service list endpoint later, we can wire it here.
  try {
    // no-op: reserved for future endpoint wiring
  } catch (e) {
    authzError?.classList.remove('d-none');
    if (authzError) authzError.textContent = 'Could not load services right now.';
  }
}

