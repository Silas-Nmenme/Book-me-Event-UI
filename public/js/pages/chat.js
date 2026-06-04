import { apiFetch, fetchMe, logoutUser, clearToken, getUnreadCount, getRequestConversation, sendMessageByRequestId, uploadMessageAttachments } from '../api.js';
import { toast } from '../ui.js';


// currently active request id for the chat page (mutable)
let activeRequestIdModule = '';


function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return m[c] || c;
  });
}

function setAvatarUrl(el, url) {
  if (!el) return;
  if (url) {
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
    el.style.fontWeight = 'normal';
    return;
  }
  el.style.backgroundImage = '';
  el.textContent = 'BME';
  el.style.background = 'rgba(124,92,255,0.12)';
}

function getAvatarInitials(name) {
  return (name || 'BME')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('');
}

function renderMessage(m, { meId } = {}) {
  const sender = m?.sender || m?.senderId || m?.from || null;
  const senderId = (typeof sender === 'string' ? sender : sender?._id) || '';
  const text = m?.messageContent ?? (m?.message || m?.text || '');
  const createdAt = m?.createdAt ? new Date(m.createdAt).toLocaleString() : '';

  const isMe = meId && senderId && senderId.toString() === meId.toString();
  const dir = isMe ? 'justify-content-end' : 'justify-content-start';

  const attachments = Array.isArray(m?.attachments) ? m.attachments : [];
  const attachmentsHtml = attachments.length
    ? `
      <div class="bme-bubble-attachments mt-2">
        ${attachments
          .slice(0, 4)
          .map((a) => {
            const url = (a ?? '').toString();
            if (!url) return '';
            const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
            if (isImage) {
              return `
                <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" class="d-inline-block me-2 mb-2">
                  <img src="${escapeHtml(url)}" alt="attachment" style="max-width: 160px; max-height: 120px; border-radius: 10px;" />
                </a>
              `;
            }
            return `
              <div class="small">
                <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Attachment</a>
              </div>
            `;
          })
          .join('')}
      </div>
    `
    : '';

  return `
    <div class="d-flex ${dir} mb-2">
      <div class="bme-bubble ${isMe ? 'me' : 'them'}">
        <div class="bme-bubble-meta">${escapeHtml(isMe ? 'You' : (m?.sender?.firstName || senderId))}${createdAt ? ` • ${escapeHtml(createdAt)}` : ''}</div>
        <div class="bme-bubble-text">${escapeHtml(text)}</div>
        ${attachmentsHtml}
      </div>
    </div>
  `;
}


async function loadMe() {
  const res = await fetchMe();
  return res?.data || res;
}

async function loadRequest(requestId) {
  const res = await apiFetch(`/api/v1/requests/${encodeURIComponent(requestId)}`, { method: 'GET' });
  return res?.data || res;
}

async function loadConversation(requestId, myId, messagesList) {
  messagesList.innerHTML = '';
  if (!requestId) return;

  const res = await getRequestConversation(requestId, { page: 1, limit: 200 });
  const data = res?.data || res;
  const items = data?.data || data?.messages || data?.results || data || [];
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) {
    messagesList.innerHTML = `<div class="small text-muted-soft">No messages yet. Send the first message below.</div>`;
    return;
  }

  messagesList.innerHTML = arr.map((m) => renderMessage(m, { meId: myId })).join('');
  messagesList.scrollTop = messagesList.scrollHeight;
}

function buildConversationMeta(request, isVendor) {
  const service = request?.service?.name || request?.service?.serviceName || 'Service not available';
  const eventDate = request?.eventDate ? new Date(request.eventDate).toLocaleDateString() : 'Not scheduled';
  const location = request?.eventLocation || 'No location provided';
  return `Request status: ${escapeHtml(request?.status || 'unknown')} • ${escapeHtml(service)} • ${escapeHtml(eventDate)} • ${escapeHtml(location)}`;
}

async function loadUnread() {
  try {
    const res = await getUnreadCount();
    const count = res?.data?.unreadCount ?? res?.data?.count ?? res?.unreadCount ?? 0;
    const unreadCountEl = document.getElementById('unreadCount');
    if (unreadCountEl) unreadCountEl.textContent = count;
  } catch {
    const unreadCountEl = document.getElementById('unreadCount');
    if (unreadCountEl) unreadCountEl.textContent = '0';
  }
}

