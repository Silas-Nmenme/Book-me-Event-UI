document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Require login
  if (!requireAuth('auth-login.html')) return;

  const form = document.getElementById('kycForm');
  const fileInput = document.getElementById('image');
  const previewHost = document.getElementById('imagePreview');
  const responseEl = document.getElementById('uploadResponse');
  const hint = document.getElementById('uploadHint');
  const btn = document.getElementById('btnUpload');

  const setHint = (msg = '') => {
    if (!hint) return;
    hint.textContent = msg;
  };

  fileInput?.addEventListener('change', () => {
    if (!fileInput.files || !fileInput.files[0]) return;

    const file = fileInput.files[0];
    setHint(`${file.name} • ${Math.round(file.size / 1024)} KB`);

    const url = URL.createObjectURL(file);
    if (previewHost) {
      previewHost.innerHTML = `<img src="${url}" alt="KYC preview" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form) return;

    try {
      setHint('Uploading...');
      setLoading(btn, true, 'Uploading...');
      if (responseEl) responseEl.textContent = '—';

      const fd = new FormData(form);
      // Ensure correct field name: backend expects `image`
      if (!fd.get('image')) {
        throw new Error('Select an image file first.');
      }

      // Backend: POST /api/v1/uploads/vendor-kyc
      const res = await fetch(`${apiBaseOrFallback()}/api/v1/uploads/vendor-kyc`, {
        method: 'POST',
        headers: {
          // apiFetch would set Authorization, but for FormData we use fetch directly.
          Authorization: `Bearer ${localStorage.getItem('bme_token') || ''}`,
          Accept: 'application/json',
        },
        body: fd,
      }).then(async (r) => {
        const text = await r.text();
        let data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { message: text };
        }
        if (!r.ok) {
          throw new Error(data?.message || data?.error || `Upload failed (${r.status})`);
        }
        return data;
      });

      if (responseEl) {
        responseEl.textContent = JSON.stringify(res?.data || res, null, 2);
      }

      toast({ title: 'Uploaded', message: 'KYC upload successful.', variant: 'success' });
      setHint('Done. You can upload another file anytime.');
    } catch (err) {
      toast({ title: 'Upload failed', message: err.message || 'Try again.', variant: 'danger' });
      setHint('Upload failed. Please try again.');
    } finally {
      setLoading(btn, false);
    }
  });

  function apiBaseOrFallback() {
    // Frontend/js/api.js defines const API_BASE.
    // In case script load order changes, we fallback to deployed base.
    try {
      // eslint-disable-next-line no-undef
      return typeof API_BASE !== 'undefined' ? API_BASE : 'https://book-me-events.vercel.app';
    } catch {
      return 'https://book-me-events.vercel.app';
    }
  }
});

