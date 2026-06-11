/* Landing redesign behaviors: confetti, typewriter, stats counter, marquee, toasts, filters */

import { BACKEND_URL } from '../constant.js';


async function fetchPlatformStats() {
  // Use the shared API helper so it targets the deployed backend URL.
  // landing-redesign.js is imported by index.html, so relative fetch may hit the wrong origin.
  const res = await fetch(`${BACKEND_URL}/api/v1/stats/platform`, { method: 'GET' });
  const json = await res.json();
  return json?.data;
}


function setMarqueeFromVendors(vendors = []) {
  const marquee = document.getElementById('landingVendorMarquee');
  if (!marquee) return;

  // Clear placeholders
  marquee.innerHTML = '';

  const names = vendors
    .map((v) => v?.name || v?.vendorName || v?.businessName)
    .filter(Boolean);

  // Create enough items to satisfy the seamless scroll width.
  const unique = Array.from(new Set(names));
  const pool = unique.length ? unique : ['Verified vendors'];

  const doubled = [...pool, ...pool];

  for (const name of doubled) {
    const span = document.createElement('span');
    span.className = 'bme-vendor-logo';
    span.textContent = name;
    marquee.appendChild(span);
  }

  marquee.dataset.marqueeState = 'ready';
}


function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

function showMiniToast({ name, action }) {
  const host = document.getElementById('landingToastStack');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'landing-mini-toast widget-card';
  el.innerHTML = `
    <div class="d-flex align-items-center gap-2">
      <span class="landing-mini-toast__check" aria-hidden="true">✓</span>
      <div class="small">
        <span class="fw-bold">${escapeHtml(name)}</span> ${escapeHtml(action)}
      </div>
    </div>
  `;

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, 8000);
}

function animateCounter(el, target, duration = 1200) {
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start += step;
    if (start >= target) {
      el.textContent = formatNumber(target);
      clearInterval(timer);
      return;
    }
    el.textContent = formatNumber(Math.floor(start));
  }, 16);
}

function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  return n.toLocaleString();
}

function initTypewriter() {
  const el = document.getElementById('landingTypewriterText');
  if (!el) return;

  const words = ['weddings', 'concerts', 'birthdays', 'corporate events'];
  let idx = 0;

  // Cursor
  el.classList.add('landing-typewriter');

  function renderWord() {
    const word = words[idx % words.length];
    el.innerHTML = `
      <span class="landing-typewriter__word">${escapeHtml(word)}</span>
      <span class="landing-typewriter__cursor" aria-hidden="true">|</span>
    `;
  }

  renderWord();

  setInterval(() => {
    idx += 1;
    renderWord();
  }, 2500);
}

function initConfetti() {
  const canvas = document.getElementById('landingConfetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (prefersReduced) return;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  window.addEventListener('resize', resize);
  resize();

  const colors = [
    '#7C3AED', '#EC4899', '#F59E0B', '#14B8A6', '#60A5FA', '#A78BFA', '#F472B6'
  ];

  const particles = [];
  const makeParticle = () => {
    const x = Math.random() * canvas.clientWidth;
    const y = canvas.clientHeight + Math.random() * 60;
    const r = 3 + Math.random() * 4;
    const vy = 0.6 + Math.random() * 1.6;
    const vx = -0.6 + Math.random() * 1.2;
    return {
      x,
      y,
      vx,
      vy,
      r,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vr: -0.08 + Math.random() * 0.16,
    };
  };

  for (let i = 0; i < 60; i++) particles.push(makeParticle());

  let raf = 0;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    for (const p of particles) {
      p.x += p.vx;
      p.y -= p.vy;
      p.rot += p.vr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r);
      ctx.restore();

      if (p.y < -80) {
        Object.assign(p, makeParticle(), { y: canvas.clientHeight + 50 });
      }
    }

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  // Expose trigger for booking confirmed / review submitted
  window.__bmeConfettiBurst = () => {
    for (let i = 0; i < particles.length; i++) {
      particles[i] = makeParticle();
      particles[i].y = canvas.clientHeight + 30;
    }
  };
}

