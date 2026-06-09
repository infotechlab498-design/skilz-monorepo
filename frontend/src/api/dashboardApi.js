import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import {
  buildDashboardStatsPayload,
  buildGameStatsPayload,
  buildRankingPayload,
} from '../lib/playerDashboardPayload.js';

const EMPTY_STATS = {
  totalBalance: 0,
  walletCoins: 0,
  purchasedCoins: 0,
  rewardCoins: 0,
  referralCoins: 0,
  xp: 0,
  totalSpent: 0,
  changes: {
    totalBalance: 0,
    walletCoins: 0,
    purchasedCoins: 0,
    rewardCoins: 0,
    referralCoins: 0,
    xp: 0,
    totalSpent: 0,
  },
};

const EMPTY_GAME = {
  barSeries: [],
  totalUsersStat: 0,
  totalChallengesStat: 0,
  weeklyGrowthPct: 0,
};

/**
 * Player dashboard: reads `users/{uid}` + `stats/{uid}` via Firestore client (owner rules).
 * Avoids `getPlayerDashboard` callable + Cloud Run preflight (403 without public invoker
 * surfaces as a browser CORS error).
 *
 * @param {string} uid - Must match signed-in user (Firestore rules).
 */
export async function fetchPlayerDashboard(uid) {
  const u = String(uid || '').trim();
  if (!u) {
    return {
      stats: { ...EMPTY_STATS },
      gameStats: {
        ...EMPTY_GAME,
        barSeries: ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => ({
          month: m,
          wins: 0,
          challenges: 0,
        })),
      },
      ranking: [],
    };
  }

  const [userSnap, statsSnap] = await Promise.all([
    getDoc(doc(db, 'users', u)),
    getDoc(doc(db, 'stats', u)),
  ]);
  const user = userSnap.exists() ? userSnap.data() : {};
  const statsAgg = statsSnap.exists() ? statsSnap.data() : {};
  return {
    stats: buildDashboardStatsPayload(user, statsAgg),
    gameStats: buildGameStatsPayload(user),
    ranking: buildRankingPayload(user),
  };
}

/** @deprecated Prefer fetchPlayerDashboard — kept for callers that only need summary stats. */
export async function getDashboardStats(uid) {
  const bundle = await fetchPlayerDashboard(uid);
  return bundle.stats;
}

/** @deprecated Prefer fetchPlayerDashboard */
export async function getGameStats(uid) {
  const bundle = await fetchPlayerDashboard(uid);
  return bundle.gameStats;
}

/** @deprecated Prefer fetchPlayerDashboard */
export async function getRankingData(uid) {
  const bundle = await fetchPlayerDashboard(uid);
  return bundle.ranking;
}
