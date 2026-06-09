import {
  ENIGMA_MODE_KEYS,
  GAME_KEYS,
  TRIVIA_CATEGORY_KEYS,
  DEFAULT_ENTRY_FEE_COINS,
} from './constants.js';

/** @typedef {import('./types.js').GameEconomyConfig} GameEconomyConfig */

/**
 * Normalize trivia lobby category to config key.
 * @param {string} [category]
 */
export function normalizeTriviaCategoryKey(category) {
  const c = String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (c === 'current_affairs' || c === 'current-affairs' || c === 'current affairs') {
    return 'current_affairs';
  }
  if (c === 'history') return 'history';
  return 'history';
}

/**
 * Normalize EnigmaPulse lobby gameKey to config mode key.
 * @param {string} [modeKey]
 */
export function normalizeEnigmaModeKey(modeKey) {
  const k = String(modeKey || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (k === 'pattern_recognition' || k === 'riddle_sequence' || k === 'sequence') {
    return 'pattern_recognition';
  }
  if (k === 'word_cipher' || k === 'riddle_classic' || k === 'cipher') {
    return 'word_cipher';
  }
  if (k === 'syllogism') return 'syllogism';
  if (ENIGMA_MODE_KEYS.includes(k)) return k;
  return 'pattern_recognition';
}

/**
 * Merge a partial variant override onto a base game slice (null/undefined = inherit).
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown> | null | undefined} override
 */
export function mergeVariantOverride(base, override) {
  if (!override || typeof override !== 'object') {
    return { ...base };
  }

  const out = { ...base };

  for (const [key, val] of Object.entries(override)) {
    if (val === null || val === undefined) continue;

    if (key === 'rewards' && val && typeof val === 'object') {
      const r = /** @type {Record<string, Record<string, number>>} */ (val);
      out.rewards = {
        win: { ...(base.rewards?.win || {}), ...(r.win || {}) },
        lose: { ...(base.rewards?.lose || {}), ...(r.lose || {}) },
        draw: { ...(base.rewards?.draw || {}), ...(r.draw || {}) },
      };
      continue;
    }

    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = { .../** @type {object} */ (out[key]), ...val };
    } else {
      out[key] = val;
    }
  }

  if (base.enabled === false) out.enabled = false;
  if (override.enabled === false) out.enabled = false;

  return out;
}

/**
 * Effective trivia config for a category (parent + category override).
 * @param {GameEconomyConfig | { games?: Record<string, unknown> }} config
 * @param {string} [category]
 */
export function resolveTriviaVariant(config, category) {
  const catKey = normalizeTriviaCategoryKey(category);
  const base = config?.games?.[GAME_KEYS.TRIVIA];
  if (!base || typeof base !== 'object') return null;

  const override = base.categories?.[catKey];
  const resolved = mergeVariantOverride(base, override);
  return { ...resolved, _variantKey: catKey, _gameKey: GAME_KEYS.TRIVIA };
}

/**
 * Effective EnigmaPulse config for a sub-game mode.
 * @param {GameEconomyConfig | { games?: Record<string, unknown> }} config
 * @param {string} [modeKey]
 */
export function resolveEnigmaModeVariant(config, modeKey) {
  const mk = normalizeEnigmaModeKey(modeKey);
  const base = config?.games?.[GAME_KEYS.ENIGMA_PULSE];
  if (!base || typeof base !== 'object') return null;

  const modeOverride = base.modes?.[mk] || {};
  const parentBase = {
    enabled: base.enabled,
    entryFee: base.entryFee,
    questionCount: base.defaults?.questionCount,
    questionSeconds: base.defaults?.questionSeconds,
    matchmakingTimeoutMs: base.defaults?.matchmakingTimeoutMs,
    reconnectGraceMs: base.defaults?.reconnectGraceMs,
    maxAttemptsPerQuestion: base.defaults?.maxAttemptsPerQuestion,
    rewards: base.rewards,
    performanceBonuses: base.performanceBonuses,
    questionsPerPlayer: modeOverride.questionsPerPlayer,
    sharedRounds: modeOverride.sharedRounds,
  };

  const resolved = mergeVariantOverride(parentBase, modeOverride);
  const questionCount =
    resolved.questionCount ??
    resolved.sharedRounds ??
    modeOverride.questionCount ??
    null;

  return {
    ...resolved,
    questionCount,
    _variantKey: mk,
    _gameKey: GAME_KEYS.ENIGMA_PULSE,
  };
}

/**
 * Resolve variant slice for supported games.
 * @param {GameEconomyConfig} config
 * @param {string} gameKey
 * @param {string} [variantKey]
 */
export function resolveGameVariant(config, gameKey, variantKey) {
  const key = String(gameKey || '').trim().toLowerCase().replace(/-/g, '_');
  if (!variantKey) return config?.games?.[key] ?? null;

  if (key === GAME_KEYS.TRIVIA) return resolveTriviaVariant(config, variantKey);
  if (key === GAME_KEYS.ENIGMA_PULSE) return resolveEnigmaModeVariant(config, variantKey);
  return config?.games?.[key] ?? null;
}

function baseEntryFeeFromConfig(config, gameKey) {
  const normalized = String(gameKey || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const aliases = {
    mathrush: 'math_rush',
    enigmapulse: 'enigma_pulse',
    enigma: 'enigma_pulse',
  };
  const key = aliases[normalized] || normalized;
  const fee = Number(config?.games?.[key]?.entryFee);
  if (Number.isFinite(fee) && fee >= 0) return fee;
  const globalFee = Number(config?.global?.defaultEntryFee);
  if (Number.isFinite(globalFee) && globalFee >= 0) return globalFee;
  return DEFAULT_ENTRY_FEE_COINS;
}

/**
 * Entry fee for a game, optionally per trivia category or enigma mode.
 * @param {GameEconomyConfig} config
 * @param {string} gameKey
 * @param {string} [variantKey]
 */
export function getEntryFeeForVariant(config, gameKey, variantKey) {
  const key = String(gameKey || '').trim().toLowerCase().replace(/-/g, '_');

  if (variantKey && key === GAME_KEYS.TRIVIA) {
    const resolved = resolveTriviaVariant(config, variantKey);
    const fee = Number(resolved?.entryFee);
    if (Number.isFinite(fee) && fee >= 0) return fee;
  }

  if (variantKey && key === GAME_KEYS.ENIGMA_PULSE) {
    const resolved = resolveEnigmaModeVariant(config, variantKey);
    const fee = Number(resolved?.entryFee);
    if (Number.isFinite(fee) && fee >= 0) return fee;
  }

  return baseEntryFeeFromConfig(config, gameKey);
}

/**
 * Lobby-safe public variant slice.
 * @param {ReturnType<typeof resolveTriviaVariant> | ReturnType<typeof resolveEnigmaModeVariant>} resolved
 */
export function toPublicVariantSlice(resolved) {
  if (!resolved) return null;
  return {
    enabled: Boolean(resolved.enabled),
    entryFee: Number(resolved.entryFee) || 0,
    questionCount: resolved.questionCount ?? resolved.sharedRounds ?? null,
    questionSeconds: resolved.questionSeconds ?? null,
    matchmakingTimeoutMs: resolved.matchmakingTimeoutMs ?? null,
    questionsPerPlayer: resolved.questionsPerPlayer ?? null,
    sharedRounds: resolved.sharedRounds ?? null,
    variantKey: resolved._variantKey ?? null,
  };
}

export { TRIVIA_CATEGORY_KEYS, ENIGMA_MODE_KEYS };
