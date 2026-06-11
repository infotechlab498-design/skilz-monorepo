const verboseEnabled =
  import.meta.env.VITE_AUTH_DIAGNOSTICS === 'true' ||
  import.meta.env.VITE_AUTH_DIAGNOSTICS === 'dev' ||
  import.meta.env.DEV;

/**
 * Structured auth pipeline logging — always on in dev, opt-in in production via VITE_AUTH_DIAGNOSTICS=true.
 * Never logs tokens, passwords, emails, phone numbers, or OTP codes.
 *
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function authLog(event, data) {
  const payload = data ? sanitize(data) : undefined;
  if (verboseEnabled) {
    console.info(`[AUTH] ${event}`, payload ?? '');
  }
}

/**
 * Minimal, PII-safe auth diagnostics logger (legacy authDiag consumers).
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function authDiag(level, event, data) {
  if (!verboseEnabled) return;
  const payload = data ? sanitize(data) : undefined;
  console[level](`[authDiag] ${event}`, payload || '');
  fetch('/api/debug/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'authDiag',
      level,
      event,
      data: payload,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

/**
 * @param {Record<string, unknown>} data
 */
function sanitize(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const key = String(k).toLowerCase();
    if (
      key.includes('token') ||
      key.includes('password') ||
      key.includes('otp') ||
      key.includes('code') ||
      key.includes('email') ||
      key.includes('phone')
    ) {
      if (k === 'masked' || k === 'maskedPhone') out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}
