import { ALL_GAME_KEYS, DEFAULT_ENTRY_FEE_COINS, ENIGMA_MODE_KEYS, GAME_CONFIG_SCHEMA_VERSION, TRIVIA_CATEGORY_KEYS } from './constants.js';
import { mergeGameEconomyWithDefaults } from './defaults.js';
import { getEntryFeeForVariant } from './resolve.js';

const MAX_ENTRY_FEE = 10_000;
const MAX_COINS = 100_000;
const MAX_XP = 100_000;
const MAX_QUESTION_COUNT = 50;
const MAX_TIMER_SEC = 120;

/**
 * @param {unknown} n
 * @param {{ min?: number, max?: number, label: string }} opts
 */
function assertIntInRange(n, { min = 0, max = Number.MAX_SAFE_INTEGER, label }) {
  const v = Number(n);
  if (!Number.isFinite(v) || !Number.isInteger(v)) {
    throw new Error(`${label} must be an integer`);
  }
  if (v < min || v > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return v;
}

/**
 * @param {unknown} reward
 * @param {string} path
 */
function validateOutcomeReward(reward, path) {
  if (!reward || typeof reward !== 'object') {
    throw new Error(`${path} is required`);
  }
  assertIntInRange(reward.coins, { min: 0, max: MAX_COINS, label: `${path}.coins` });
  assertIntInRange(reward.xp, { min: 0, max: MAX_XP, label: `${path}.xp` });
}

/**
 * @param {unknown} config — raw Firestore or API body (merged with defaults before return)
 * @returns {ReturnType<import('./defaults.js').buildDefaultGameEconomyConfig>}
 */
export function validateAndNormalizeGameEconomyConfig(config) {
  const merged = mergeGameEconomyWithDefaults(config);

  assertIntInRange(merged.schemaVersion, {
    min: 1,
    max: GAME_CONFIG_SCHEMA_VERSION,
    label: 'schemaVersion',
  });

  assertIntInRange(merged.global.defaultEntryFee, {
    min: 0,
    max: MAX_ENTRY_FEE,
    label: 'global.defaultEntryFee',
  });

  let enabledCount = 0;
  for (const key of ALL_GAME_KEYS) {
    const g = merged.games[key];
    if (!g) throw new Error(`Missing game config: ${key}`);

    assertIntInRange(g.entryFee, { min: 0, max: MAX_ENTRY_FEE, label: `games.${key}.entryFee` });
    if (g.enabled) enabledCount += 1;

    if (g.rewards) {
      validateOutcomeReward(g.rewards.win, `games.${key}.rewards.win`);
      validateOutcomeReward(g.rewards.lose, `games.${key}.rewards.lose`);
      validateOutcomeReward(g.rewards.draw, `games.${key}.rewards.draw`);
    }

    if (g.questionCount != null) {
      assertIntInRange(g.questionCount, { min: 1, max: MAX_QUESTION_COUNT, label: `games.${key}.questionCount` });
    }
    if (g.questionSeconds != null) {
      assertIntInRange(g.questionSeconds, { min: 5, max: MAX_TIMER_SEC, label: `games.${key}.questionSeconds` });
    }
    if (g.maxRounds != null) {
      assertIntInRange(g.maxRounds, { min: 1, max: MAX_QUESTION_COUNT, label: `games.${key}.maxRounds` });
    }
    if (g.turnTimerSec != null) {
      assertIntInRange(g.turnTimerSec, { min: 5, max: MAX_TIMER_SEC, label: `games.${key}.turnTimerSec` });
    }

    if (g.categories && typeof g.categories === 'object') {
      for (const catKey of TRIVIA_CATEGORY_KEYS) {
        const cat = g.categories[catKey];
        if (!cat || typeof cat !== 'object') continue;
        if (cat.entryFee != null) {
          assertIntInRange(cat.entryFee, { min: 0, max: MAX_ENTRY_FEE, label: `games.${key}.categories.${catKey}.entryFee` });
        }
        if (cat.questionCount != null) {
          assertIntInRange(cat.questionCount, { min: 1, max: MAX_QUESTION_COUNT, label: `games.${key}.categories.${catKey}.questionCount` });
        }
        if (cat.questionSeconds != null) {
          assertIntInRange(cat.questionSeconds, { min: 5, max: MAX_TIMER_SEC, label: `games.${key}.categories.${catKey}.questionSeconds` });
        }
      }
    }

    if (g.modes && typeof g.modes === 'object') {
      for (const modeKey of ENIGMA_MODE_KEYS) {
        const mode = g.modes[modeKey];
        if (!mode || typeof mode !== 'object') continue;
        if (mode.entryFee != null) {
          assertIntInRange(mode.entryFee, { min: 0, max: MAX_ENTRY_FEE, label: `games.${key}.modes.${modeKey}.entryFee` });
        }
        if (mode.questionCount != null) {
          assertIntInRange(mode.questionCount, { min: 1, max: MAX_QUESTION_COUNT, label: `games.${key}.modes.${modeKey}.questionCount` });
        }
        if (mode.questionSeconds != null) {
          assertIntInRange(mode.questionSeconds, { min: 5, max: MAX_TIMER_SEC, label: `games.${key}.modes.${modeKey}.questionSeconds` });
        }
      }
    }
  }

  if (enabledCount === 0) {
    throw new Error('At least one game must remain enabled');
  }

  return merged;
}

/**
 * Resolve entry fee for a game key (defaults to 10 coins).
 * @param {ReturnType<import('./defaults.js').buildDefaultGameEconomyConfig>} config
 * @param {string} gameKey
 * @param {string} [variantKey] — trivia category or enigma mode
 */
export function getEntryFeeFromConfig(config, gameKey, variantKey = null) {
  if (variantKey) {
    return getEntryFeeForVariant(config, gameKey, variantKey);
  }
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
