import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function initChatPreviewWidget() {
  const shell = document.getElementById('widgetChatPreview');
  if (!shell) return;

  const container = document.getElementById('chatPreviewContainer');
  const skeleton = shell.querySelector('.skeleton');

  const run = async () => {
    try {
      skeleton?.remove();
      container.innerHTML = '';

      const res = await apiFetch('/api/v1/messages/preview', { method: 'GET' });
      const data = res?.data || res;
      const threads = Array.isArray(data) ? data : (data?.threads || []);

      if (!threads.length) {
        container.innerHTML = `<div class="text-muted-soft small">No messages yet.</div>`;
        return;
      }

      threads.slice(0, 3).forEach((t) => {
        const vendor = t.vendor || {};
        const vendorName = vendor.name || t.vendorName || 'Vendor';
        const avatarName = vendorName.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');
        const last = t.lastMessage || {};
        const lastText = last.content || last.messageContent || t.lastMessageSnippet || '';
        const unread = t.unreadCount || t.unread || 0;

        const row = document.createElement('div');
        row.className = 'card-glass widget-card p-3 mb-2';
        row.innerHTML = `
          <div class="d-flex align-items-center justify-content-between gap-2">
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle border" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">${avatarName}</div>
              <div>
                <div class="fw-bold">${vendorName}</div>
                <div class="small text-muted-soft">${(lastText || '').slice(0, 60)}${(lastText || '').length > 60 ? '…' : ''}</div>
              </div>
            </div>
            <div class="text-end">
              <div class="small text-muted-soft">${fmtTime(last.createdAt || t.updatedAt || Date.now())}</div>
              ${unread ? `<span class="badge rounded-pill bg-danger">${unread}</span>` : ''}
            </div>
          </div>

          <div class="mt-3">
            <div class="input-group">
              <input type="text" class="form-control" placeholder="Quick reply…" />
              <button class="btn btn-brand" type="button">Send</button>
            </div>
          </div>
        `;

        const input = row.querySelector('input');
        const btn = row.querySelector('button');

        btn.addEventListener('click', async () => {
          const msg = (input.value || '').trim();
          if (!msg) return;
          btn.disabled = true;
          try {
            await apiFetch('/api/v1/messages', {
              method: 'POST',
              body: JSON.stringify({
                recipient: t.otherUserId || vendor._id || t.vendorId,
                messageContent: msg,
                conversationId: t.conversationId,
              }),
            });
            input.value = '';
            toast({ title: 'Sent', message: 'Reply sent.', variant: 'success' });
          } catch (e) {
            toast({ title: 'Send failed', message: e?.message || 'Try again.', variant: 'danger' });
          } finally {
            btn.disabled = false;
          }
        });

        container.appendChild(row);
      });
    } catch (e) {
      toast({ title: 'Failed to load chat preview', message: e?.message || 'Try again.', variant: 'danger' });
      console.warn(e);
      container.innerHTML = `<div class="text-muted-soft small">Could not load chat preview.</div>`;
    }
  };

  run();
}

