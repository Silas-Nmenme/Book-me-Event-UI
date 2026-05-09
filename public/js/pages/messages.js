let activeWithUserId = '';
let activeConversationKey = '';

function setYear() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
}

function getQueryWithUserId() {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('with') || '';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

function renderSkeleton() {
  const sk = document.getElementById('convoSkeleton');
  if (sk) {
    sk.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'list-group-item skeleton';
      d.style.height = '54px';
      sk.appendChild(d);
    }
  }
}

function renderEmpty() {
  const empty = document.getElementById('convoEmpty');
  if (empty) empty.style.display = 'block';
}

function getPartnerFromMessage(m) {
  // conversation is between req.user and other.
  const senderId = m?.sender?._id || m?.sender || '';
  const recipientId = m?.recipient?._id || m?.recipient || '';

  // activeWithUserId can override.
  if (activeWithUserId) {
    return {
      partnerId: activeWithUserId,
      name: (m?.sender?._id === activeWithUserId ? (m.sender.firstName || '') : (m.recipient.firstName || '')) ||
        (m?.sender?.firstName || m?.recipient?.firstName || ''),
    };
  }

  // fallback guess
  return { partnerId: senderId || recipientId, name: '' };
}

function messageBubbleHTML(m, meId) {
  const senderId = m?.sender?._id || '';
  const isMe = meId && senderId && senderId.toString() === meId.toString();

  const senderName = m?.sender?.firstName
    ? `${m.sender.firstName} ${m.sender.lastName || ''}`.trim()
    : '';

  const content = m?.messageContent || m?.content || '';
  const time = m?.createdAt ? formatDate(m.createdAt) : '';

  if (isMe) {
    return `
      <div class="d-flex justify-content-end mb-2">
        <div class="p-2 rounded" style="max-width: 75%; background: rgba(124,92,255,0.15); border: 1px solid rgba(124,92,255,0.35);">
          <div style="white-space: pre-wrap;">${escapeHtml(content)}</div>
          <div class="text-muted-soft small mt-1 text-end">${escapeHtml(time)}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="d-flex justify-content-start mb-2">
      <div>
        <div class="text-muted-soft small mb-1">${escapeHtml(senderName || 'User')}</div>
        <div class="p-2 rounded" style="max-width: 75%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.10);">
          <div style="white-space: pre-wrap;">${escapeHtml(content)}</div>
          <div class="text-muted-soft small mt-1">${escapeHtml(time)}</div>
        </div>
      </div>
    </div>
  `;
}

async function fetchMe() {
  return apiFetch('/api/v1/auth/me', { method: 'GET' });
}

async function fetchUnreadCount() {
  return apiFetch('/api/v1/messages/unread/count', { method: 'GET' });
}

async function fetchConversation(userId) {
  // backend: GET /api/v1/messages/conversation/:userId
  return apiFetch(`/api/v1/messages/conversation/${encodeURIComponent(userId)}`, { method: 'GET' });
}

async function fetchMessagesAll() {
  // backend: GET /api/v1/messages (supports ?conversation= but we avoid)
  return apiFetch('/api/v1/messages', { method: 'GET' });
}

function buildConvoListFromMessages(messages, meId) {
  const map = new Map();

  for (const m of messages || []) {
    const senderId = m?.sender?._id || '';
    const recipientId = m?.recipient?._id || '';

    // partner is the other user
    const partnerId = senderId && senderId.toString() === meId.toString() ? recipientId : senderId;
    if (!partnerId) continue;

    if (!map.has(partnerId)) {
      const partner = senderId && senderId.toString() === partnerId.toString() ? m.sender : m.recipient;
      map.set(partnerId, {
        partnerId,
        partnerName: partner?.firstName ? `${partner.firstName} ${partner.lastName || ''}`.trim() : 'User',
        lastMessageAt: m?.createdAt,
        lastMessage: m?.messageContent || '',
      });
    } else {
      const cur = map.get(partnerId);
      const curTime = new Date(cur.lastMessageAt || 0).getTime();
      const newTime = new Date(m?.createdAt || 0).getTime();
      if (newTime > curTime) {
        cur.lastMessageAt = m?.createdAt;
        cur.lastMessage = m?.messageContent || '';
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
}

function renderConvoList(convos, onPick) {
  const list = document.getElementById('convoList');
  const empty = document.getElementById('convoEmpty');
  const skeleton = document.getElementById('convoSkeleton');
  if (skeleton) skeleton.innerHTML = '';

  if (!list) return;
  list.innerHTML = '';

  if (!convos.length) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  for (const c of convos) {
    const id = escapeHtml(c.partnerId);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-group-item list-group-item-action';
    item.style.textAlign = 'left';
    item.dataset.with = id;

    item.innerHTML = `
      <div class="fw-bold">${escapeHtml(c.partnerName)}</div>
      <div class="text-muted-soft small">${escapeHtml(c.lastMessage || '')}</div>
    `;

    item.addEventListener('click', () => onPick(c.partnerId));
    list.appendChild(item);
  }
}

async function loadChat(userId) {
  const chatTitle = document.getElementById('chatTitle');
  const partnerMeta = document.getElementById('chatPartnerMeta');
  const chatBox = document.getElementById('chatBox');
  if (!chatBox) return;

  activeWithUserId = userId || '';
  activeConversationKey = `${userId}`;

  chatTitle.textContent = 'Loading...';
  partnerMeta.textContent = '';
  chatBox.innerHTML = '';

  const me = await fetchMe();
  const meId = me?.id || me?.data?.id || me?.user?.id || me?._id || '';

  const res = await fetchConversation(userId);
  const msgs = res?.data || [];

  // Determine partner name from first message
  const first = msgs[0];
  const partnerName = first
    ? (first.sender?._id?.toString?.() === userId?.toString?.()
        ? `${first.sender.firstName || ''} ${first.sender.lastName || ''}`.trim()
        : `${first.recipient.firstName || ''} ${first.recipient.lastName || ''}`.trim())
    : 'User';

  chatTitle.textContent = partnerName || 'Chat';
  partnerMeta.textContent = `${msgs.length} messages`;

  for (const m of msgs) {
    chatBox.insertAdjacentHTML('beforeend', messageBubbleHTML(m, meId));
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const contentEl = document.getElementById('messageContent');
  const content = contentEl ? contentEl.value.trim() : '';
  if (!content) {
    toast({ title: 'Message empty', message: 'Type a message before sending.', variant: 'warning' });
    return;
  }
  if (!activeWithUserId) {
    toast({ title: 'Pick a chat', message: 'Select a conversation first.', variant: 'warning' });
    return;
  }

  const payload = {
    recipient: activeWithUserId,
    messageContent: content,
    // subject/booking/attachments optional
    conversationId: `${activeConversationKey}`,
  };

  try {
    setLoading(document.getElementById('btnSendMessage'), true, 'Sending...');
    await apiFetch('/api/v1/messages', { method: 'POST', body: payload });
    contentEl.value = '';
    await loadChat(activeWithUserId);
    const badge = document.getElementById('unreadBadge');
    if (badge) badge.textContent = 'Updated';
  } catch (e) {
    toast({ title: 'Send failed', message: e.message || 'Try again.', variant: 'danger' });
  } finally {
    setLoading(document.getElementById('btnSendMessage'), false);
  }
}

async function loadConversations() {
  const unreadBadge = document.getElementById('unreadBadge');
  try {
    const unread = await fetchUnreadCount();
    if (unreadBadge) unreadBadge.textContent = `${unread?.unreadCount ?? 0} unread`;
  } catch {
    // ignore
  }

  renderSkeleton();

  const me = await fetchMe();
  const meId = me?.id || me?.data?.id || me?.user?.id || me?._id || '';

  let res;
  try {
    res = await fetchMessagesAll();
  } catch {
    if (unreadBadge) unreadBadge.textContent = '0 unread';
    return;
  }

  const messages = res?.data || [];
  const convos = buildConvoListFromMessages(messages, meId);

  const onPick = async (userId) => {
    await loadChat(userId);
  };

  renderConvoList(convos, onPick);

  return convos;
}

async function init() {
  setYear();
  setAuthNav();

  const btnSend = document.getElementById('btnSendMessage');
  if (btnSend) btnSend.addEventListener('click', sendMessage);

  const btnRefreshChat = document.getElementById('btnRefreshChat');
  if (btnRefreshChat) btnRefreshChat.addEventListener('click', () => activeWithUserId ? loadChat(activeWithUserId) : null);

  // Load conversations + optionally open one from query param
  const withId = getQueryWithUserId();
  const convos = await loadConversations();

  if (withId) {
    try {
      await loadChat(withId);
    } catch {
      // fall back
      if (convos && convos.length) await loadChat(convos[0].partnerId);
    }
  } else if (convos && convos.length) {
    await loadChat(convos[0].partnerId);
  }

  const hint = document.getElementById('chatHint');
  if (hint) hint.style.display = 'block';

  const contentEl = document.getElementById('messageContent');
  if (contentEl) {
    contentEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendMessage();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);

