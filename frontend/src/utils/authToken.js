import { auth } from '../firebase/config.js';

/**
 * Legacy/dev-only JWT token storage.
 * Production Firebase-native flow should use Firebase ID tokens via `authHeadersAsync`.
 *
 * We keep this in-memory (NOT localStorage) to satisfy "no localStorage auth persistence".
 */
let legacyToken = null;

export function setAuthToken(token) {
  legacyToken = token ? String(token) : null;
}

export function getAuthToken() {
  return legacyToken;
}

/**
 * Prefer Firebase ID token (API verifies via Identity Toolkit); fall back to Skilz JWT (dev OTP / legacy).
 * Note: backend `authenticateToken` only accepts Firebase ID tokens — legacy JWT alone yields 403 "Invalid or expired token" on /api/admin/*.
 */
export async function authHeadersAsync(base = {}) {
  const headers = { 'Content-Type': 'application/json', ...base };
  try {
    // Avoid racing Redux "logged in" before `auth.currentUser` exists (prevents missing Bearer on first admin fetch).
    if (auth.authStateReady) {
      await auth.authStateReady;
    }
  } catch {
    /* ignore */
  }
  try {
    const cu = auth.currentUser;
    if (cu) {
      const idToken = await cu.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
        return headers;
      }
    }
  } catch {
    /* fall through to JWT */
  }
  const t = getAuthToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

/** @deprecated Prefer `authHeadersAsync` for authenticated API calls after Firebase sign-in. */
export function authHeaders(base = {}) {
  const headers = { 'Content-Type': 'application/json', ...base };
  const t = getAuthToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}