import {
  apiFetch,
  getMessages,
  getUnreadCount,
  sendMessage,
  getConversation,
} from '../api.js';

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

function renderMessage(m) {
  const senderId = m?.senderId || m?.from || m?.userId || '';
  const text = m?.text || m?.message || '';
  const createdAt = m?.createdAt ? new Date(m.createdAt).toLocaleString() : '';
  const isSystem = m?.type === 'system';

  const dir = isSystem ? 'justify-content-center' : 'justify-content-start';

  return `
    <div class="d-flex ${dir} mb-2">
      <div class="card card-glass p-2" style="max-width: 85%;">
        <div class="small text-muted-soft mb-1">${escapeHtml(senderId || '')}${createdAt ? ` • ${escapeHtml(createdAt)}` : ''}</div>
        <div style="white-space: pre-wrap;">${escapeHtml(text)}</div>
      </div>
    </div>
  `;
}

export async function initMessagesPage({ me, role } = {}) {
  const authzError = document.getElementById('authzError');

  const roleNotice = document.getElementById('roleNotice');
  const messagesList = document.getElementById('messagesList');
  const messageText = document.getElementById('messageText');
  const btnSendMessage = document.getElementById('btnSendMessage');
  const unreadCount = document.getElementById('unreadCount');

  if (!messagesList) return;

  const myRole = (role || qs('role') || 'USER').toString().toUpperCase();
  roleNotice?.classList.remove('d-none');
  roleNotice.textContent =
    myRole === 'VENDOR' ? 'Chat with the organizer (auto-selected).' : 'Chat with the vendor (auto-selected).';


  async function loadUnread() {
    try {
      const res = await getUnreadCount();
      const count = res?.data?.count ?? res?.count ?? res?.unread ?? 0;
      if (unreadCount) unreadCount.textContent = count;
    } catch {
      if (unreadCount) unreadCount.textContent = '0';
    }
  }

  async function loadConversation(userId) {
    authzError?.classList.add('d-none');
    messagesList.innerHTML = '';

    if (!userId) {
      authzError?.classList.remove('d-none');
      if (authzError) authzError.textContent = 'Enter a partner userId first.';
      return;
    }

    try {
      // Use messages/conversation endpoint
      const res = await getConversation(userId, { page: 1, limit: 50 });
      const data = res?.data || res;
      const items = data?.messages || data?.results || data?.items || data || [];

      if (Array.isArray(items) && items.length) {
        messagesList.innerHTML = items.map(renderMessage).join('');
      } else {
        messagesList.innerHTML = `<div class="small text-muted-soft">No messages yet.</div>`;
      }

      // Mark as read best-effort: mark all messages as read (backend route expects message id).
      // We do not have ids here; this is UX placeholder.
    } catch (e) {
      authzError?.classList.remove('d-none');
      if (authzError) authzError.textContent = e?.message || 'Failed to load conversation.';
    }
  }

  let partnerId = qs('userId') || qs('partnerId') || qs('recipient');

  async function resolvePartnerFromUrlOrData() {
    // Frontend: vendor incoming flow should open messages.html?userId=<request.userId>
    // User incoming flow should open messages.html?userId=<vendorId>
    if (partnerId) return partnerId;

    const requestId = qs('requestId');
    if (requestId) {
      // Best-effort: keep UI functional even if backend needs conversation mapping.
      // Current backend requires recipient for send; so we can’t resolve partner without it.
      return '';
    }

    return '';
  }

  btnSendMessage?.addEventListener('click', async () => {
    partnerId = await resolvePartnerFromUrlOrData();

    const text = messageText?.value?.trim();
    if (!partnerId) {
      toast({ title: 'Missing recipient', message: 'No partner selected for this chat.', variant: 'warning' });
      return;
    }
    if (!text) {
      toast({ title: 'Empty message', message: 'Type a message first.', variant: 'warning' });
      return;
    }

    try {
      await sendMessage({ recipient: partnerId, messageContent: text });
      messageText.value = '';
      toast({ title: 'Sent', message: 'Message delivered.', variant: 'success' });
      await loadConversation(partnerId);
      await loadUnread();
    } catch (e) {
      toast({ title: 'Send failed', message: e?.message || 'Try again.', variant: 'danger' });
    }
  });


  messageText?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSendMessage?.click();
  });

  // Auto-load if URL provides userId
  const initialUserId = qs('userId');
  if (initialUserId) {
    partnerId = initialUserId;
    await loadConversation(initialUserId);
  }


  await loadUnread();

  // Conversation via requestId could be supported later; reserved for future.
  const requestId = qs('requestId');
  if (requestId) {
    toast({ title: 'Tip', message: 'Conversation partner userId may be required by backend.', variant: 'warning' });
  }
}

