const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { plainData } = require('../lib/serialize.js');
const {
  buildDashboardStatsPayload,
  buildGameStatsPayload,
  buildRankingPayload,
} = require('../lib/dashboardBuilders.js');

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runGetPlayerDashboard(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;

  try {
    const [userSnap, statsSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('stats').doc(uid).get(),
    ]);

    const user = userSnap.exists ? userSnap.data() : {};
    const statsAgg = statsSnap.exists ? statsSnap.data() : {};

    return {
      stats: buildDashboardStatsPayload(user, statsAgg),
      gameStats: buildGameStatsPayload(user),
      ranking: buildRankingPayload(user),
    };
  } catch (e) {
    logger.error('getPlayerDashboard failed', { uid, err: e?.message });
    throw new HttpsError('internal', e?.message || 'Dashboard load failed.');
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runGetPlayerBilling(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;

  try {
    const [txSnap, statsSnap] = await Promise.all([
      db.collection('transactions').where('userId', '==', uid).limit(100).get(),
      db.collection('stats').doc(uid).get(),
    ]);

    const transactions = txSnap.docs.map((d) => ({
      id: d.id,
      ...plainData(d.data()),
    }));
    transactions.sort((a, b) => (b.createdAt || b.date || 0) - (a.createdAt || a.date || 0));

    const statsData = statsSnap.exists ? plainData(statsSnap.data()) : {};
    const stats = {
      userId: uid,
      totalSpent: Number(statsData.totalSpent) || 0,
      totalCoins: Number(statsData.totalCoins) || 0,
      updatedAt: statsData.updatedAt,
    };

    return { transactions, stats };
  } catch (e) {
    logger.error('getPlayerBilling failed', { uid, err: e?.message });
    throw new HttpsError('internal', e?.message || 'Billing load failed.');
  }
}

module.exports = { runGetPlayerDashboard, runGetPlayerBilling };
