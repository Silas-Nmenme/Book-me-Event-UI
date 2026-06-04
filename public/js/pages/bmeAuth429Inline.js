// Inline-only variant for pages that can't import a helper (CSP / simplicity).
// Not used by default; kept for future refactors.

export function extract429Message(err, fallback = 'Too many attempts. Try again later.') {
  const status = err?.status || err?.response?.status || err?.statusCode || null;
  if (status !== 429) return err?.message || fallback;
  return err?.message || err?.data?.message || err?.data?.error || fallback;
}

