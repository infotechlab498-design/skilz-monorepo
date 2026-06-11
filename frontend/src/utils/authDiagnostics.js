const diagEnabled =
  import.meta.env.VITE_AUTH_DIAGNOSTICS === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_AUTH_DIAGNOSTICS !== 'false');

/** Structured [AUTH] logs — on in dev unless VITE_AUTH_DIAGNOSTICS=false. */
const authLogEnabled = import.meta.env.DEV || import.meta.env.VITE_AUTH_DIAGNOSTICS === 'true';

/**
 * Primary structured auth logger (always visible in dev console).
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} message
 * @param {Record<string, unknown>} [data]
 */
export function authLog(level, message, data) {
  if (!authLogEnabled) return;
  const payload = data ? sanitize(data) : undefined;
  console[level](`[AUTH] ${message}`, payload ?? '');
  authDiag(level, message.replace(/\s+/g, '_').toLowerCase(), data);
}

/**
 * Minimal, PII-safe auth diagnostics logger (server + optional verbose mode).
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function authDiag(level, event, data) {
  if (!diagEnabled) return;
  const payload = data ? sanitize(data) : undefined;

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
