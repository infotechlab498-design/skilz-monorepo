/**
 * NeuroChain — shared constants for frontend + Cloud Functions (duplicate import paths as needed).
 */

/** @type {10} */
export const NODES_PER_MATCH = 10;

export const NC_BOT_UID = 'nc_bot_practice';

export const COLLECTIONS = {
  GAMES: 'neurochain_games',
  SECRETS: 'neurochain_game_secrets',
  QUEUE: 'neurochain_matchmaking_queue',
};

/** Callable names (must match backend/functions/index.js exports). */
export const CALLABLES = {
  START_PRACTICE: 'neuroChainStartPractice',
  ENQUEUE_1V1: 'neuroChainEnqueue1v1',
  TRY_MATCH: 'neuroChainTryMatch',
  LEAVE_QUEUE: 'neuroChainLeaveQueue',
  SUBMIT_ANSWER: 'neuroChainSubmitAnswer',
  START_INVITE_FROM_MATCH: 'neuroChainStartInviteFromMatch',
};

/** Default ms per question (server). */
export const DEFAULT_QUESTION_MS = 30_000;

/** Grace after questionEndsAt for network latency (ms). */
export const ANSWER_GRACE_MS = 2_500;

/** Max stored used question ids per user (ring buffer). */
export const USED_QUESTION_IDS_CAP = 1500;

/** 1v1 queue pairing window (ms). */
export const MATCH_WINDOW_MS = 12_000;

/** Bot accuracy (server-side). */
export const BOT_CORRECT_PROBABILITY = 0.8;

/**
 * Node index 0..9 → difficulty tier for question selection.
 * @param {number} nodeIndex
 * @returns {'easy' | 'medium' | 'hard'}
 */
export function nodeTier(nodeIndex) {
  const i = Math.max(0, Math.min(NODES_PER_MATCH - 1, Math.floor(nodeIndex)));
  if (i <= 2) return 'easy';
  if (i <= 6) return 'medium';
  return 'hard';
}

/**
 * UI-only suggested opponent delay range per tier (ms). Client may animate; server may echo in doc.
 * @param {'easy' | 'medium' | 'hard'} tier
 * @returns {{ min: number, max: number }}
 */
export function botUiDelayRangeMs(tier) {
  if (tier === 'easy') return { min: 400, max: 1200 };
  if (tier === 'medium') return { min: 800, max: 2000 };
  return { min: 1200, max: 3500 };
}
