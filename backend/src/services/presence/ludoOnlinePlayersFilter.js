/**
 * Pure helpers for "available for Ludo invite" slider (unit-tested).
 */

/**
 * @param {unknown} lastSeen RTDB value (number millis or object with .seconds)
 * @returns {number | null}
 */
export function parseLastSeenMs(lastSeen) {
  if (lastSeen == null) return null;
  if (typeof lastSeen === 'number' && Number.isFinite(lastSeen)) return lastSeen;
  if (typeof lastSeen === 'object' && lastSeen !== null) {
    if (typeof lastSeen.toMillis === 'function') {
      try {
        const n = lastSeen.toMillis();
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    }
    const sec = lastSeen.seconds ?? lastSeen._seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) return sec * 1000;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} presence
 * @param {number} nowMs
 * @param {number} maxAgeMs
 */
export function isPresenceOnlineFresh(presence, nowMs, maxAgeMs) {
  const p = presence || {};
  if (!p.online) return false;
  const ls = parseLastSeenMs(p.lastSeen);
  if (ls == null) return true;
  return nowMs - ls <= maxAgeMs;
}

/**
 * @param {Record<string, unknown>} presence
 * @param {Record<string, unknown>} userState
 * @param {number} nowMs
 * @param {{ maxAgeMs: number, excludeQueued: boolean }} opts
 * @returns {boolean} true = show in available-players list
 */
export function isFriendAvailableForLudoInvite(presence, userState, nowMs, opts) {
  const maxAgeMs = opts?.maxAgeMs ?? 45000;
  const excludeQueued = opts?.excludeQueued !== false;
  const p = presence || {};
  const us = userState || {};

  if (!isPresenceOnlineFresh(p, nowMs, maxAgeMs)) return false;

  if (excludeQueued && us.inQueue) return false;

  if (us.ludoRoomId || us.inPlayingMatch) return false;

  if (String(p.status || '') === 'in-game') return false;

  return true;
}
