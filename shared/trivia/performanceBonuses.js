import { TRIVIA_BONUS_CAPS, TRIVIA_QUICK_ANSWER_MS, TRIVIA_REWARDS } from './constants.js';

/** @typedef {{ correct: number, wrong: number, timeouts: number, maxStreak: number, totalAnswerMs: number, answeredCount: number, attempts: number }} TriviaMatchStats */

export function createEmptyTriviaMatchStats() {
  return {
    correct: 0,
    wrong: 0,
    timeouts: 0,
    maxStreak: 0,
    totalAnswerMs: 0,
    answeredCount: 0,
    attempts: 0,
  };
}

/**
 * @param {TriviaMatchStats | undefined} stats
 * @param {{ correct?: boolean, answerMs?: number, timedOut?: boolean }} flags
 */
export function recordTriviaAnswer(stats, { correct = false, answerMs = 0, timedOut = false } = {}) {
  if (!stats) return;
  stats.attempts = Number(stats.attempts || 0) + 1;
  if (timedOut) {
    stats.timeouts = Number(stats.timeouts || 0) + 1;
    stats.wrong = Number(stats.wrong || 0) + 1;
    return;
  }
  stats.answeredCount = Number(stats.answeredCount || 0) + 1;
  stats.totalAnswerMs = Number(stats.totalAnswerMs || 0) + Math.max(0, Number(answerMs) || 0);
  if (correct) stats.correct = Number(stats.correct || 0) + 1;
  else stats.wrong = Number(stats.wrong || 0) + 1;
}

/**
 * @param {TriviaMatchStats | undefined} stats
 * @param {number} currentStreak
 */
export function syncTriviaMaxStreak(stats, currentStreak) {
  if (!stats) return;
  stats.maxStreak = Math.max(Number(stats.maxStreak || 0), Number(currentStreak || 0));
}

/**
 * @param {TriviaMatchStats | null | undefined} stats
 * @returns {{ avgAnswerMs: number | null, accuracyPct: number }}
 */
export function summarizeTriviaPerformance(stats) {
  const s = stats || createEmptyTriviaMatchStats();
  const attempts = Math.max(0, Number(s.attempts || 0));
  const correct = Math.max(0, Number(s.correct || 0));
  const answered = Math.max(0, Number(s.answeredCount || 0));
  const accuracyPct = attempts > 0 ? Math.round((1000 * correct) / attempts) / 10 : 0;
  const avgAnswerMs = answered > 0 ? Math.round(Number(s.totalAnswerMs || 0) / answered) : null;
  return {
    avgAnswerMs,
    accuracyPct,
    maxStreak: Number(s.maxStreak || 0),
    correct,
    wrong: Number(s.wrong || 0),
    timeouts: Number(s.timeouts || 0),
    attempts,
  };
}

/**
 * Fixed base rewards before performance bonuses.
 * @param {{ won?: boolean, draw?: boolean }} input
 */
export function computeTriviaBaseRewards({ won = false, draw = false } = {}) {
  if (draw) {
    return { baseCoins: TRIVIA_REWARDS.DRAW_COINS, baseXp: TRIVIA_REWARDS.DRAW_XP };
  }
  if (won) {
    return { baseCoins: TRIVIA_REWARDS.WIN_COINS, baseXp: TRIVIA_REWARDS.WIN_XP };
  }
  return { baseCoins: TRIVIA_REWARDS.LOSE_COINS, baseXp: TRIVIA_REWARDS.LOSE_XP };
}

/**
 * Performance bonuses — server authoritative.
 * @param {{
 *   matchStats?: TriviaMatchStats | null;
 *   won?: boolean;
 *   draw?: boolean;
 *   isForfeitLeaver?: boolean;
 *   allowBonuses?: boolean;
 * }} input
 */
