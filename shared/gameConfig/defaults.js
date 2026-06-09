import { ENIGMA_PULSE } from '../enigmaPulse/constants.js';
import { TRIVIA_BONUS_CAPS, TRIVIA_QUICK_ANSWER_MS, TRIVIA_REWARDS } from '../trivia/constants.js';
import { COGNITIVE_MAX_ROUNDS, COGNITIVE_ROUND_MS, COGNITIVE_MATCH_WINDOW_MS } from '../cognitive/constants.js';
import {
  NODES_PER_MATCH,
  DEFAULT_QUESTION_MS,
  MATCH_WINDOW_MS,
  BOT_CORRECT_PROBABILITY,
} from '../neurochain/constants.js';
import {
  ALL_GAME_KEYS,
  DEFAULT_ENTRY_FEE_COINS,
  ENIGMA_MODE_KEYS,
  GAME_CONFIG_SCHEMA_VERSION,
  GAME_KEYS,
  TRIVIA_CATEGORY_KEYS,
} from './constants.js';
import { resolveEnigmaModeVariant, resolveTriviaVariant, toPublicVariantSlice } from './resolve.js';

/**
 * @typedef {{ coins: number, xp: number }} OutcomeReward
 * @typedef {{
 *   enabled: boolean,
 *   entryFee: number,
 *   rewards: { win: OutcomeReward, lose: OutcomeReward, draw: OutcomeReward },
 * }} GameEconomySlice
 */

function rewardTriple(win, lose, draw) {
  return {
    win: { coins: Number(win.coins) || 0, xp: Number(win.xp) || 0 },
    lose: { coins: Number(lose.coins) || 0, xp: Number(lose.xp) || 0 },
    draw: { coins: Number(draw.coins) || 0, xp: Number(draw.xp) || 0 },
  };
}

function baseGameSlice(overrides = {}) {
  return {
    enabled: true,
    entryFee: DEFAULT_ENTRY_FEE_COINS,
    ...overrides,
  };
}

/**
 * Full default document — mirrors current hardcoded production values with entryFee 10 for all games.
 * @returns {import('./types.js').GameEconomyConfig}
 */
