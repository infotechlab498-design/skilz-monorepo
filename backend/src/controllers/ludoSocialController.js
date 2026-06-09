import { getAdminFirestore, getAdminDatabase } from '../services/firebaseAdmin.js';
import { isFriendAvailableForLudoInvite } from '../services/presence/ludoOnlinePlayersFilter.js';

const MAX = 50;

function maxPresenceAgeMs() {
  const n = Number(process.env.PRESENCE_MAX_AGE_MS);
  if (Number.isFinite(n) && n >= 10000 && n <= 300000) return n;
  return 45000;
}

/**
 * Friends who pass online + freshness + not in queue/room/in-game (for Ludo invite slider).
 * @param {string} myUid
 * @param {import('express').Request['query']} query
 */
export async function buildLudoOnlineFriendsList(myUid, query = {}) {
  const includeQueued =
    String(query.includeQueued || '') === '1' ||
    String(query.includeQueued || '').toLowerCase() === 'true';
  const db = getAdminFirestore();
  if (!db) {
    const err = new Error('Firestore Admin not configured');
    err.statusCode = 503;
    throw err;
  }
  const rtdb = getAdminDatabase();
  const friendsSnap = await db.collection('users').doc(myUid).collection('friends').limit(MAX).get();
  const now = Date.now();
  const maxAgeMs = maxPresenceAgeMs();
  const out = [];

  for (const d of friendsSnap.docs) {
    const friendUid = d.id;
    const data = d.data() || {};
    let presence = {};
    let userState = {};
    if (rtdb) {
      try {
        const [pSnap, uSnap] = await Promise.all([
          rtdb.ref(`presence/${friendUid}`).get(),
          rtdb.ref(`userState/${friendUid}`).get(),
        ]);
        presence = pSnap.val() || {};
        userState = uSnap.val() || {};
      } catch {
        /* ignore per-friend RTDB errors */
      }
    }

    if (
      !isFriendAvailableForLudoInvite(presence, userState, now, {
        maxAgeMs,
        excludeQueued: !includeQueued,
      })
    ) {
      continue;
    }

    const displayName = data.displayName || friendUid;
    const photoURL = data.photoURL || '';
    const inGame = Boolean(
      userState.inPlayingMatch || String(presence.status || '') === 'in-game'
    );
    const inQueue = Boolean(userState.inQueue);

    out.push({
      userId: friendUid,
      username: displayName,
      avatar: photoURL,
      status: 'online',
      inGame,
      inQueue,
      uid: friendUid,
      displayName,
      photoURL,
      presence: {
        online: !!presence.online,
        status: String(presence.status || ''),
        game: presence.game ?? null,
      },
      userState: {
        inQueue,
        ludoRoomId: userState.ludoRoomId ?? null,
        inPlayingMatch: Boolean(userState.inPlayingMatch),
        socketCount: Number(userState.socketCount) || 0,
      },
    });
  }

  return out.slice(0, MAX);
}

/**
 * Friends who look available for Ludo invites: online presence and not `in-game`.
 * GET /api/ludo/available-players — requires `authenticateToken` (Firebase ID token).
 */
export async function getLudoAvailablePlayers(req, res) {
  try {
    const myUid = String(req.userId || '').trim();
    if (!myUid) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const players = await buildLudoOnlineFriendsList(myUid, req.query);
    return res.json({ success: true, players });
  } catch (e) {
    const code = e?.statusCode;
    if (code === 503) {
      return res.status(503).json({ success: false, error: e?.message || 'Admin not configured' });
    }
    console.error('[ludo] available-players:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Server error' });
  }
}

/**
 * Same data as `/ludo/available-players` (friends-first). Query: `includeQueued=1` optional.
 * GET /api/online-players
 */
export async function getOnlinePlayers(req, res) {
  try {
    const myUid = String(req.userId || '').trim();
    if (!myUid) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const players = await buildLudoOnlineFriendsList(myUid, req.query);
    return res.json({
      success: true,
      players: players.map((p) => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        status: p.status,
        inGame: p.inGame,
        inQueue: p.inQueue,
      })),
    });
  } catch (e) {
    const code = e?.statusCode;
    if (code === 503) {
      return res.status(503).json({ success: false, error: e?.message || 'Admin not configured' });
    }
    console.error('[api] online-players:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Server error' });
  }
}
