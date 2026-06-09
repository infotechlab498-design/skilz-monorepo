/**
 * Lobby chip labels for EnigmaPulse — keep in sync with {@link frontend/src/games/EnigmaPulse/EnigmaPulseLobby.jsx}.
 */

export const ENIGMA_PULSE_LOBBY_CATEGORIES = [
  'General Knowledge',
  'Science',
  // 'History',
  'Sports',
];

/** Word Cipher only — not shown as a lobby chip; forced when gameKey is word_cipher. */
export const WORD_CIPHER_CATEGORY = 'brain_twisters';

/** Admin dashboard + CSV upload — lobby chips plus reserved game categories. */
export const ENIGMA_PULSE_ADMIN_CATEGORIES = [
  ...ENIGMA_PULSE_LOBBY_CATEGORIES,
  'Syllogism',
  WORD_CIPHER_CATEGORY,
];

/**
 * @param {unknown} input
 * @returns {string} Normalized category string or '' if invalid
 */
export function normalizeEnigmaPulseCategory(input) {
  const t = String(input ?? '').trim();
  if (ENIGMA_PULSE_LOBBY_CATEGORIES.includes(t)) return t;
  const lower = t.toLowerCase();
  const found = ENIGMA_PULSE_LOBBY_CATEGORIES.find((c) => c.toLowerCase() === lower);
  return found || '';
}

/**
 * Word Cipher Firestore category (brain_twisters).
 * @param {unknown} input
 * @returns {string} WORD_CIPHER_CATEGORY or ''
 */
export function normalizeWordCipherCategory(input) {
  const t = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (t === 'brain_twisters' || t === 'brain-twisters') return WORD_CIPHER_CATEGORY;
  if (String(input ?? '').trim() === WORD_CIPHER_CATEGORY) return WORD_CIPHER_CATEGORY;
  return '';
}

/**
 * Admin filter / CSV validation — lobby, Syllogism, and Word Cipher categories.
 * @param {unknown} input
 * @returns {string}
 */
export function normalizeEnigmaPulseAdminCategory(input) {
  const wc = normalizeWordCipherCategory(input);
  if (wc) return wc;
  const lobby = normalizeEnigmaPulseCategory(input);
  if (lobby) return lobby;
  const raw = String(input ?? '').trim();
  if (raw.toLowerCase() === 'syllogism') return 'Syllogism';
  return '';
}
