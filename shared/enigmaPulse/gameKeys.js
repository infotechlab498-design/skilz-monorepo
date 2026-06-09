/**
 * EnigmaPulse lobby `gameKey` ↔ question-bank selection.
 * Lobby uses stable keys (e.g. pattern_recognition); Firestore `questions.type` may use legacy names.
 */

const PATTERN_KEYS = new Set(['pattern_recognition', 'riddle_sequence']);
const WORD_CIPHER_KEYS = new Set(['word_cipher', 'cipher']);

/** Wire / match `gameKey` values that use the sequence / Pattern Recognition bank. */
export function isPatternRecognitionGameKey(gameKey) {
  return PATTERN_KEYS.has(String(gameKey || '').trim().toLowerCase());
}

/** Word Cipher lobby / match gameKey. */
export function isWordCipherGameKey(gameKey) {
  return WORD_CIPHER_KEYS.has(String(gameKey || '').trim().toLowerCase());
}

/** Modes with alternating turns and per-player decks (20 shared rounds, 10 answers each). */
export function isAlternatingTurnEnigmaGameKey(gameKey) {
  return isPatternRecognitionGameKey(gameKey) || isWordCipherGameKey(gameKey);
}

/**
 * Canonical key for question selection in enigmaQuestionSelection.js.
 * Maps lobby aliases to the internal branch used with Firestore `type` (riddle_sequence | sequence).
 */
export function enigmaGameKeyForQuestionSelection(gameKey) {
  const k = String(gameKey || '').trim().toLowerCase();
  if (PATTERN_KEYS.has(k)) return 'riddle_sequence';
  return k;
}
