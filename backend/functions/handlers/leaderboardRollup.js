const logger = require('firebase-functions/logger');
const { FieldValue } = require('firebase-admin/firestore');

const MAX_ENTRIES = 50;

/**
 * Denormalized snapshot for cheap reads / analytics. Callable `getLeaderboard` still works for live data.
 * Writes `leaderboardRollup/current` — adjust Firestore rules if clients should read it.
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function runLeaderboardRollup(db) {
  const snap = await db.collection('users').orderBy('xp', 'desc').limit(MAX_ENTRIES).get();

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

  await db.collection('leaderboardRollup').doc('current').set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      entryCount: entries.length,
      entries,
    },
    { merge: true }
  );

  logger.info('leaderboardRollup refreshed', { count: entries.length });
}

module.exports = { runLeaderboardRollup };
