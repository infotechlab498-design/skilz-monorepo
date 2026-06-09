/** @see also `frontend/src/lib/playerDashboardPayload.js` (keep payloads in sync). */
const { serializeValue } = require('./serialize.js');

const RANKING_FALLBACK_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function last9MonthsBarSeries(monthlyGameStats) {
  const mgs = monthlyGameStats && typeof monthlyGameStats === 'object' ? monthlyGameStats : {};
  const out = [];
  const now = new Date();
  for (let i = 8; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const key = `${y}-${mm}`;
    const cell = mgs[key] || {};
    out.push({
      month: mm,
      wins: Number(cell.wins) || 0,
      challenges: Number(cell.challenges) || 0,
    });
  }
  return out;
}

function buildDashboardStatsPayload(user, statsAgg) {
  const walletCoins = Number(user.coins ?? 0);
  const xp = Number(user.xp ?? 0);
  const purchasedCoins = Number(statsAgg.totalCoins ?? 0);
  const referralCoins = Number(user.referralCoins ?? 0);
  const rewardCoins = Math.max(0, Number(user.rewardCoins ?? (Number(user.earnedCoins ?? 0) - referralCoins)));
  const totalSpent = Number(statsAgg.totalSpent ?? 0);
  const totalBalance = Math.max(0, walletCoins);

  return {
    totalBalance,
    walletCoins,
    purchasedCoins,
    rewardCoins,
    referralCoins,
    xp,
    changes: {
      totalBalance: Number(user.balanceDeltaPct ?? 0),
      walletCoins: Number(user.coinsDeltaPct ?? 0),
      purchasedCoins: Number(user.purchasedCoinsDeltaPct ?? 0),
      rewardCoins: Number(user.rewardCoinsDeltaPct ?? 0),
      referralCoins: Number(user.referralDeltaPct ?? 0),
      xp: Number(user.xpDeltaPct ?? 0),
      totalSpent: Number(user.totalSpentDeltaPct ?? 0),
    },
    totalSpent,
  };
}

function buildGameStatsPayload(user) {
  const userStats = user.stats || {};
  const barSeries = last9MonthsBarSeries(user.monthlyGameStats);
  return {
    barSeries,
    totalUsersStat: Number(userStats.wins ?? 0),
    totalChallengesStat: Number(userStats.totalMatches ?? 0),
    weeklyGrowthPct: Number(user.weeklyGrowthPct ?? 0),
  };
}

function buildRankingPayload(user) {
  const candidate = Array.isArray(user.rankingHistory) ? user.rankingHistory.map(serializeValue) : [];
  if (candidate.length >= 9) {
    return candidate.slice(-9);
  }
  const baseA = Number(user.level || 0) * 70 + Number(user.xp || 0) * 0.07;
  const baseB = Number(user.stats?.wins || 0) * 6;
  return RANKING_FALLBACK_LABELS.map((m, i) => ({
    month: m,
    rankA: Math.max(0, Math.round(baseA * (0.65 + i * 0.06))),
    rankB: Math.max(0, Math.round(baseB * (0.72 + i * 0.05))),
  }));
}

module.exports = {
  currentMonthKey,
  last9MonthsBarSeries,
  buildDashboardStatsPayload,
  buildGameStatsPayload,
  buildRankingPayload,
};
