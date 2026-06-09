/**
 * Format hybrid base + performance bonus rewards for Trivia result screens.
 * Values come from server `progression` on `trivia_game_ended` — not client math.
 */

/**
 * @param {{ baseCoins?: number, bonusCoins?: number, coinsGained?: number, isBot?: boolean }} row
 */
export function formatTriviaMatchCoins(row) {
  if (!row || row.isBot) return '—';
  const total = Number(row.coinsGained ?? 0);
  const base = Number(row.baseCoins ?? total);
  const bonus = Number(row.bonusCoins ?? 0);
  if (bonus > 0) return `${formatPts(total)} coins (+${formatPts(bonus)} bonus)`;
  return `${formatPts(total)} coins`;
}

/**
 * @param {{ baseXp?: number, bonusXp?: number, xpGained?: number, isBot?: boolean }} row
 */
export function formatTriviaMatchXp(row) {
  if (!row || row.isBot) return '—';
  const total = Number(row.xpGained ?? 0);
  const bonus = Number(row.bonusXp ?? 0);
  if (bonus > 0) return `+${total} XP (+${bonus} bonus)`;
  return total > 0 ? `+${total} XP` : '—';
}

function formatPts(n) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(n) || 0);
}

/**
 * @param {object} prog — progression entry from trivia_game_ended
 */
export function mapTriviaProgressionFields(prog = {}) {
  const xpGained = Number(prog?.xpGained || 0);
  const coinsGained = Number(prog?.coinsGained || 0);
  const baseXp = prog?.baseXp != null ? Number(prog.baseXp) : xpGained;
  const baseCoins = prog?.baseCoins != null ? Number(prog.baseCoins) : coinsGained;
  const bonusXp = Number(prog?.bonusXp || 0);
  const bonusCoins = Number(prog?.bonusCoins || 0);
  const performanceBreakdown = Array.isArray(prog?.performanceBreakdown)
    ? prog.performanceBreakdown
    : [];
  return {
    xpGained,
    coinsGained,
    baseXp,
    baseCoins,
    bonusXp,
    bonusCoins,
    performanceBreakdown,
  };
}

/**
 * @param {Array<object>} progression
 * @param {string} uid
 */
export function findTriviaProgression(progression, uid) {
  const list = Array.isArray(progression) ? progression : [];
  const entry = list.find((p) => String(p?.uid || '') === String(uid || ''));
  return mapTriviaProgressionFields(entry);
}

/**
 * @param {number | null | undefined} avgAnswerMs
 */
export function formatAvgSpeed(avgAnswerMs) {
  if (avgAnswerMs == null || Number.isNaN(Number(avgAnswerMs))) return '—';
  const sec = Number(avgAnswerMs) / 1000;
  return `${sec.toFixed(1)}s`;
}

/**
 * @param {number | null | undefined} maxStreak
 */
export function formatLongestStreak(maxStreak) {
  const n = Number(maxStreak) || 0;
  return n > 0 ? String(n) : '—';
}

/**
 * Legacy turn-quota estimate — only when `player.performance` is missing (old payloads).
 * @param {number} totalQuestions
 * @param {number} playerIndex
 */
function estimatedAttemptsForPlayer(totalQuestions, playerIndex) {
  const n = Math.max(0, Number(totalQuestions) || 0);
  if (playerIndex === 0) return Math.max(1, Math.ceil(n / 2));
  return Math.max(1, Math.floor(n / 2));
}

/**
 * Resolve stat rows from server `player.performance` (authoritative).
 * Falls back to legacy formula only when performance payload is absent.
 *
 * @param {object | null | undefined} player — entry from `trivia_game_ended.players`
 * @param {number} [totalQuestions] — fallback only
 * @param {number} [playerIndex] — fallback only
 * @returns {{
 *   attempts: number,
 *   correct: number,
 *   wrong: number,
 *   accuracyPct: number,
 *   avgAnswerMs: number | null,
 *   maxStreak: number,
 *   timeouts: number,
 *   fromServer: boolean,
 * }}
 */
export function resolvePlayerPerformanceDisplay(player, totalQuestions = 0, playerIndex = 0) {
  const perf = player?.performance;
  const hasServerPerf = perf != null && typeof perf.attempts === 'number';

  if (hasServerPerf) {
    const attempts = Math.max(0, Number(perf.attempts) || 0);
    const correct = Math.max(
      0,
      Number(perf.correct ?? player?.correctCount) || 0
    );
    const wrong = Math.max(0, Number(perf.wrong) || 0);
    const accuracyPct =
      perf.accuracyPct != null && !Number.isNaN(Number(perf.accuracyPct))
        ? Number(perf.accuracyPct)
        : attempts > 0
          ? Math.round((1000 * correct) / attempts) / 10
          : 0;

    return {
      attempts,
      correct,
      wrong,
      accuracyPct,
      avgAnswerMs: perf.avgAnswerMs ?? null,
      maxStreak: Number(perf.maxStreak) || 0,
      timeouts: Number(perf.timeouts) || 0,
      fromServer: true,
    };
  }

  const attempts = estimatedAttemptsForPlayer(totalQuestions, playerIndex);
  const correct = Math.max(0, Number(player?.correctCount) || 0);
  const wrong = Math.max(0, attempts - correct);
  const accuracyPct = attempts > 0 ? Math.round((1000 * correct) / attempts) / 10 : 0;

  return {
    attempts,
    correct,
    wrong,
    accuracyPct,
    avgAnswerMs: null,
    maxStreak: 0,
    timeouts: 0,
    fromServer: false,
  };
}

/**
 * @param {number} accuracyPct
 */
export function formatAccuracyPct(accuracyPct) {
  const n = Number(accuracyPct);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}