export function computeTriviaPerformanceBonuses({
  matchStats = null,
  won = false,
  draw = false,
  isForfeitLeaver = false,
  allowBonuses = true,
} = {}) {
  const empty = { bonusCoins: 0, bonusXp: 0, breakdown: [] };
  if (!allowBonuses || isForfeitLeaver) return empty;

  const stats = matchStats || createEmptyTriviaMatchStats();
  const attempts = Math.max(0, Number(stats.attempts || 0));
  const correct = Math.max(0, Number(stats.correct || 0));
  const accuracy = attempts > 0 ? correct / attempts : 0;

  /** Anti-farm: very low accuracy on a meaningful sample → no performance bonus */
  if (attempts >= 5 && accuracy < 0.3) return empty;

  /** @type {Array<{ id: string, label: string, coins: number, xp: number }>} */
  const breakdown = [];

  if (Number(stats.timeouts || 0) === 0 && attempts >= 1) {
    breakdown.push({ id: 'no_timeout', label: 'No timeouts', coins: 5, xp: 0 });
  }

  if (Number(stats.maxStreak || 0) >= 3) {
    breakdown.push({
      id: 'hot_streak',
      label: `Hot streak ×${stats.maxStreak}`,
      coins: 3,
      xp: 0,
    });
  }

  if (attempts >= 5 && accuracy >= 0.8) {
    breakdown.push({ id: 'sharp_shooter', label: 'Sharp shooter (80%+)', coins: 0, xp: 5 });
  }

  const answered = Math.max(0, Number(stats.answeredCount || 0));
  const avgMs = answered > 0 ? Number(stats.totalAnswerMs || 0) / answered : null;
  if (answered >= 3 && avgMs != null && avgMs <= TRIVIA_QUICK_ANSWER_MS) {
    breakdown.push({ id: 'quick_thinker', label: 'Quick thinker', coins: 5, xp: 5 });
  }

  if (
    attempts >= 5 &&
    Number(stats.wrong || 0) === Number(stats.timeouts || 0) &&
    Number(stats.timeouts || 0) === 0 &&
    correct === attempts
  ) {
    breakdown.push({ id: 'clean_sheet', label: 'Clean sheet', coins: 5, xp: 0 });
  }

  /** Small consolation for losers who still played well */
  if (!won && !draw && attempts >= 5 && accuracy >= 0.6) {
    breakdown.push({ id: 'good_fight', label: 'Good fight', coins: 0, xp: 5 });
  }

  let bonusCoins = breakdown.reduce((sum, row) => sum + Number(row.coins || 0), 0);
  let bonusXp = breakdown.reduce((sum, row) => sum + Number(row.xp || 0), 0);
  const trimmed = [...breakdown];

  while (
    (bonusCoins > TRIVIA_BONUS_CAPS.maxBonusCoins || bonusXp > TRIVIA_BONUS_CAPS.maxBonusXp) &&
    trimmed.length
  ) {
    const last = trimmed.pop();
    bonusCoins -= Number(last?.coins || 0);
    bonusXp -= Number(last?.xp || 0);
  }

  bonusCoins = Math.min(TRIVIA_BONUS_CAPS.maxBonusCoins, Math.max(0, bonusCoins));
  bonusXp = Math.min(TRIVIA_BONUS_CAPS.maxBonusXp, Math.max(0, bonusXp));

  return { bonusCoins, bonusXp, breakdown: trimmed };
}

/**
 * @param {{
 *   matchStats?: TriviaMatchStats | null;
 *   won?: boolean;
 *   draw?: boolean;
 *   isForfeitLeaver?: boolean;
 *   allowBonuses?: boolean;
 * }} input
 */
export function computeTriviaMatchRewards(input = {}) {
  const { won = false, draw = false, isForfeitLeaver = false } = input;
  if (isForfeitLeaver) {
    return {
      baseCoins: 0,
      baseXp: 0,
      bonusCoins: 0,
      bonusXp: 0,
      coinsGained: 0,
      xpGained: 0,
      performanceBreakdown: [],
    };
  }
  const { baseCoins, baseXp } = computeTriviaBaseRewards({ won, draw });
  const perf = computeTriviaPerformanceBonuses(input);
  return {
    baseCoins,
    baseXp,
    bonusCoins: perf.bonusCoins,
    bonusXp: perf.bonusXp,
    coinsGained: baseCoins + perf.bonusCoins,
    xpGained: baseXp + perf.bonusXp,
    performanceBreakdown: perf.breakdown,
  };
}