async function fetchUserRequestsForChat() {
  const res = await apiFetch('/api/v1/requests?status=ACCEPTED&page=1&limit=50', { method: 'GET' });
  const data = res?.data || res;
  const items = Array.isArray(data) ? data : data?.data || data?.requests || data || [];
  return Array.isArray(items) ? items : [];
}

function buildRequestOptionCard(r) {
  const id = r?._id || r?.id;
  const serviceName = r?.service?.serviceName || r?.service?.name || 'Service';
  const partnerName = r?.vendor?.businessName || r?.vendor?.name || r?.user?.firstName || 'Partner';
  const createdAt = r?.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
  const statusLabel = r?.status ? r.status.toString().toLowerCase() : 'unknown';

  return `
    <button class="btn btn-soft w-100 text-start mt-2" type="button" data-request-id="${escapeHtml(id)}">
      <div class="fw-bold">${escapeHtml(serviceName)} • ${escapeHtml(id?.slice?.(-6) || id || '')}</div>
      <div class="small text-muted-soft">${escapeHtml(partnerName)}${createdAt ? ` • ${escapeHtml(createdAt)}` : ''} • ${escapeHtml(statusLabel)}</div>
    </button>
  `;
}

async function loadRequestPicker(myId, isVendor, requestPickerShell, requestPickerEmpty, activePartnerLabel, activeRequestLabel, conversationMeta, messagesList, btnSendMessage, messageText) {
  const requests = await fetchUserRequestsForChat();
  if (!requests.length) {
    requestPickerEmpty?.classList.remove('d-none');
    requestPickerShell.innerHTML = '';
    return;
  }

  requestPickerEmpty?.classList.add('d-none');
  requestPickerShell.innerHTML = requests.map(buildRequestOptionCard).join('');

  requestPickerShell.querySelectorAll('[data-request-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rid = btn.getAttribute('data-request-id');
      if (!rid) return;
      await applyRequestSelection(rid, isVendor, activeRequestLabel, activePartnerLabel, conversationMeta, messagesList, btnSendMessage, messageText, myId);
    });
  });
}

async function applyRequestSelection(requestId, isVendor, activeRequestLabel, activePartnerLabel, conversationMeta, messagesList, btnSendMessage, messageText, myId) {
  if (!requestId) return;

  let request;
  try {
    request = await loadRequest(requestId);
  } catch (err) {
    const authzError = document.getElementById('authzError');
    authzError?.classList.remove('d-none');
    authzError.textContent = err?.message || 'Failed to load request details.';
    return;
  }

  activeRequestLabel.textContent = `Request ${requestId}`;
  if (activePartnerLabel) {
    activePartnerLabel.textContent = isVendor
      ? `Organizer: ${escapeHtml(request?.user?.firstName || request?.user?.email || 'Customer')}`
      : `Vendor: ${escapeHtml(request?.vendor?.businessName || request?.vendor?.user?.email || 'Vendor')}`;
  }

  if (conversationMeta) {
    conversationMeta.style.display = '';
    conversationMeta.classList.remove('d-none');
    conversationMeta.textContent = buildConversationMeta(request, isVendor);
  }

  await loadConversation(requestId, myId, messagesList);
  btnSendMessage?.removeAttribute('disabled');
  messageText?.removeAttribute('disabled');
}

