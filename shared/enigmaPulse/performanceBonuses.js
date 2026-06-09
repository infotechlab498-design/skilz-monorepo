/**
 * Smart Hybrid rewards — fixed base (win/loss/draw) + performance bonuses at match end.
 * Server-authoritative; clients only display breakdown from MATCH_END.progression.
 */

export const PERFORMANCE_BONUS_CAPS = {
  maxBonusCoins: 15,
  maxBonusXp: 10,
};

/** @typedef {{ timeouts: number, skips: number, correct: number, wrong: number, firstTryCorrect: number, maxStreak: number, nodesPlayed: number }} MatchPerformanceStats */

export function createEmptyMatchStats() {
  return {
    timeouts: 0,
    skips: 0,
    correct: 0,
    wrong: 0,
    firstTryCorrect: 0,
    maxStreak: 0,
    nodesPlayed: 0,
  };
}

/**
 * @param {string} gameKey
 * @returns {'sequence_iq' | 'syllogism' | 'default'}
 */
export function performanceProfileForGameKey(gameKey) {
  const k = String(gameKey || '').toLowerCase();
  if (k === 'pattern_recognition' || k === 'riddle_sequence' || k === 'sequence_iq') {
    return 'sequence_iq';
  }
  if (k === 'syllogism') return 'syllogism';
  return 'default';
}

/**
 * @param {MatchPerformanceStats} stats
 * @param {number} maxStreak live streak on player
 */
export function syncMaxStreak(stats, maxStreak) {
  if (!stats) return;
  stats.maxStreak = Math.max(Number(stats.maxStreak || 0), Number(maxStreak || 0));
}

/**
 * Close out one turn/node for performance accounting.
 * @param {MatchPerformanceStats | undefined} stats
 * @param {{ timedOut?: boolean, skipped?: boolean }} flags
 */
export function recordTurnClosed(stats, { timedOut = false, skipped = false } = {}) {
  if (!stats) return;
  stats.nodesPlayed = Number(stats.nodesPlayed || 0) + 1;
  if (timedOut) stats.timeouts = Number(stats.timeouts || 0) + 1;
  if (skipped) stats.skips = Number(stats.skips || 0) + 1;
}

/**
 * @param {{
 *   gameKey?: string;
 *   matchStats?: MatchPerformanceStats | null;
 *   endReason?: string;
 *   isForfeitLeaver?: boolean;
 *   allowBonuses?: boolean;
 * }} input
 * @returns {{ bonusCoins: number, bonusXp: number, breakdown: Array<{ id: string, label: string, coins: number, xp: number }> }}
 */
export function computePerformanceBonuses({
  gameKey = '',
  matchStats = null,
  endReason = 'completed',
  isForfeitLeaver = false,
  allowBonuses = true,
}) {
  const empty = { bonusCoins: 0, bonusXp: 0, breakdown: [] };
  if (!allowBonuses || isForfeitLeaver || endReason === 'returned_lobby_prestart') {
    return empty;
  }

  const stats = matchStats || createEmptyMatchStats();
  const profile = performanceProfileForGameKey(gameKey);
  const nodes = Math.max(0, Number(stats.nodesPlayed || 0));
  const correct = Math.max(0, Number(stats.correct || 0));
  const accuracy = nodes > 0 ? correct / nodes : 0;

  /** Anti-farm: very low accuracy on meaningful sample → no performance bonus */
  if (nodes >= 3 && accuracy < 0.3) {
    return empty;
  }

  /** @type {Array<{ id: string, label: string, coins: number, xp: number }>} */
  const breakdown = [];

  if (Number(stats.timeouts || 0) === 0 && nodes >= 1) {
    breakdown.push({ id: 'no_timeout', label: 'No timeouts', coins: 5, xp: 0 });
  }

  const streakThreshold = profile === 'syllogism' ? 5 : 3;
  if (Number(stats.maxStreak || 0) >= streakThreshold) {
    breakdown.push({
      id: 'streak_master',
      label: `Streak ×${stats.maxStreak}`,
      coins: profile === 'syllogism' ? 5 : 3,
      xp: 0,
    });
  }

  const cleanThreshold =
    profile === 'sequence_iq' ? 8 : profile === 'syllogism' ? 8 : 7;
  const personalTotal = profile === 'sequence_iq' ? 10 : profile === 'syllogism' ? 10 : nodes;
  if (nodes >= Math.min(personalTotal, cleanThreshold) && correct >= cleanThreshold) {
    breakdown.push({ id: 'clean_run', label: 'Strong accuracy', coins: 0, xp: 5 });
  }

  const firstTryThreshold = profile === 'sequence_iq' ? 7 : 6;
  if (Number(stats.firstTryCorrect || 0) >= firstTryThreshold) {
    breakdown.push({ id: 'first_try_hero', label: 'First-try precision', coins: 3, xp: 0 });
  }

  if (profile === 'sequence_iq' && nodes >= 10 && correct >= 10) {
    breakdown.push({ id: 'perfect_nodes', label: 'Perfect nodes', coins: 5, xp: 5 });
  }

  if (profile === 'syllogism' && Number(stats.skips || 0) === 0 && nodes >= 8) {
    breakdown.push({ id: 'no_skips', label: 'No skips used', coins: 2, xp: 0 });
  }

  let bonusCoins = breakdown.reduce((s, b) => s + Number(b.coins || 0), 0);
  let bonusXp = breakdown.reduce((s, b) => s + Number(b.xp || 0), 0);
  const trimmed = [...breakdown];
  while (
    (bonusCoins > PERFORMANCE_BONUS_CAPS.maxBonusCoins ||
      bonusXp > PERFORMANCE_BONUS_CAPS.maxBonusXp) &&
    trimmed.length
  ) {
    const last = trimmed.pop();
    bonusCoins -= Number(last?.coins || 0);
    bonusXp -= Number(last?.xp || 0);
  }
  bonusCoins = Math.min(PERFORMANCE_BONUS_CAPS.maxBonusCoins, Math.max(0, bonusCoins));
  bonusXp = Math.min(PERFORMANCE_BONUS_CAPS.maxBonusXp, Math.max(0, bonusXp));

  return { bonusCoins, bonusXp, breakdown: trimmed };
}

/**
 * Fixed base rewards before performance bonuses.
 * @param {typeof import('./constants.js').ENIGMA_PULSE} ENIGMA_PULSE
 * @param {{ gameKey?: string, won?: boolean, draw?: boolean }} input
 */
export function computeBaseMatchRewards(ENIGMA_PULSE, { gameKey = '', won = false, draw = false }) {
  const isSequenceIq = performanceProfileForGameKey(gameKey) === 'sequence_iq';
  const seq = ENIGMA_PULSE.SEQUENCE_IQ_REWARDS || {};

  if (draw) {
    return {
      baseXp: Number(ENIGMA_PULSE.DRAW_XP_REWARD ?? 10),
      baseCoins: Number(ENIGMA_PULSE.DRAW_REFUND_COINS ?? 10),
    };
  }
  if (won) {
    return {
      baseXp: Number(isSequenceIq ? seq.winXp : ENIGMA_PULSE.WIN_XP_REWARD),
      baseCoins: Number(isSequenceIq ? seq.winCoins : ENIGMA_PULSE.WIN_COINS_REWARD),
    };
  }
  return {
    baseXp: Number(isSequenceIq ? seq.lossXp : ENIGMA_PULSE.LOSS_XP_REWARD),
    baseCoins: Number(isSequenceIq ? seq.lossCoins : ENIGMA_PULSE.LOSS_COINS_REWARD),
  };
}
