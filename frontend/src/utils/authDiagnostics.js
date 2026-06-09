const enabled =
  import.meta.env.VITE_AUTH_DIAGNOSTICS === "true" ||
  (import.meta.env.DEV && import.meta.env.VITE_AUTH_DIAGNOSTICS === "dev");

/**
 * Minimal, PII-safe auth diagnostics logger.
 * - Disabled by default.
 * - Never log tokens, passwords, full phone numbers, emails, or OTP codes.
 *
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function authDiag(level, event, data) {
  if (!enabled) return;
  const payload = data ? sanitize(data) : undefined;

  console[level](`[authDiag] ${event}`, payload || "");

  fetch('/api/debug/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'authDiag', level, event, data: payload, timestamp: Date.now() }),
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
      key.includes("token") ||
      key.includes("password") ||
      key.includes("otp") ||
      key.includes("code") ||
      key.includes("email") ||
      key.includes("phone")
    ) {
      // allow only masked fields explicitly named "masked" or "maskedPhone"
      if (k === "masked" || k === "maskedPhone") out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