export async function initChatPage({ role = 'USER' } = {}) {
  const requestId = qs('requestId');
  const isVendor = role.toString().toUpperCase() === 'VENDOR';
  const pageTitle = document.getElementById('pageTitle');
  const messagesList = document.getElementById('messagesList');
  const messageText = document.getElementById('messageText');
  const btnSendMessage = document.getElementById('btnSendMessage');
  const authzError = document.getElementById('authzError');
  const roleNotice = document.getElementById('roleNotice');
  const activeRequestLabel = document.getElementById('activeRequestLabel');
  const activePartnerLabel = document.getElementById('activeUserLabel') || document.getElementById('activeVendorLabel');
  const conversationMeta = document.getElementById('conversationMeta');
  const requestPickerShell = document.getElementById('requestPickerShell');
  const requestPickerEmpty = document.getElementById('requestPickerEmpty');
  const avatarEl = document.getElementById('avatar');

  if (!messagesList) return;

  if (pageTitle) {
    pageTitle.textContent = isVendor ? 'Chat with organizer' : 'Chat with vendor';
  }

  roleNotice?.classList.remove('d-none');
  roleNotice.textContent = isVendor
    ? 'Vendor replies enabled. Only customers connected to this request can chat here.'
    : 'Organizer chat enabled. Messages are scoped to the selected request.';

  let me;
  try {
    me = await loadMe();
  } catch (err) {
    authzError?.classList.remove('d-none');
    authzError.textContent = err?.message || 'Authentication failed.';
    return;
  }

  document.getElementById('meName').textContent = me?.firstName
    ? `${me.firstName} ${me.lastName || ''}`.trim()
    : me?.name || '—';
  document.getElementById('meEmail').textContent = me?.email || '—';
  document.getElementById('meRole').textContent = isVendor ? 'VENDOR' : 'USER';

  if (me?.profilePicture) {
    setAvatarUrl(avatarEl, me.profilePicture);
  } else {
    avatarEl.textContent = getAvatarInitials(me?.firstName || 'BME');
    avatarEl.style.backgroundImage = '';
    avatarEl.style.background = 'rgba(124,92,255,0.12)';
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

  const myId = me?._id || me?.id;
  activeRequestIdModule = requestId || '';


  if (requestPickerShell) {
    await loadRequestPicker(myId, isVendor, requestPickerShell, requestPickerEmpty, activePartnerLabel, activeRequestLabel, conversationMeta, messagesList, btnSendMessage, messageText);
  }

  if (!activeRequestIdModule) {
    if (!requestPickerShell) {
      authzError?.classList.remove('d-none');
      authzError.textContent = 'No request selected. Open this page through a request details or requests list.';
      messagesList.innerHTML = `<div class="small text-muted-soft">Select a request to view the chat.</div>`;
      btnSendMessage?.setAttribute('disabled', 'disabled');
      messageText?.setAttribute('disabled', 'disabled');
      return;
    }

    messagesList.innerHTML = `<div class="small text-muted-soft">Select a request to start chatting.</div>`;
    btnSendMessage?.setAttribute('disabled', 'disabled');
    messageText?.setAttribute('disabled', 'disabled');
    await loadUnread();
    return;
  }

  await applyRequestSelection(activeRequestIdModule, isVendor, activeRequestLabel, activePartnerLabel, conversationMeta, messagesList, btnSendMessage, messageText, myId);

  btnSendMessage?.addEventListener('click', async () => {
    const text = messageText.value.trim();
    if (!text) {
      toast({ title: 'Empty message', message: 'Type a message before sending.', variant: 'warning' });
      return;
    }

    try {
      const attachmentsInput = document.getElementById('attachmentsInput');
      const files = attachmentsInput?.files ? Array.from(attachmentsInput.files) : [];
      let attachments = [];

      if (files.length) {
        attachments = await uploadMessageAttachments(files);
      }

      await sendMessageByRequestId({
        requestId: activeRequestIdModule,
        messageContent: text,
        attachments: attachments.length ? attachments : undefined,
      });

      messageText.value = '';
      if (attachmentsInput) attachmentsInput.value = '';

      await loadConversation(activeRequestIdModule, myId, messagesList);
      await loadUnread();
      toast({ title: 'Sent', message: 'Message delivered.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Send failed', message: err?.message || 'Try again.', variant: 'danger' });
    }
  });


  messageText?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      btnSendMessage?.click();
    }
  });

  try {
    const socket = window.io
      ? window.io({
          transports: ['polling', 'websocket'],
          path: '/socket.io',
          auth: {
            token: (localStorage.getItem('token') || sessionStorage.getItem('token') || '')
          },
        })
      : null;


    if (socket && myId) {
      socket.on('connect', () => {
        socket.emit('join', { userId: myId });
      });

      socket.on('message:new', (payload) => {
        if (!payload?.request || payload.request?.toString() !== activeRequestIdModule?.toString()) {
          return;
        }

        const el = renderMessage(payload, { meId: myId });
        messagesList.insertAdjacentHTML('beforeend', el);
        messagesList.scrollTop = messagesList.scrollHeight;
        loadUnread();
      });
    }
  } catch (err) {
    console.warn('Socket init failed', err?.message);
  }

  await loadUnread();
}
