import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function defaultCenter() {
  return { lat: 6.5244, lng: 3.3792 }; // Lagos fallback
}

export function initVendorMapWidget() {
  const shell = document.getElementById('widgetVendorMap');
  if (!shell) return;

  const mapWrap = document.getElementById('vendorMap');
  if (!mapWrap) return;

  const run = async () => {
    try {
      const L = await loadLeaflet();
      const css = getComputedStyle(document.documentElement);
      const primary = css.getPropertyValue('--clr-primary').trim() || '#7C3AED';

      const resMe = await apiFetch('/api/v1/auth/me', { method: 'GET' }).catch(() => null);
      const me = resMe?.data || resMe || {};
      const userCity = me?.city || me?.profile?.city || 'Lagos';

      const center = defaultCenter();

      const map = L.map('vendorMap', { zoomControl: true }).setView([center.lat, center.lng], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      const res = await apiFetch(`/api/v1/vendors?city=${encodeURIComponent(userCity)}&limit=20`, { method: 'GET' });
      const data = res?.data || res;
      const vendors = Array.isArray(data) ? data : (data?.items || []);

      if (!vendors.length) {
        mapWrap.innerHTML = `<div class="text-muted-soft p-3">No vendors found near ${userCity}.</div>`;
        return;
      }

      // purple pin icon (simple div icon)
      vendors.forEach((v) => {
        if (v.lat == null || v.lng == null) return;

        const category = v.category || v.categories?.[0] || 'Vendor';
        const rating = v.rating ?? v.avgRating ?? '';
        const name = v.name || v.vendorName || 'Vendor';
        const vendorId = v._id || v.id || v.vendorId;

        const pin = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${primary};box-shadow:0 0 0 6px rgba(124,58,237,.22);border:2px solid rgba(255,255,255,.7);"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });

        const popup = `
          <div style="min-width:200px;">
            <div style="font-weight:900;">${name}</div>
            <div class="text-muted-soft" style="opacity:.9;">${category}</div>
            <div class="small">Rating: ${rating || '—'}</div>
            <button type="button" class="btn btn-brand btn-sm mt-2" data-request-vendor="1" data-vendor-id="${vendorId}">Request</button>
          </div>
        `;

        const marker = L.marker([Number(v.lat), Number(v.lng)], { icon: pin }).addTo(map);
        marker.bindPopup(popup);
      });

      map.on('popupopen', (e) => {
        const el = e.popup.getElement();
        if (!el) return;
        el.querySelectorAll('[data-request-vendor]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const vendorId = btn.getAttribute('data-vendor-id');
            if (!vendorId) return;
            toast({ title: 'Request', message: 'Hook this to your request flow.', variant: 'warning' });
            // Future: open request-create with vendor prefilled.
          });
        });
      });
    } catch (e) {
      toast({ title: 'Map failed', message: e?.message || 'Try again.', variant: 'danger' });
      console.warn(e);
    }
  };

  run();
}

