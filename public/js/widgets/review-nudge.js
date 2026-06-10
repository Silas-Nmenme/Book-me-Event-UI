import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function createStarBar(container, onSelect) {
  const bar = document.createElement('div');
  bar.className = 'd-flex gap-2 align-items-center';

  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-soft';
    btn.style.width = '44px';
    btn.textContent = '☆';
    btn.addEventListener('click', () => {
      bar.querySelectorAll('button').forEach((b, idx) => {
        b.textContent = idx < i ? '★' : '☆';
      });
      onSelect(i);
    });
    bar.appendChild(btn);
  }

  container.appendChild(bar);
}

function burstConfetti() {
  const canvas = document.getElementById('widgetConfettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.style.display = 'block';

  const w = canvas.width = window.innerWidth;
  const h = canvas.height = window.innerHeight;

  const particles = Array.from({ length: 60 }).map(() => ({
    x: Math.random() * w,
    y: h + Math.random() * 20,
    vx: (Math.random() - 0.5) * 6,
    vy: - (6 + Math.random() * 8),
    r: 4 + Math.random() * 4,
    life: 60 + Math.random() * 40,
    color: [
      getComputedStyle(document.documentElement).getPropertyValue('--clr-primary').trim() || '#7C3AED',
      getComputedStyle(document.documentElement).getPropertyValue('--clr-accent').trim() || '#F59E0B',
      getComputedStyle(document.documentElement).getPropertyValue('--clr-teal').trim() || '#14B8A6',
      getComputedStyle(document.documentElement).getPropertyValue('--clr-highlight').trim() || '#EC4899',
    ][Math.floor(Math.random() * 4)],
  }));

  let t = 0;
  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy * 0.9;
      p.life--;

      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      p.vx *= 0.99;
      p.vy += 0.05;
    });

    t++;
    if (particles.some(p => p.life > 0)) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        ctx.clearRect(0, 0, w, h);
        canvas.style.display = 'none';
      }, 400);
    }
  };

  requestAnimationFrame(tick);
}

export function initReviewNudgeWidget() {
  const shell = document.getElementById('widgetReviewNudge');
  if (!shell) return;
  const container = document.getElementById('reviewNudgeContainer');

  const run = async () => {
    try {
      const res = await apiFetch('/api/v1/bookings?status=completed&reviewed=false', { method: 'GET' });
      const data = res?.data || res;
      const bookings = Array.isArray(data) ? data : (data?.items || data?.bookings || []);

      if (!bookings.length) {
        shell.classList.add('d-none');
        return;
      }

      const b = bookings[0];
      const vendorName = b.vendor?.name || b.vendorName || 'Vendor';
      container.innerHTML = `
        <div class="card-glass widget-card p-3">
          <div class="fw-bold">${vendorName}</div>
          <div class="text-muted-soft small mt-1">How was your experience?</div>
          <div class="mt-3" id="reviewStars"></div>
          <div class="mt-3 d-none" id="reviewFormWrap">
            <label class="form-label small text-muted-soft">Your comment</label>
            <textarea class="form-control" rows="3" id="reviewComment" placeholder="Tell us what went well…"></textarea>
            <button class="btn btn-brand w-100 mt-3" type="button" id="btnSubmitReview">Submit review</button>
          </div>
        </div>
      `;

      let rating = 0;
      const starsEl = document.getElementById('reviewStars');
      const onSelect = (r) => {
        rating = r;
        document.getElementById('reviewFormWrap').classList.remove('d-none');
      };
      createStarBar(starsEl, onSelect);

      document.getElementById('btnSubmitReview').addEventListener('click', async () => {
        const comment = document.getElementById('reviewComment').value || '';
        if (!rating) {
          toast({ title: 'Pick a rating', message: 'Select stars before submitting.', variant: 'warning' });
          return;
        }

        try {
          const payload = { bookingId: b._id || b.id || b.bookingId, rating, comment };
          await apiFetch('/api/v1/reviews', { method: 'POST', body: JSON.stringify(payload) });
          burstConfetti();
          shell.remove();
          toast({ title: 'Thanks!', message: 'Review submitted.', variant: 'success' });
        } catch (e) {
          toast({ title: 'Failed', message: e?.message || 'Try again.', variant: 'danger' });
        }
      });
    } catch (e) {
      // If endpoint missing, hide silently to not break dashboard.
      console.warn('Review nudge failed', e?.message || e);
    }
  };

  run();
}