export function buildDefaultGameEconomyConfig() {
  return {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    updatedAt: null,
    updatedBy: null,
    global: {
      defaultEntryFee: DEFAULT_ENTRY_FEE_COINS,
      maintenanceMode: false,
    },
    games: {
      [GAME_KEYS.TRIVIA]: {
        ...baseGameSlice(),
        questionCount: 20,
        questionSeconds: 15,
        matchmakingTimeoutMs: 12_000,
        reconnectGraceMs: 10_000,
        rematchTimeoutMs: 60_000,
        rewards: rewardTriple(
          { coins: TRIVIA_REWARDS.WIN_COINS, xp: TRIVIA_REWARDS.WIN_XP },
          { coins: TRIVIA_REWARDS.LOSE_COINS, xp: TRIVIA_REWARDS.LOSE_XP },
          { coins: TRIVIA_REWARDS.DRAW_COINS, xp: TRIVIA_REWARDS.DRAW_XP }
        ),
        performanceBonuses: {
          enabled: true,
          maxBonusCoins: TRIVIA_BONUS_CAPS.maxBonusCoins,
          maxBonusXp: TRIVIA_BONUS_CAPS.maxBonusXp,
          quickAnswerMs: TRIVIA_QUICK_ANSWER_MS,
        },
        difficulties: {
          easy: { botCorrectRate: 0.6 },
          medium: { botCorrectRate: 0.75 },
          hard: { botCorrectRate: 0.85 },
        },
        categories: Object.fromEntries(
          TRIVIA_CATEGORY_KEYS.map((catKey) => [catKey, { enabled: true }])
        ),
      },
      [GAME_KEYS.MATH_RUSH]: {
        ...baseGameSlice(),
        maxRounds: 10,
        turnSeconds: 15,
        botMatchDelayMs: 10_000,
        reconnectGraceMs: 10_000,
        rewards: rewardTriple(
          { coins: 50, xp: 30 },
          { coins: 10, xp: 0 },
          { coins: 10, xp: 0 }
        ),
        difficulties: {
          easy: { botWinRate: 0.85 },
          medium: { botWinRate: 0.7 },
          hard: { botWinRate: 0.55 },
        },
      },
      [GAME_KEYS.LUDO]: {
        ...baseGameSlice(),
        turnTimerSec: 30,
        waitWindowMs: 12_000,
        maxPlayers: 4,
        prizeMultipliers: { rank1: 2, rank2: 1.5 },
        quitterPenaltyMultiplier: 2,
        rankXp: { rank1: 100, rank2To3: 50, other: 25 },
      },
      [GAME_KEYS.ENIGMA_PULSE]: {
        ...baseGameSlice(),
        defaults: {
          questionCount: ENIGMA_PULSE.QUESTION_COUNT,
          questionSeconds: ENIGMA_PULSE.QUESTION_SECONDS,
          matchmakingTimeoutMs: ENIGMA_PULSE.MATCHMAKING_TIMEOUT_MS,
          reconnectGraceMs: ENIGMA_PULSE.RECONNECT_GRACE_MS,
          maxAttemptsPerQuestion: ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION,
        },
        rewards: rewardTriple(
          { coins: ENIGMA_PULSE.WIN_COINS_REWARD, xp: ENIGMA_PULSE.WIN_XP_REWARD },
          { coins: ENIGMA_PULSE.LOSS_COINS_REWARD, xp: ENIGMA_PULSE.LOSS_XP_REWARD },
          { coins: ENIGMA_PULSE.DRAW_REFUND_COINS, xp: ENIGMA_PULSE.DRAW_XP_REWARD }
        ),
        performanceBonuses: {
          enabled: true,
          maxBonusCoins: 15,
          maxBonusXp: 10,
        },
        modes: {
          pattern_recognition: {
            enabled: true,
            entryFee: DEFAULT_ENTRY_FEE_COINS,
            questionsPerPlayer: ENIGMA_PULSE.SEQUENCE_IQ_QUESTIONS_PER_PLAYER,
            sharedRounds: ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS,
            questionSeconds: ENIGMA_PULSE.SEQUENCE_IQ_TIMER_SECONDS?.medium ?? ENIGMA_PULSE.QUESTION_SECONDS,
            matchmakingTimeoutMs: ENIGMA_PULSE.MATCHMAKING_TIMEOUT_MS,
            timerSeconds: { ...ENIGMA_PULSE.SEQUENCE_IQ_TIMER_SECONDS },
            rewards: rewardTriple(
              {
                coins: ENIGMA_PULSE.SEQUENCE_IQ_REWARDS.winCoins,
                xp: ENIGMA_PULSE.SEQUENCE_IQ_REWARDS.winXp,
              },
              {
                coins: ENIGMA_PULSE.SEQUENCE_IQ_REWARDS.lossCoins,
                xp: ENIGMA_PULSE.SEQUENCE_IQ_REWARDS.lossXp,
              },
              { coins: ENIGMA_PULSE.DRAW_REFUND_COINS, xp: ENIGMA_PULSE.DRAW_XP_REWARD }
            ),
          },
          word_cipher: {
            enabled: true,
            entryFee: DEFAULT_ENTRY_FEE_COINS,
            questionsPerPlayer: ENIGMA_PULSE.WORD_CIPHER_QUESTIONS_PER_PLAYER,
            sharedRounds: ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS,
            questionSeconds: ENIGMA_PULSE.QUESTION_SECONDS,
            matchmakingTimeoutMs: ENIGMA_PULSE.MATCHMAKING_TIMEOUT_MS,
          },
          syllogism: {
            enabled: true,
            entryFee: DEFAULT_ENTRY_FEE_COINS,
            questionCount: ENIGMA_PULSE.QUESTION_COUNT,
            questionSeconds: ENIGMA_PULSE.QUESTION_SECONDS,
            matchmakingTimeoutMs: ENIGMA_PULSE.MATCHMAKING_TIMEOUT_MS,
          },
        },
      },
      [GAME_KEYS.NEUROCHAIN]: {
        ...baseGameSlice(),
        nodesPerMatch: NODES_PER_MATCH,
        questionMs: DEFAULT_QUESTION_MS,
        matchWindowMs: MATCH_WINDOW_MS,
        botCorrectProbability: BOT_CORRECT_PROBABILITY,
        rewards: rewardTriple(
          { coins: 0, xp: 0 },
          { coins: 0, xp: 0 },
          { coins: 0, xp: 0 }
        ),
      },
      [GAME_KEYS.COGNITIVE]: {
        ...baseGameSlice(),
        maxRounds: COGNITIVE_MAX_ROUNDS,
        roundMs: COGNITIVE_ROUND_MS,
        matchWindowMs: COGNITIVE_MATCH_WINDOW_MS,
        rewards: rewardTriple(
          { coins: 0, xp: 0 },
          { coins: 0, xp: 0 },
          { coins: 0, xp: 0 }
        ),
      },
    },
  };
}

