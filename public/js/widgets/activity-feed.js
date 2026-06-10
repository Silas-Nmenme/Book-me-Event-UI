import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function relTime(ts) {
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function dotStyle(type) {
  const t = String(type || '').toUpperCase();
  if (t.includes('ACCEPT')) return 'rgba(20,184,166,.95)';
  if (t.includes('PAY') || t.includes('CONFIRM')) return 'rgba(245,158,11,.95)';
  if (t.includes('CANCEL')) return 'rgba(239,68,68,.95)';
  if (t.includes('EVENT')) return 'rgba(236,72,153,.95)';
  return 'rgba(124,58,237,.95)';
}

export function initActivityFeedWidget() {
  const shell = document.getElementById('widgetActivityFeed');
  if (!shell) return;

  const container = document.getElementById('activityFeedContainer');
  const loadMoreBtn = document.getElementById('activityFeedLoadMore');
  const skeleton = shell.querySelector('.skeleton');

  let page = 1;

  const render = (events, append = false) => {
    if (!append) container.innerHTML = '';
    if (!events.length) {
      container.innerHTML = `<div class="text-muted-soft small">No activity.</div>`;
      return;
    }

    events.forEach((ev) => {
      const type = ev.type || ev.eventType || '';
      const text = ev.message || ev.description || ev.text || 'Activity';
      const ts = ev.timestamp || ev.createdAt;

      const row = document.createElement('div');
      row.className = 'd-flex gap-3 mb-3';
      row.innerHTML = `
        <div style="width:16px;position:relative;">
          <div style="width:12px;height:12px;border-radius:50%;background:${dotStyle(type)};margin-top:4px;"></div>
          <div style="width:2px;height:100%;background:rgba(124,58,237,.15);position:absolute;left:5px;top:12px;bottom:-10px;"></div>
        </div>
        <div style="flex:1;">
          <div class="small text-muted-soft">${relTime(ts)}</div>
          <div class="fw-bold" style="font-size:0.95rem;">${text}</div>
        </div>
      `;

      container.appendChild(row);
    });
  };

  const run = async () => {
    try {
      skeleton?.remove();
      const res = await apiFetch('/api/v1/activity-feed', { method: 'GET' });
      const data = res?.data || res;
      const events = Array.isArray(data) ? data : (data?.events || []);
      render(events);

      if (!events.length) {
        if (loadMoreBtn) loadMoreBtn.classList.add('d-none');
      }

      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', async () => {
          loadMoreBtn.disabled = true;
          try {
            // This API returns last 20 only; if future pagination exists, adapt.
            const res2 = await apiFetch(`/api/v1/activity-feed?page=${page + 1}`, { method: 'GET' });
            const d2 = res2?.data || res2;
            const ev2 = Array.isArray(d2) ? d2 : (d2?.events || []);
            page += 1;
            render(ev2, true);
          } catch (e) {
            toast({ title: 'Failed', message: e?.message || 'Try again.', variant: 'danger' });
          } finally {
            loadMoreBtn.disabled = false;
          }
        });
      }
    } catch (e) {
      toast({ title: 'Failed to load activity feed', message: e?.message || 'Try again.', variant: 'danger' });
      console.warn(e);
      container.innerHTML = `<div class="text-muted-soft small">Could not load activity.</div>`;
    }
  };

  run();
}

