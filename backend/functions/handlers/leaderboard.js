const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Public leaderboard entries (no email). Uses Admin read across users ordered by xp.
 * Requires Firestore single-field index on `users.xp` (usually auto-created).
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runGetLeaderboard(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.trunc(Number(request.data?.limit) || DEFAULT_LIMIT))
  );

  try {
    const snap = await db.collection('users').orderBy('xp', 'desc').limit(limit).get();

    const entries = snap.docs.map((d, index) => {
      const x = d.data() || {};
      const displayName =
        String(x.fullName || x.displayName || x.name || x.username || 'Player').trim() || 'Player';
      return {
        rank: index + 1,
        uid: d.id,
        displayName,
        photoURL: String(x.photoURL || ''),
        xp: Number(x.xp) || 0,
        level: Number(x.level) || 1,
        wins: Number(x.stats?.wins) || 0,
      };
    });

    return { entries };
  } catch (e) {
    logger.error('getLeaderboard failed', { err: e?.message });
    if (e?.code === 9 || String(e?.message || '').includes('index')) {
      throw new HttpsError(
        'failed-precondition',
        'Firestore index required for users.xp ordering. Deploy the suggested index from the Firebase console error link.'
      );
    }
    throw new HttpsError('internal', e?.message || 'Leaderboard load failed.');
  }
}

module.exports = { runGetLeaderboard };