function initMarquee() {
  const marquee = document.getElementById('landingVendorMarquee');
  if (!marquee) return;

  // Populate marquee with real vendors if backend allows.
  // Widgets endpoints for activity/messages are protected; keep this best-effort.
  (async () => {
    try {
      // Reuse existing vendor map endpoint if it returns vendor list.
      // Auth may be required; failures are swallowed.
      const res = await fetch('/api/v1/widgets/vendors?limit=12');
      const json = await res.json();
      const vendors = json?.data || json;
      if (Array.isArray(vendors) && vendors.length) {
        setMarqueeFromVendors(vendors);
      }
    } catch {
      // ignore
    } finally {
      marquee.classList.add('show');
    }
  })();
}



function initPlatformStats() {
  // Ensure landing counters always display DB-driven values when backend is reachable.
  const domEls = ['statEvents', 'statVendors', 'statCities', 'statSatisfaction']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!domEls.length) return;

  domEls.forEach((el) => (el.textContent = '0'));

  // No static fallback: display real DB-driven stats.
  fetchPlatformStats()
    .then((data) => {
      animateCounter(document.getElementById('statEvents'), Number(data?.totalEvents ?? 0));
      animateCounter(document.getElementById('statVendors'), Number(data?.totalVendors ?? 0));

      const cities = data?.cities;
      const citiesCount = Array.isArray(cities) ? cities.length : Number(cities ?? 0);
      animateCounter(document.getElementById('statCities'), citiesCount);

      // Controller returns satisfaction as number.
      animateCounter(document.getElementById('statSatisfaction'), Number(data?.satisfaction ?? 0));
    })
    .catch(() => {
      animateCounter(document.getElementById('statEvents'), 0);
      animateCounter(document.getElementById('statVendors'), 0);
      animateCounter(document.getElementById('statCities'), 0);
      animateCounter(document.getElementById('statSatisfaction'), 0);
    });
}


function initPublicActivityToasts() {
  const rotating = [
    { name: 'John B.', action: 'just booked a DJ in Lagos ✓' },
    { name: 'Amaka T.', action: 'requested catering in Abuja ✓' },
    { name: 'Ibrahim S.', action: 'booked a photographer in Port Harcourt ✓' },
    { name: 'Chiamaka O.', action: 'just confirmed a venue in Ibadan ✓' },
  ];

  // Fetch best-effort.
  const tryFetch = async () => {
    try {
      const r = await fetch('/api/v1/activity-feed?public=true');
      const j = await r.json();
      const data = j?.data || j;
      return Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  };

  (async () => {
    const fetched = await tryFetch();
    const pool = fetched?.length ? fetched : rotating;
    let i = 0;

    // Immediate first
    const pick = pool[i % pool.length];
    if (pick?.name || pick?.vendorName) {
      showMiniToast({
        name: pick.name || pick.vendorName,
        action: pick.action || pick.text || pick.message || pick.activityText || 'just booked ✓',
      });
    } else {
      showMiniToast(rotating[0]);
    }

    setInterval(() => {
      const item = pool[i % pool.length];
      i += 1;

      if (item?.name || item?.vendorName) {
        showMiniToast({
          name: item.name || item.vendorName,
          action: item.action || item.text || item.message || item.activityText || 'just booked ✓',
        });
      } else {
        showMiniToast(rotating[i % rotating.length]);
      }
    }, 8000);
  })();
}

export function initLandingRedesign() {
  initConfetti();
  initTypewriter();
  initPlatformStats();
  initMarquee();
  initPublicActivityToasts();

  // Search form: submit redirects to services/browse page.
  const form = document.getElementById('landingSearchForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const city = form.querySelector('[name="city"]')?.value || '';
      const type = form.querySelector('[name="type"]')?.value || '';
      const date = form.querySelector('[name="date"]')?.value || '';
      const params = new URLSearchParams();
      if (city) params.set('city', city);
      if (type) params.set('category', type);
      if (date) params.set('date', date);
      window.location.href = `services.html?${params.toString()}`;
    });
  }
}


