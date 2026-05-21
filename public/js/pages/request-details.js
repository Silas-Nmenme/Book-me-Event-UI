import { fetchMe, logoutUser, clearToken, getRequest, acceptRequest, declineRequest, cancelRequest } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>'"]/g, (c) => {
    const m = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return m[c] || c;
  });
}

function formatDate(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString();
}

function formatAmount(amount, currency = 'NGN') {
  if (amount == null || amount === '') return '—';
  return `${currency.toUpperCase()} ${Number(amount).toLocaleString()}`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function buildStatusBadge(status) {
  const normalized = (status || 'unknown').toString().toLowerCase();
  const map = {
    pending: 'warning',
    accepted: 'success',
    declined: 'danger',
    cancelled: 'secondary',
    canceled: 'secondary',
    completed: 'success',
  };
  const text = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Unknown';
  const variant = map[normalized] || 'secondary';
  return `<span class="badge text-bg-${variant}">${escapeHtml(text)}</span>`;
}

function createActionButton(label, classes, id, href) {
  if (href) {
    return `<a class="${classes}" id="${id}" href="${href}">${escapeHtml(label)}</a>`;
  }
  return `<button class="${classes}" id="${id}" type="button">${escapeHtml(label)}</button>`;
}

export async function initRequestDetailsPage() {
  const requestId = qs('requestId');
  const authzError = document.getElementById('authzError');
  const requestDetailsShell = document.getElementById('requestDetailsShell');
  const statusBadgeWrap = document.getElementById('statusBadgeWrap');
  const requestActions = document.getElementById('requestActions');
  const btnViewMessages = document.getElementById('btnViewMessages');
  const btnBack = document.getElementById('btnBack');

  if (!requestId) {
    authzError?.classList.remove('d-none');
    if (authzError) authzError.textContent = 'Request ID is required to review details.';
    return;
  }

  let me;
  try {
    const meRes = await fetchMe();
    me = meRes?.data || meRes;
  } catch (err) {
    authzError?.classList.remove('d-none');
    authzError.textContent = err?.message || 'Unable to verify session.';
    return;
  }

  const role = (me?.role || 'USER').toString().toUpperCase();
  setText('meName', me?.firstName ? `${me.firstName} ${me.lastName || ''}`.trim() : me?.name || '—');
  setText('meEmail', me?.email || '—');
  setText('meRole', role);

  const avatarEl = document.getElementById('avatar');
  if (avatarEl) {
    if (me?.profilePicture) {
      avatarEl.style.backgroundImage = `url(${me.profilePicture})`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
      avatarEl.style.fontWeight = 'normal';
    } else {
      avatarEl.textContent = (me?.firstName || 'BME')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0].toUpperCase())
        .join('');
      avatarEl.style.backgroundImage = '';
      avatarEl.style.background = 'rgba(124,92,255,0.12)';
    }
  }

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await logoutUser();
    } finally {
      clearToken();
      sessionStorage.clear();
      localStorage.clear();
      toast({ title: 'Logged out', message: 'See you again.', variant: 'success' });
      window.location.href = 'auth-login.html';
    }
  });

  try {
    const res = await getRequest(requestId);
    const request = res?.data || res;
    if (!request || !request._id) {
      throw new Error('Request not found');
    }

    const serviceLabel = request?.service?.serviceName || request?.service?.title || 'Unknown service';
    setText('requestTitle', serviceLabel);
    setText('requestId', request._id);
    setText('requestService', serviceLabel);
    setText('requestEventDate', formatDate(request.eventDate));
    setText('requestLocation', request.eventLocation || '—');
    setText('requestBudget', formatAmount(request.budgetAmount, request.budgetCurrency || 'NGN'));
    setText('requestGuests', request.guestCount != null ? String(request.guestCount) : '—');
    setText('requestDeadline', request.responseDeadline ? formatDate(request.responseDeadline) : '—');
    setText('requestCreatedAt', formatDate(request.createdAt));
    setText('requestDescription', request.eventDescription || '—');
    setText('requestNotes', request.notes || '—');

    const isVendor = role === 'VENDOR';
    const partner = isVendor ? request.user : request.vendor;
    const partnerHeading = isVendor ? 'Customer details' : 'Vendor details';
    const partnerRole = isVendor ? 'Customer' : 'Vendor';
    const partnerName = isVendor
      ? `${partner?.firstName || ''} ${partner?.lastName || ''}`.trim() || partner?.email || '—'
      : partner?.businessName || partner?.email || '—';
    const partnerContact = isVendor
      ? partner?.email || partner?.phone || '—'
      : partner?.email || partner?.phone || '—';

    setText('partnerHeading', partnerHeading);
    setText('partnerRole', partnerRole);
    setText('partnerName', partnerName);
    setText('partnerContact', partnerContact);
    statusBadgeWrap.innerHTML = buildStatusBadge(request.status);
    requestDetailsShell.classList.remove('d-none');

    const messagesPage = isVendor
      ? `vendor-message.html?requestId=${encodeURIComponent(request._id)}`
      : `user-message.html?requestId=${encodeURIComponent(request._id)}`;
    btnViewMessages.href = messagesPage;

    const bookingsPage = `bookings.html?requestId=${encodeURIComponent(request._id)}`;
    document.getElementById('btnViewBookings').setAttribute('href', bookingsPage);

    btnBack.href = role === 'VENDOR' ? 'vendor-service.html' : 'user-request.html';

    const actionButtons = [];

    if (request.status?.toString().toUpperCase() === 'PENDING') {
      if (isVendor) {
        actionButtons.push(createActionButton('Accept request', 'btn btn-success', 'btnAccept'));
        actionButtons.push(createActionButton('Decline request', 'btn btn-danger', 'btnDecline'));
      } else {
        actionButtons.push(createActionButton('Cancel request', 'btn btn-danger', 'btnCancel'));
      }
    }

    if (!isVendor && request.status?.toString().toUpperCase() === 'ACCEPTED') {
      actionButtons.push(createActionButton('Book service', 'btn btn-primary', 'btnBook', `create-booking.html?requestId=${encodeURIComponent(request._id)}`));
    }

    actionButtons.push(createActionButton('Open chat', 'btn btn-soft', 'btnOpenChat', messagesPage));

    requestActions.innerHTML = actionButtons.join(' ');

    if (document.getElementById('btnAccept')) {
      document.getElementById('btnAccept')?.addEventListener('click', async () => {
        try {
          await acceptRequest(request._id);
          toast({ title: 'Accepted', message: 'Request accepted successfully.', variant: 'success' });
          window.location.reload();
        } catch (err) {
          toast({ title: 'Action failed', message: err?.message || 'Try again.', variant: 'danger' });
        }
      });
    }

    if (document.getElementById('btnDecline')) {
      document.getElementById('btnDecline')?.addEventListener('click', async () => {
        if (!confirm('Decline this request?')) return;
        try {
          await declineRequest(request._id);
          toast({ title: 'Declined', message: 'Request declined successfully.', variant: 'success' });
          window.location.reload();
        } catch (err) {
          toast({ title: 'Action failed', message: err?.message || 'Try again.', variant: 'danger' });
        }
      });
    }

    if (document.getElementById('btnCancel')) {
      document.getElementById('btnCancel')?.addEventListener('click', async () => {
        if (!confirm('Cancel this request?')) return;
        try {
          await cancelRequest(request._id);
          toast({ title: 'Cancelled', message: 'Request cancelled successfully.', variant: 'success' });
          window.location.reload();
        } catch (err) {
          toast({ title: 'Action failed', message: err?.message || 'Try again.', variant: 'danger' });
        }
      });
    }
  } catch (err) {
    authzError?.classList.remove('d-none');
    authzError.textContent = err?.message || 'Failed to load request details.';
  }
}
