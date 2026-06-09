const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getRtdb } = require('../lib/admin.js');

const SEND_WINDOW_MS = 60_000;
const SEND_MAX = 15;
const rateState = new Map();

function checkSendRate(uid) {
  const now = Date.now();
  const arr = (rateState.get(uid) || []).filter((t) => now - t < SEND_WINDOW_MS);
  if (arr.length >= SEND_MAX) {
    throw new HttpsError('resource-exhausted', 'Too many challenges. Try again in a minute.');
  }
  arr.push(now);
  rateState.set(uid, arr);
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} a
 * @param {string} b
 */
async function areFriends(db, a, b) {
  if (!a || !b || a === b) return false;
  const sub = await db.collection('users').doc(a).collection('friends').doc(b).get();
  if (sub.exists) return true;
  const fr = await db.collection('friends').doc(a).get();
  const list = fr.data()?.friendsList;
  return Array.isArray(list) && list.includes(b);
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} uid
 */
async function loadFriendIds(db, uid) {
  const subSnap = await db.collection('users').doc(uid).collection('friends').get();
  const fromSub = subSnap.docs.map((d) => String(d.data()?.friendUid || d.id));
  const fr = await db.collection('friends').doc(uid).get();
  const list = fr.exists ? fr.data()?.friendsList : [];
  const fromDoc = Array.isArray(list) ? list.map(String) : [];
  return [...new Set([...fromSub, ...fromDoc].filter(Boolean))];
}