/**
 * Deep-merge persisted config onto defaults (admin partial updates safe).
 * @param {Record<string, unknown> | null | undefined} persisted
 * @returns {ReturnType<typeof buildDefaultGameEconomyConfig>}
 */
export function mergeGameEconomyWithDefaults(persisted) {
  const defaults = buildDefaultGameEconomyConfig();
  if (!persisted || typeof persisted !== 'object') return defaults;

  const merged = structuredClone(defaults);
  if (persisted.global && typeof persisted.global === 'object') {
    merged.global = { ...merged.global, ...persisted.global };
  }
  if (Number.isFinite(Number(persisted.schemaVersion))) {
    merged.schemaVersion = Number(persisted.schemaVersion);
  }
  if (persisted.updatedAt != null) merged.updatedAt = persisted.updatedAt;
  if (persisted.updatedBy != null) merged.updatedBy = persisted.updatedBy;

  const srcGames = persisted.games;
  if (srcGames && typeof srcGames === 'object') {
    for (const key of ALL_GAME_KEYS) {
      if (srcGames[key] && typeof srcGames[key] === 'object') {
        merged.games[key] = deepMergeObjects(merged.games[key], srcGames[key]);
      }
    }
  }

  return merged;
}

/**
 * @param {unknown} target
 * @param {unknown} source
 */
function deepMergeObjects(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source ?? target;
  }
  const out = { ...(target && typeof target === 'object' ? target : {}) };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMergeObjects(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Public lobby-safe slice (fees, counts, timers — no bot tuning internals).
 * @param {ReturnType<typeof buildDefaultGameEconomyConfig>} full
 */
export function toPublicGameEconomyConfig(full) {
  const games = {};
  for (const key of ALL_GAME_KEYS) {
    const g = full.games[key];
    if (!g) continue;
    games[key] = {
      enabled: Boolean(g.enabled),
      entryFee: Number(g.entryFee) || DEFAULT_ENTRY_FEE_COINS,
      questionCount: g.questionCount ?? g.defaults?.questionCount ?? g.maxRounds ?? g.nodesPerMatch ?? null,
      questionSeconds: g.questionSeconds ?? g.turnSeconds ?? g.defaults?.questionSeconds ?? null,
      maxRounds: g.maxRounds ?? null,
      turnTimerSec: g.turnTimerSec ?? null,
      categories:
        key === GAME_KEYS.TRIVIA
          ? Object.fromEntries(
              TRIVIA_CATEGORY_KEYS.map((catKey) => [
                catKey,
                toPublicVariantSlice(resolveTriviaVariant(full, catKey)),
              ])
            )
          : undefined,
      modes: g.modes
        ? Object.fromEntries(
            Object.entries(g.modes).map(([modeKey]) => [
              modeKey,
              toPublicVariantSlice(resolveEnigmaModeVariant(full, modeKey)),
            ])
          )
        : undefined,
    };
  }
  return {
    schemaVersion: full.schemaVersion,
    updatedAt: full.updatedAt ?? null,
    global: {
      defaultEntryFee: Number(full.global?.defaultEntryFee) || DEFAULT_ENTRY_FEE_COINS,
      maintenanceMode: Boolean(full.global?.maintenanceMode),
    },
    games,
  };
}
