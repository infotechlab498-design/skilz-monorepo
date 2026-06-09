/**
 * Shared UI helpers (import from `../lib/utils.js` relative to `src/games/`, etc.)
 */

/** Merge class names (simple variant of clsx). */
export function cn(...inputs) {
  return inputs.flat().filter(Boolean).join(' ');
}

/** Level curve aligned with server score logic (sqrt scaling). */
export function getLevelFromXP(xp) {
  const n = Number(xp) || 0;
  return Math.floor(Math.sqrt(n / 100)) + 1;
}