async function displayNameFor(db, uid) {
  try {
    const pub = await db.collection('publicProfiles').doc(uid).get();
    const n = pub.data()?.displayName;
    if (n && String(n).trim()) return String(n).trim();
  } catch (e) {
    logger.warn('publicProfiles read failed', e);
  }
  return uid.length > 8 ? `${uid.slice(0, 6)}…` : uid;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runSendChallenge(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const toUserId = String(data.toUserId || '').trim();
  const gameId = String(data.gameId || '').trim();
  const gameName = String(data.gameName || '').trim();
  const triviaCategory = String(data.triviaCategory || '').trim();
  const triviaDifficulty = String(data.triviaDifficulty || '').trim().toLowerCase();
  if (!toUserId || !gameId) {
    throw new HttpsError('invalid-argument', 'toUserId and gameId are required.');
  }
  if (toUserId === uid) {
    throw new HttpsError('invalid-argument', 'Cannot challenge yourself.');
  }

  const friendsOk = await areFriends(db, uid, toUserId);
  if (!friendsOk) {
    throw new HttpsError('failed-precondition', 'You can only challenge friends.');
  }

  checkSendRate(uid);

  const senderName = await displayNameFor(db, uid);
  const pendingQ = db
    .collection('invites')
    .where('fromUserId', '==', uid)
    .where('toUserId', '==', toUserId)
    .where('gameId', '==', gameId)
    .where('status', '==', 'pending')
    .limit(1);

  const inviteRef = db.collection('invites').doc();
  const notifRef = db.collection('notifications').doc();

  await db.runTransaction(async (t) => {
    const pend = await t.get(pendingQ);
    if (!pend.empty) {
      throw new HttpsError('already-exists', 'Invite already sent and pending.');
    }
    const outboundQ = db
      .collection('invites')
      .where('fromUserId', '==', uid)
      .where('status', '==', 'pending')
      .limit(12);
    const outbound = await t.get(outboundQ);
    if (outbound.size >= 10) {
      throw new HttpsError('resource-exhausted', 'Too many open invites. Wait for responses or cancel old ones.');
    }
    t.set(inviteRef, {
      fromUserId: uid,
      toUserId,
      gameId,
      gameName,
      triviaCategory,
      triviaDifficulty,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });
    t.set(notifRef, {
      userId: toUserId,
      type: 'invite',
      inviteId: inviteRef.id,
      message: `${senderName} invited you to ${gameName || gameId || 'a game'}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { inviteId: inviteRef.id };
}

const ACTIVE_MATCH_STATUSES = ['forming', 'ready', 'in_progress'];

/**
 * Recipient declines a pending invite (no match doc).
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runRejectInviteFlow(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const inviteId = String(request.data?.inviteId || '').trim();
  if (!inviteId) {
    throw new HttpsError('invalid-argument', 'inviteId is required.');
  }

  const inviteRef = db.collection('invites').doc(inviteId);
  const snap = await inviteRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }
  const inv = snap.data() || {};
  if (inv.toUserId !== uid) {
    throw new HttpsError('permission-denied', 'Only the recipient can respond to this invite.');
  }
  if (inv.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This invite is no longer pending.');
  }

  await inviteRef.update({
    status: 'rejected',
    updatedAt: FieldValue.serverTimestamp(),
  });

  const responderName = await displayNameFor(db, uid);
  await db.collection('notifications').add({
    userId: inv.fromUserId,
    type: 'invite_response',
    inviteId,
    message: `${responderName} declined your challenge.`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, status: 'rejected' };
}

/**
 * Accept invite: create matches/{matchId}, notify both players (match_ready), idempotent if already accepted.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runAcceptChallenge(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const inviteId = String(request.data?.inviteId || '').trim();
  if (!inviteId) {
    throw new HttpsError('invalid-argument', 'inviteId is required.');
  }

  const inviteRef = db.collection('invites').doc(inviteId);
  const pre = await inviteRef.get();
  if (!pre.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }
  const preData = pre.data() || {};
  if (preData.toUserId !== uid) {
    throw new HttpsError('permission-denied', 'Only the recipient can accept this invite.');
  }
  if (preData.status === 'accepted' && preData.matchId) {
    const gid0 = String(preData.gameId || '').toLowerCase();
    let lobbyPath0 = '';
    if (gid0 === 'trivia') lobbyPath0 = `/triviaLobby/trivia?matchId=${preData.matchId}`;
    else if (gid0 === 'neurochain' || gid0 === 'neuro_chain') {
      lobbyPath0 = `/neurochainLobby?matchId=${encodeURIComponent(preData.matchId)}`;
    }
    return {
      ok: true,
      status: 'accepted',
      matchId: preData.matchId,
      gameId: preData.gameId || '',
      lobbyPath: lobbyPath0,
    };
  }
  if (preData.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This invite is no longer pending.');
  }

  const responderName = await displayNameFor(db, uid);

  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(inviteRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invite not found.');
    }
    const inv = snap.data() || {};
    if (inv.toUserId !== uid) {
      throw new HttpsError('permission-denied', 'Only the recipient can accept this invite.');
    }
    if (inv.status === 'accepted' && inv.matchId) {
      const gid1 = String(inv.gameId || '').toLowerCase();
      let lobbyPath1 = '';
      if (gid1 === 'trivia') lobbyPath1 = `/triviaLobby/trivia?matchId=${inv.matchId}`;
      else if (gid1 === 'neurochain' || gid1 === 'neuro_chain') {
        lobbyPath1 = `/neurochainLobby?matchId=${encodeURIComponent(inv.matchId)}`;
      }
      return {
        ok: true,
        status: 'accepted',
        matchId: inv.matchId,
        gameId: inv.gameId || '',
        lobbyPath: lobbyPath1,
      };
    }
    if (inv.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This invite is no longer pending.');
    }

    const lockFrom = db
      .collection('matches')
      .where('playerIds', 'array-contains', inv.fromUserId)
      .where('status', 'in', ACTIVE_MATCH_STATUSES)
      .limit(5);
    const lockTo = db
      .collection('matches')
      .where('playerIds', 'array-contains', inv.toUserId)
      .where('status', 'in', ACTIVE_MATCH_STATUSES)
      .limit(5);

    const [fromBusy, toBusy] = await Promise.all([
      transaction.get(lockFrom),
      transaction.get(lockTo),
    ]);
    if (!fromBusy.empty || !toBusy.empty) {
      throw new HttpsError(
        'failed-precondition',
        'A match is already in progress for one of the players.'
      );
    }

    const matchRef = db.collection('matches').doc();
    const matchId = matchRef.id;
    const sortedIds = [String(inv.fromUserId), String(inv.toUserId)].sort();

    const notifFrom = db.collection('notifications').doc();
    const notifTo = db.collection('notifications').doc();

    transaction.set(matchRef, {
      playerIds: sortedIds,
      playerA: sortedIds[0],
      playerB: sortedIds[1],
      gameId: inv.gameId || '',
      gameName: inv.gameName || '',
      status: 'forming',
      inviteId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(inviteRef, {
      status: 'accepted',
      matchId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const gameLabel = inv.gameName || inv.gameId || 'game';
    transaction.set(notifFrom, {
      userId: inv.fromUserId,
      type: 'match_ready',
      matchId,
      gameId: inv.gameId || '',
      gameName: inv.gameName || '',
      inviteId,
      message: `${responderName} accepted your ${gameLabel} challenge. Tap Join to open the lobby.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.set(notifTo, {
      userId: inv.toUserId,
      type: 'match_ready',
      matchId,
      gameId: inv.gameId || '',
      gameName: inv.gameName || '',
      inviteId,
      message: `Match ready: ${gameLabel}. Tap Join to open the lobby.`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const gid2 = String(inv.gameId || '').toLowerCase();
    let lobbyPath2 = '';
    if (gid2 === 'trivia') lobbyPath2 = `/triviaLobby/trivia?matchId=${matchId}`;
    else if (gid2 === 'neurochain' || gid2 === 'neuro_chain') {
      lobbyPath2 = `/neurochainLobby?matchId=${encodeURIComponent(matchId)}`;
    }
    return {
      ok: true,
      status: 'accepted',
      matchId,
      gameId: inv.gameId || '',
      lobbyPath: lobbyPath2,
    };
  });

  return result;
}

async function runRejectChallenge(db, request) {
  return runRejectInviteFlow(db, request);
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runMarkNotificationRead(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const notificationId = String(request.data?.notificationId || '').trim();
  if (!notificationId) {
    throw new HttpsError('invalid-argument', 'notificationId is required.');
  }

  const ref = db.collection('notifications').doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: true };
  }
  if (snap.data()?.userId !== uid) {
    throw new HttpsError('permission-denied', 'Not your notification.');
  }
  await ref.update({ read: true });
  return { ok: true };
}

/**
 * Friends who appear online, not in-game, with no pending invite in either direction vs caller.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runListAvailablePlayers(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const max = Math.min(50, Math.max(1, Math.trunc(Number(data.limit) || 20)));

  let rtdb;
  try {
    rtdb = getRtdb();
  } catch (e) {
    logger.warn('RTDB unavailable', e);
    throw new HttpsError('failed-precondition', 'Presence service unavailable.');
  }

  const friendIds = await loadFriendIds(db, uid);
  const out = [];

  for (const fid of friendIds) {
    if (out.length >= max) break;
    try {
      const pSnap = await rtdb.ref(`presence/${fid}`).once('value');
      const p = pSnap.val() || {};
      if (!p.online) continue;
      if (p.status === 'in-game') continue;

      const q1 = await db
        .collection('invites')
        .where('fromUserId', '==', uid)
        .where('toUserId', '==', fid)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!q1.empty) continue;

      const q2 = await db
        .collection('invites')
        .where('fromUserId', '==', fid)
        .where('toUserId', '==', uid)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
      if (!q2.empty) continue;

      let displayName = '';
      let photoURL = '';
      let email = '';
      try {
        const pub = await db.collection('publicProfiles').doc(fid).get();
        if (pub.exists) {
          const d = pub.data() || {};
          displayName = String(d.displayName || d.name || '');
          photoURL = String(d.photoURL || '');
        }
      } catch {
        // ignore
      }

      out.push({
        uid: fid,
        displayName: displayName || 'Unknown Player',
        photoURL,
        email,
        presence: {
          online: !!p.online,
          status: p.status || (p.online ? 'online' : 'offline'),
          game: p.game || null,
          lastSeen: p.lastSeen || null,
        },
      });
    } catch (e) {
      logger.warn('listAvailablePlayers friend skip', fid, e);
    }
  }

  return { players: out };
}

/**
 * Mark stale pending invites as expired (scheduled job).
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function runExpirePendingInvites(db) {
  const cutoff = Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000);
  const snap = await db
    .collection('invites')
    .where('status', '==', 'pending')
    .where('createdAt', '<', cutoff)
    .limit(200)
    .get();

  if (snap.empty) return { expired: 0 };

  const batch = db.batch();
  let n = 0;
  snap.docs.forEach((d) => {
    batch.update(d.ref, { status: 'expired', updatedAt: FieldValue.serverTimestamp() });
    n += 1;
  });
  await batch.commit();
  logger.info('expirePendingInvites', { expired: n });
  return { expired: n };
}

module.exports = {
  runSendChallenge,
  runAcceptChallenge,
  runRejectChallenge,
  runMarkNotificationRead,
  runListAvailablePlayers,
  runExpirePendingInvites,
};
