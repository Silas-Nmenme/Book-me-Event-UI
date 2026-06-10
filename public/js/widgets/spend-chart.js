import { apiFetch } from '../api.js';
import { toast } from '../ui.js';

function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve(window.Chart);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function initSpendChartWidget() {
  const shell = document.getElementById('widgetSpendChart');
  if (!shell) return;

  const canvas = document.getElementById('spendChartCanvas');
  const totalEl = document.getElementById('spendChartTotal');
  const skeleton = shell.querySelector('.skeleton');

  const run = async () => {
    try {
      skeleton?.remove();
      await loadChartJs();

      const res = await apiFetch('/api/v1/payments/summary', { method: 'GET' });
      const data = res?.data || res;
      const points = Array.isArray(data) ? data : (data?.items || []);

      if (!points.length) {
        totalEl.textContent = '₦0';
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const total = points.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      totalEl.textContent = `₦${new Intl.NumberFormat().format(total)}`;

      const labels = points.map((p) => p.month);
      const amounts = points.map((p) => Number(p.amount) || 0);

      const css = getComputedStyle(document.documentElement);
      const primary = css.getPropertyValue('--clr-primary').trim() || '#7C3AED';
      const accent = css.getPropertyValue('--clr-accent').trim() || '#F59E0B';

      const ctx = canvas.getContext('2d');
      new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Spend',
            data: amounts,
            backgroundColor: primary,
            hoverBackgroundColor: accent,
            borderRadius: 10,
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ₦${new Intl.NumberFormat().format(ctx.parsed.y)}`,
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.08)' },
              ticks: { color: 'rgba(255,255,255,0.8)' }
            },
            x: {
              grid: { display: false },
              ticks: { color: 'rgba(255,255,255,0.8)' }
            }
          }
        }
      });
    } catch (e) {
      toast({ title: 'Failed to load spend chart', message: e?.message || 'Try again.', variant: 'danger' });
      console.warn(e);
    }
  };

  run();
}

