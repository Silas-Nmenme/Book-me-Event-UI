import { apiFetch, getToken } from '../api.js';
import { BACKEND_URL } from '../../constant.js';

const formatTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

function safeLink(value) {
  if (!value) return 'annoncement.html';
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin ? `${url.pathname.split('/').pop()}${url.search}${url.hash}` : 'annoncement.html';
  } catch {
    return 'annoncement.html';
  }
}

export function initNotificationCenter({ userId, limit = 8 } = {}) {
  const list = document.getElementById('notificationList');
  const empty = document.getElementById('notificationEmpty');
  const badge = document.getElementById('notificationUnreadCount');
  const markAllButton = document.getElementById('notificationsMarkAllRead');
  if (!list || !empty || !badge) return;
  const emptyLabel = empty.textContent || 'No notifications.';

  async function refresh() {
    try {
      const response = await apiFetch(`/api/v1/notifications?limit=${encodeURIComponent(limit)}`);
      const items = Array.isArray(response?.data) ? response.data : [];
      const unreadCount = Number(response?.unreadCount) || 0;
      empty.textContent = emptyLabel;
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.classList.toggle('d-none', unreadCount === 0);
      list.replaceChildren(empty);
      empty.classList.toggle('d-none', items.length > 0);

      for (const item of items) {
        const row = document.createElement('div');
        row.className = `notification-row py-2 border-bottom${item.isRead ? '' : ' fw-semibold'}`;
        const link = document.createElement('a');
        link.className = 'dropdown-item text-wrap px-0';
        link.href = safeLink(item.link);
        link.textContent = item.title || 'Notification';
        const message = document.createElement('div');
        message.className = 'small text-muted-soft';
        message.textContent = item.message || '';
        const time = document.createElement('time');
        time.className = 'small text-muted-soft';
        time.dateTime = item.createdAt || '';
        time.textContent = formatTimestamp(item.createdAt);
        row.append(link, message, time);

        if (!item.isRead) {
          const markRead = document.createElement('button');
          markRead.type = 'button';
          markRead.className = 'btn btn-link btn-sm p-0';
          markRead.textContent = 'Mark as read';
          markRead.addEventListener('click', async () => {
            await apiFetch(`/api/v1/notifications/${encodeURIComponent(item._id)}/read`, { method: 'PUT' });
            await refresh();
          });
          row.append(markRead);
        }
        list.append(row);
      }
    } catch (error) {
      list.replaceChildren(empty);
      empty.textContent = error?.message || 'Notifications could not be loaded.';
      empty.classList.remove('d-none');
    }
  }

  markAllButton?.addEventListener('click', async () => {
    try {
      await apiFetch('/api/v1/notifications/read-all', { method: 'PUT' });
      await refresh();
    } catch (error) {
      empty.textContent = error?.message || 'Could not mark notifications as read.';
      empty.classList.remove('d-none');
    }
  });

  refresh();
  window.setInterval(refresh, 45000);

  const token = getToken();
  if (window.io && token && userId) {
    const socket = window.io(BACKEND_URL, { auth: { token } });
    socket.on('connect', () => socket.emit('join', { userId }));
    socket.on('notification:new', refresh);
  }
}
