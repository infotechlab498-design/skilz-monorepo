/**
 * Firestore `lobbies/{lobbyId}` ids that match `game_*` / `public_*` are treated as shared chats
 * in security rules (see backend/firebase/firestore.rules — isPublicLobby).
 */

function safeSegment(s) {
  const t = String(s ?? "").trim();
  const slug = t.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  return slug.length ? slug : "x";
}

/**
 * @param {string} gameSlug e.g. "trivia", "math-rush", "ludo"
 * @param {string} [scopeSlug] optional segment e.g. trivia category "history"
 * @returns {string} e.g. game_trivia_history, game_math-rush
 */
export function gameLobbyId(gameSlug, scopeSlug) {
  const g = safeSegment(gameSlug);
  if (scopeSlug == null || String(scopeSlug).length === 0) {
    return `game_${g}`;
  }
  return `game_${g}_${safeSegment(scopeSlug)}`;
}

/**
 * Non-game public streams (announcements, global notices).
 * @param {string} scopeSlug
 * @returns {string} e.g. public_announcements
 */
export function publicLobbyId(scopeSlug) {
  return `public_${safeSegment(scopeSlug)}`;
}
