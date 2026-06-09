import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { onValue, ref as rtdbRef } from 'firebase/database';
import { db, rtdb } from '../firebase/config.js';
import { toSerializableFirebase } from '../services/userService.js';
import {
  callAcceptChallenge,
  callListAvailablePlayers,
  callMarkNotificationRead,
  callRejectChallenge,
  callSendChallenge,
} from './cloudFunctionsApi.js';

export const DEMO_FRIENDS = [
  {
    uid: 'demo_michael',
    displayName: 'Michael John',
    email: 'michael@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=15',
    currentGame: { gameId: 'trivia', gameName: 'Game Name' },
    presence: { online: true, status: 'in-game', game: 'Game Name', lastSeen: Date.now() - 120000 },
  },
  {
    uid: 'demo_alexa',
    displayName: 'Alexa Liras',
    email: 'alexa@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=44',
    currentGame: null,
    presence: { online: false, status: 'offline', game: null, lastSeen: Date.now() - 86400000 * 2 },
  },
  {
    uid: 'dem_alexa',
    displayName: 'Alexa Liras',
    email: 'alexa@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=44',
    currentGame: null,
    presence: { online: false, status: 'offline', game: null, lastSeen: Date.now() - 86400000 * 2 },
  },
  {
    uid: 'u_alexa',
    displayName: 'Alexa Liras',
    email: 'alexa@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=44',
    currentGame: null,
    presence: { online: false, status: 'offline', game: null, lastSeen: Date.now() - 86400000 * 2 },
  },
  {
    uid: 'demo_laure',
    displayName: 'Laure Perrier',
    email: 'lauree@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=47',
    currentGame: null,
    presence: { online: true, status: 'online', game: null, lastSeen: Date.now() - 3600000 },
  },
  {
    uid: 'demo_miriam',
    displayName: 'Miriam Eric',
    email: 'miriam@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=48',
    currentGame: null,
    presence: { online: true, status: 'online', game: null, lastSeen: Date.now() - 5400000 },
  },
  {
    uid: 'demo_richard',
    displayName: 'Richard Gran',
    email: 'richard@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=13',
    currentGame: null,
    presence: { online: true, status: 'online', game: null, lastSeen: Date.now() - 7200000 },
  },
  {
    uid: 'demo_john',
    displayName: 'John Levi',
    email: 'john@mail.com',
    photoURL: 'https://i.pravatar.cc/80?img=14',
    currentGame: null,
    presence: { online: false, status: 'offline', game: null, lastSeen: Date.now() - 86400000 * 7 },
  },
];

function unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

export function subscribeFriendIds(uid, onData) {
  const u = String(uid || '');
  if (!u) {
    onData([]);
    return () => {};
  }

  const unsubs = [];
  let subIds = [];
  let docIds = [];
  const emit = () => onData(unique([...subIds, ...docIds]));

  const subRef = collection(db, 'users', u, 'friends');
  unsubs.push(
    onSnapshot(
      subRef,
      (snap) => {
        subIds = snap.docs.map((d) => String(d.data()?.friendUid || d.id));
        emit();
      },
      () => {
        subIds = [];
        emit();
      }
    )
  );

  const docRef = doc(db, 'friends', u);
  unsubs.push(
    onSnapshot(
      docRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : {};
        docIds = Array.isArray(d.friendsList) ? d.friendsList.map(String) : [];
        emit();
      },
      () => {
        docIds = [];
        emit();
      }
    )
  );

  return () => unsubs.forEach((uFn) => uFn && uFn());
}

/**
 * Subscribe to `presence/{uid}` only for given friend UIDs (avoids full-tree RTDB reads).
 * @param {string[]} friendIds
 * @param {(map: Record<string, unknown>) => void} onData
 */
export function subscribePresenceForUserIds(friendIds, onData) {
  if (!rtdb || !friendIds?.length) {
    onData({});
    return () => {};
  }
  const ids = unique(friendIds.map(String)).filter(Boolean);
  const map = {};
  const unsubs = ids.map((id) => {
    const r = rtdbRef(rtdb, `presence/${id}`);
    return onValue(
      r,
      (snap) => {
        const v = snap.val();
        if (v == null) delete map[id];
        else map[id] = v;
        onData({ ...map });
      },
      () => {
        delete map[id];
        onData({ ...map });
      }
    );
  });
  return () => unsubs.forEach((u) => u && u());
}

export async function getProfilesByIds(ids) {
  const out = {};
  await Promise.all(
    (ids || []).map(async (id) => {
      const uid = String(id || '');
      if (!uid) return;
      try {
        const pub = await getDoc(doc(db, 'publicProfiles', uid));
        if (pub.exists()) {
          out[uid] = toSerializableFirebase(pub.data());
          return;
        }
      } catch {
        // ignore
      }
      out[uid] = null;
    })
  );
  return out;
}

export async function sendInvite({ fromUserId, toUserId, gameId, gameName }) {
  const from = String(fromUserId || '');
  const to = String(toUserId || '');
  if (!from || !to || from === to) throw new Error('Invalid invite target.');
  const { inviteId } = await callSendChallenge({
    toUserId: to,
    gameId: String(gameId || ''),
    gameName: String(gameName || ''),
  });
  return inviteId;
}

export function subscribeNotifications(uid, onData, onError) {
  const u = String(uid || '');
  if (!u) {
    onData([]);
    onError?.(null);
    return () => {};
  }
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', u),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      onError?.(null);
      onData(snap.docs.map((d) => toSerializableFirebase({ id: d.id, ...d.data() })));
    },
    (err) => {
      onData([]);
      onError?.({
        errorCode: err?.code || 'notifications/subscribe-failed',
        message: err?.message || 'Failed to load notifications.',
      });
    }
  );
}

export async function markNotificationRead(notificationId) {
  const id = String(notificationId || '');
  if (!id) return;
  await callMarkNotificationRead({ notificationId: id });
}

export async function updateInviteStatus(inviteId, status) {
  const id = String(inviteId || '');
  const st = String(status || '').toLowerCase();
  if (!id || !['accepted', 'rejected'].includes(st)) throw new Error('Invalid invite action.');
  if (st === 'accepted') {
    const data = await callAcceptChallenge({ inviteId: id });
    return data;
  }
  await callRejectChallenge({ inviteId: id });
  return { ok: true, status: 'rejected' };
}

/**
 * Server-side “available to play” friends (online, not in-game, no pending invite with you).
 * @param {{ limit?: number }} [opts]
 */
export async function fetchAvailablePlayers(opts = {}) {
  return callListAvailablePlayers(opts);
}

export async function ensureFriendsDoc(uid, friendIds) {
  const u = String(uid || '');
  if (!u) return;
  await setDoc(doc(db, 'friends', u), { friendsList: unique(friendIds) }, { merge: true });
}

