import { apiFetch, initializeFlutterwavePayment, refundPayment } from '../api.js';
import { toast } from '../ui.js';

function escapeHtml(s) {
  return (s ?? '')
    .toString()
    .replace(/[&<>"']/g, (c) => {
      const m = { '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
      return m[c] || c;
    });
}

function statusPill(status) {
  const s = (status || '').toString().toUpperCase();
  if (s === 'COMPLETED') return { cls: 'bme-pill--confirmed', label: 'COMPLETED' };
  if (s === 'PENDING') return { cls: 'bme-pill--pending', label: 'PENDING' };
  if (s === 'FAILED') return { cls: 'bme-pill--cancelled', label: 'FAILED' };
  if (s === 'REFUNDED') return { cls: 'bme-pill--refunded', label: 'REFUNDED' };
  if (s === 'REFUND') return { cls: 'bme-pill--refunded', label: 'REFUND' };
  return { cls: 'bme-pill', label: s || '—' };
}

function fmtAmount(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const cur = (currency || 'NGN').toString().toUpperCase();
  const symbol = cur === 'NGN' ? '₦' : '';
  return `${symbol}${new Intl.NumberFormat().format(n)}`;
}

async function loadPayments({ status, page, limit }) {
  const res = await apiFetch(`/api/v1/payments?${new URLSearchParams({
    ...(status ? { status } : {}),
    page,
    limit,
  }).toString()}`, { method: 'GET' });
  return res?.data || res;
}

export function initPaymentsPage() {
  const shellMeta = document.getElementById('paymentsMeta');
  const statusFilterEl = document.getElementById('statusFilter');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');

  const loadingEl = document.getElementById('paymentsLoading');
  const errorEl = document.getElementById('paymentsError');
  const authzErrorEl = document.getElementById('authzError');

  const emptyEl = document.getElementById('paymentsEmpty');
  const tableWrap = document.getElementById('paymentsTableWrap');
  const tbody = document.getElementById('paymentsTbody');

  if (!shellMeta || !statusFilterEl || !tbody) {
    // Page not loaded fully or wrong layout.
    return;
  }

  let page = 1;
  const limit = 10;

  function setLoading(on) {
    loadingEl?.classList.toggle('d-none', !on);
    if (on) {
      errorEl?.classList.add('d-none');
      authzErrorEl?.classList.add('d-none');
    }
  }

  function setError(el) {
    el?.classList.remove('d-none');
  }

  function hideErrors() {
    errorEl?.classList.add('d-none');
    authzErrorEl?.classList.add('d-none');
  }

  function renderRow(p) {
    const id = p?._id || p?.id || '—';
    const booking = p?.booking || {};
    const bookingId = booking?._id || booking?.id || '—';
    const serviceName = booking?.service?.name || booking?.service?.serviceName || booking?.serviceName || booking?.title || '';

    const vendorName = booking?.vendor?.businessName || booking?.vendor?.name || booking?.vendorName || '';

    const method = (p?.paymentMethod || p?.payment_method || p?.gateway || '').toString().toUpperCase() || '—';

    const pill = statusPill(p?.paymentStatus || p?.status);

    const amount = fmtAmount(p?.amount, p?.currency || booking?.amountCurrency);

    const canPayAgain = (p?.paymentStatus || '').toString().toUpperCase() === 'PENDING';
    const canRefund = ['COMPLETED', 'FAILED'].includes((p?.paymentStatus || '').toString().toUpperCase());

    const bookingCard = `${escapeHtml(bookingId)}${serviceName ? ` • ${escapeHtml(serviceName)}` : ''}${vendorName ? ` • ${escapeHtml(vendorName)}` : ''}`;

    return `
      <tr>
        <td>
          <div class="fw-bold">${escapeHtml(id)}</div>
          <div class="small text-muted-soft">Ref: ${escapeHtml(p?.transactionReference || '—')}</div>
        </td>
        <td>
          <div class="small text-muted-soft">${bookingCard || '—'}</div>
        </td>
        <td>${escapeHtml(method)}</td>
        <td>
          <span class="bme-pill ${pill.cls}">${escapeHtml(pill.label)}</span>
        </td>
        <td>${escapeHtml(amount)}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            ${canPayAgain ? `<button class="btn btn-soft btn-sm" type="button" data-action="payAgain" data-payment-id="${escapeHtml(id)}" data-booking-id="${escapeHtml(bookingId)}">Pay again</button>` : ''}
            ${canRefund ? `<button class="btn btn-soft btn-sm" type="button" data-action="refund" data-payment-id="${escapeHtml(id)}">Refund</button>` : ''}
            <a class="btn btn-soft btn-sm" href="bookings.html?bookingId=${encodeURIComponent(bookingId)}">View</a>
          </div>
        </td>
      </tr>
    `;
  }

  async function refresh() {
    hideErrors();
    setLoading(true);

    emptyEl?.classList.add('d-none');
    tableWrap?.classList.add('d-none');

    try {
      const status = statusFilterEl.value || undefined;
      const data = await loadPayments({
        status,
        page,
        limit,
      });

      // Controller returns {success,count,total,pages,currentPage,data:[...]}
      const items = data?.data || data?.results || data?.items || [];

      const total = data?.total ?? items.length;
      const pages = data?.pages ?? undefined;
      const cur = data?.currentPage ?? page;
      shellMeta.textContent = `Page ${cur}${pages ? ` of ${pages}` : ''} • Total: ${total}`;

      if (!Array.isArray(items) || items.length === 0) {
        emptyEl?.classList.remove('d-none');
        return;
      }

      tbody.innerHTML = items.map(renderRow).join('');
      tableWrap?.classList.remove('d-none');

      // wire actions
      tbody.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-action');

          if (action === 'payAgain') {
            const bookingId = btn.getAttribute('data-booking-id');
            if (!bookingId) return;
            try {
              toast({ title: 'Checkout', message: 'Redirecting to payment…', variant: 'info' });
              const session = await initializeFlutterwavePayment(bookingId);
              if (session?.link) window.location.href = session.link;
              else throw new Error('Unable to initialize payment');
            } catch (e) {
              toast({ title: 'Payment failed', message: e?.message || 'Try again.', variant: 'danger' });
            }
          }

          if (action === 'refund') {
            const paymentId = btn.getAttribute('data-payment-id');
            if (!paymentId) return;
            const reason = window.prompt('Refund reason (optional):', 'Request refund');
            if (reason === null) return;
            try {
              await refundPayment(paymentId, { refundReason: (reason || '').trim() || 'Refund requested' });
              toast({ title: 'Refund requested', message: 'Check updated status.', variant: 'success' });
              await refresh();
            } catch (e) {
              toast({ title: 'Refund failed', message: e?.message || 'Try again.', variant: 'danger' });
            }
          }
        });
      });

      // pagination: enable/disable via best effort
      btnPrev.disabled = page <= 1;
      btnNext.disabled = false;

      setLoading(false);
    } catch (e) {
      setLoading(false);
      const msg = e?.message || 'Failed to load payments.';
      if (e?.status === 401 || e?.status === 403) {
        if (authzErrorEl) {
          authzErrorEl.textContent = msg;
          setError(authzErrorEl);
        }
      } else {
        if (errorEl) {
          errorEl.textContent = msg;
          setError(errorEl);
        }
      }
    }
  }

  statusFilterEl.addEventListener('change', async () => {
    page = 1;
    await refresh();
  });

  btnRefresh?.addEventListener('click', async () => {
    await refresh();
  });

  btnPrev?.addEventListener('click', async () => {
    page = Math.max(1, page - 1);
    await refresh();
  });

  btnNext?.addEventListener('click', async () => {
    page += 1;
    await refresh();
  });

  refresh();
}

