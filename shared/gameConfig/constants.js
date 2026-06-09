/** Firestore platform config — single source of truth for game economy. */
export const PLATFORM_CONFIG_COLLECTION = 'platform_config';
export const GAME_ECONOMY_DOC_ID = 'game_economy';
export const GAME_ECONOMY_AUDIT_SUBCOLLECTION = 'audit_log';

export const GAME_CONFIG_SCHEMA_VERSION = 1;

/** Canonical game keys used in Firestore `games` map. */
export const GAME_KEYS = Object.freeze({
  TRIVIA: 'trivia',
  MATH_RUSH: 'math_rush',
  LUDO: 'ludo',
  ENIGMA_PULSE: 'enigma_pulse',
  NEUROCHAIN: 'neurochain',
  COGNITIVE: 'cognitive',
});

export const ALL_GAME_KEYS = Object.freeze(Object.values(GAME_KEYS));

/** EnigmaPulse sub-mode keys under `games.enigma_pulse.modes`. */
export const ENIGMA_MODE_KEYS = Object.freeze([
  'pattern_recognition',
  'word_cipher',
  'syllogism',
]);

/** Trivia category keys under `games.trivia.categories`. */
export const TRIVIA_CATEGORY_KEYS = Object.freeze(['history', 'current_affairs']);

export const TRIVIA_CATEGORY_LABELS = Object.freeze({
  history: 'History',
  current_affairs: 'Current Affairs',
});

export const ENIGMA_MODE_LABELS = Object.freeze({
  pattern_recognition: 'Pattern Recognition',
  word_cipher: 'Word Cipher',
  syllogism: 'Syllogism',
});

/** Default entry fee (coins) for every game until admin overrides. */
export const DEFAULT_ENTRY_FEE_COINS = 10;
