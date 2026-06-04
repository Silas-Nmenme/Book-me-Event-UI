// Central helpers for handling rate-limited auth requests (HTTP 429)
// so all auth pages show consistent UX.

function getStatus(err) {
  return err?.status || err?.response?.status || err?.statusCode || null;
}

function getMessage(err) {
  return err?.message || err?.data?.message || err?.data?.error || '';
}

export function isRateLimited(err) {
  return getStatus(err) === 429;
}

export function extract429Message(err, fallback = 'Too many attempts. Try again later.') {
  const msg = getMessage(err);
  return msg || fallback;
}

