export function toast({ title = 'Notice', message = '', variant = 'success' } = {}) {
  // Minimal toast using Bootstrap
  const host = document.getElementById('toastHost');
  if (!host) return;

  const id = `t_${Math.random().toString(16).slice(2)}`;
  const bg = variant === 'danger' ? 'bg-danger' : variant === 'warning' ? 'bg-warning' : 'bg-success';

  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-dark border-0 show position-relative ${bg}`;
  el.style.marginBottom = '12px';
  el.id = id;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <div class="fw-bold">${escapeHtml(title)}</div>
        <div style="opacity:.95">${escapeHtml(message)}</div>
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  host.appendChild(el);

  // auto hide
  setTimeout(() => {
    try {
      el.classList.remove('show');
      el.remove();
    } catch {}
  }, 3000);
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => {
    const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
    return m[c] || c;
  });
}

export function setYear(elId = 'year') {
  const el = document.getElementById(elId);
  if (el) el.textContent = new Date().getFullYear();
}

