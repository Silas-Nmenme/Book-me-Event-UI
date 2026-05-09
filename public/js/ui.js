function toast({ title = 'Notification', message = '', variant = 'info', timeout = 3200 } = {}) {
  const host = document.getElementById('toastHost');
  if (!host) return;

  const bg =
    variant === 'success' ? 'border-success' :
    variant === 'danger' ? 'border-danger' :
    variant === 'warning' ? 'border-warning' :
    'border-info';

  const el = document.createElement('div');
  el.className = `toast toast-glass show ${bg} mb-2`;
  el.style.minWidth = '280px';

  const icon =
    variant === 'success' ? '✅' :
    variant === 'danger' ? '⛔' :
    variant === 'warning' ? '⚠️' :
    'ℹ️';

  el.innerHTML = `
    <div class="toast-header" style="background: transparent; border-bottom: 1px solid rgba(255,255,255,0.10);">
      <strong class="me-auto">${icon} ${title}</strong>
      <small class="text-muted-soft">just now</small>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body" style="color: rgba(255,255,255,0.9)">${message}</div>
  `;

  host.appendChild(el);

  const bsToast = new bootstrap.Toast(el, { delay: timeout });
  bsToast.show();

  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function setLoading(btn, loading, text = 'Loading...') {
  if (!btn) return;
  btn.disabled = !!loading;
  const old = btn.dataset.originalText || btn.innerText;
  if (!btn.dataset.originalText) btn.dataset.originalText = old;

  btn.innerHTML = loading
    ? `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${text}`
    : btn.dataset.originalText;
}

function setSkeleton(el, count = 6) {
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.className = 'skeleton p-3 mb-3';
    d.style.height = '120px';
    el.appendChild(d);
  }
}

async function readForm(formEl) {
  const fd = new FormData(formEl);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

function getAvatarInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'BME';
  const a = parts[0][0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}


