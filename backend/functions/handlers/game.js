const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { currentMonthKey } = require('../lib/dashboardBuilders.js');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Per-request caps (anti-cheat burst limits). */
const MAX_COINS_DELTA_ABS = 50_000;
const MAX_XP_DELTA = 25_000;
const MAX_WINS_DELTA = 50;
const MAX_LOSSES_DELTA = 50;
const MAX_CHALLENGES_DELTA = 100;

function clampDelta(n, maxAbs) {
  const x = Math.trunc(Number(n) || 0);
  if (maxAbs == null) return x;
  if (x > maxAbs) return maxAbs;
  if (x < -maxAbs) return -maxAbs;
  return x;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runUpdateGameStats(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};

  let coinsDelta = clampDelta(data.coinsDelta, MAX_COINS_DELTA_ABS);
  if (coinsDelta > 0) {
    logger.warn('updateGameStats positive_coinsDelta_rejected', { uid, requestedCoinsDelta: coinsDelta });
    throw new HttpsError('invalid-argument', 'Positive coin rewards must be server-derived.');
  }
  const xpDelta = Math.max(0, Math.min(MAX_XP_DELTA, Math.trunc(Number(data.xpDelta) || 0)));
  const winsDelta = Math.max(0, Math.min(MAX_WINS_DELTA, Math.trunc(Number(data.winsDelta) || 0)));
  const lossesDelta = Math.max(0, Math.min(MAX_LOSSES_DELTA, Math.trunc(Number(data.lossesDelta) || 0)));
  let challengesDelta = Math.max(0, Math.min(MAX_CHALLENGES_DELTA, Math.trunc(Number(data.challengesDelta) || 0)));
  const mathRush = data.mathRush && typeof data.mathRush === 'object' ? data.mathRush : null;
  const mrActive =
    mathRush &&
    (Math.trunc(Number(mathRush.matches)) ||
      Math.trunc(Number(mathRush.wins)) ||
      Math.trunc(Number(mathRush.failures)) ||
      Math.trunc(Number(mathRush.successes)));

  if (
    !coinsDelta &&
    !xpDelta &&
    !winsDelta &&
    !lossesDelta &&
    !challengesDelta &&
    !mrActive
  ) {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', 'User profile not found.');
    }
    const u = snap.data();
    return { coins: Number(u.coins) || 0, xp: Number(u.xp) || 0 };
  }

  const monthKey =
    typeof data.monthKey === 'string' && /^\d{4}-\d{2}$/.test(data.monthKey)
      ? data.monthKey
      : currentMonthKey();

  const touchMonthly = winsDelta > 0 || lossesDelta > 0 || challengesDelta > 0;
  if (touchMonthly && challengesDelta === 0) {
    challengesDelta = Math.max(1, Math.min(MAX_CHALLENGES_DELTA, winsDelta + lossesDelta));
  }

  try {
    logger.info('updateGameStats start', {
      uid,
      coinsDelta,
      xpDelta,
      winsDelta,
      lossesDelta,
      challengesDelta,
      monthKey,
      hasMathRush: Boolean(mathRush),
    });
    const result = await db.runTransaction(async (tx) => {
      const ref = db.collection('users').doc(uid);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('failed-precondition', 'User profile not found.');
      }
      const u = snap.data();
      const coins = Number(u.coins) || 0;
      if (coins + coinsDelta < 0) {
        throw new HttpsError('failed-precondition', 'Insufficient coins.');
      }

      /** @type {Record<string, unknown>} */
      const updatePayload = {
        coins: FieldValue.increment(coinsDelta),
        xp: FieldValue.increment(xpDelta),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (winsDelta) {
        updatePayload['stats.wins'] = FieldValue.increment(winsDelta);
      }
      if (lossesDelta) {
        updatePayload['stats.losses'] = FieldValue.increment(lossesDelta);
      }
      if (challengesDelta) {
        updatePayload['stats.totalMatches'] = FieldValue.increment(challengesDelta);
      }

      if (touchMonthly && (winsDelta || challengesDelta)) {
        updatePayload[`monthlyGameStats.${monthKey}.wins`] = FieldValue.increment(winsDelta);
        updatePayload[`monthlyGameStats.${monthKey}.challenges`] = FieldValue.increment(challengesDelta);
      }

      if (mathRush) {
        const mm = Math.min(10, Math.max(0, Math.trunc(Number(mathRush.matches)) || 0));
        const mw = Math.min(10, Math.max(0, Math.trunc(Number(mathRush.wins)) || 0));
        const mf = Math.min(50, Math.max(0, Math.trunc(Number(mathRush.failures)) || 0));
        const ms = Math.min(50, Math.max(0, Math.trunc(Number(mathRush.successes)) || 0));
        if (mm) updatePayload['stats.mathRushMatches'] = FieldValue.increment(mm);
        if (mw) updatePayload['stats.mathRushWins'] = FieldValue.increment(mw);
        if (mf) updatePayload['stats.mathRushFailures'] = FieldValue.increment(mf);
        if (ms) updatePayload['stats.mathRushSuccesses'] = FieldValue.increment(ms);
      }

      const shouldRank = xpDelta > 0 || winsDelta > 0 || lossesDelta > 0 || challengesDelta > 0;
      if (shouldRank) {
        const level = Number(u.level) || 1;
        const xp = Number(u.xp) || 0;
        const sw = Number(u.stats?.wins) || 0;
        const rankA = Math.max(0, Math.round(level * 70 + (xp + xpDelta) * 0.07));
        const rankB = Math.max(0, Math.round((sw + winsDelta) * 6));
        const label = MONTH_NAMES[new Date().getMonth()];
        let rh = Array.isArray(u.rankingHistory) ? [...u.rankingHistory] : [];
        rh.push({ month: label, rankA, rankB });
        rh = rh.slice(-12);
        updatePayload.rankingHistory = rh;
      }

      tx.update(ref, updatePayload);

      const newCoins = coins + coinsDelta;
      const newXp = (Number(u.xp) || 0) + xpDelta;
      return { coins: newCoins, xp: newXp };
    });

    logger.info('updateGameStats success', { uid, coins: result.coins, xp: result.xp });
    return result;
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error('updateGameStats failed', { uid, err: e?.message });
    throw new HttpsError('internal', e?.message || 'Update failed.');
  }
}

module.exports = { runUpdateGameStats };
