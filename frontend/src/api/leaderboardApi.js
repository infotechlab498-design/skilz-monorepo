import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { onValue, ref as rtdbRef } from 'firebase/database';
import { db, rtdb } from '../firebase/config.js';
import { toSerializableFirebase } from '../services/userService.js';
import { callGetLeaderboard } from './cloudFunctionsApi.js';

function normalizeUser(uid, raw) {
  const d = toSerializableFirebase(raw || {});
  return {
    id: uid,
    name: d.name || d.displayName || 'Unknown Player',
    avatar: d.avatar || d.photoURL || '',
    level: Number(d.level || 0),
    xp: Number(d.xp || 0),
    coins: Number(d.coins || 0),
    email: d.email || '',
    gameStats: d.gameStats || {},
  };
}

/**
 * Subscribes to the entire `users` collection. This only works if Firestore rules allow
 * broad reads (they do not in production — owner-read only). Prefer {@link fetchLeaderboard}.
 * @deprecated Use fetchLeaderboard for production.
 */
export function subscribeLeaderboardUsers(onData) {
  const col = collection(db, 'publicProfiles');
  return onSnapshot(
    col,
    (snap) => {
      const rows = snap.docs.map((x) => normalizeUser(x.id, x.data()));
      onData(rows);
    },
    () => onData([])
  );
}

/**
 * Server-built XP leaderboard (Cloud Function). Safe for production.
 * @param {{ limit?: number }} [opts]
 */
export async function fetchLeaderboard(opts = {}) {
  const data = await callGetLeaderboard({ limit: opts.limit });
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return entries.map((e) => ({
    id: e.uid,
    name: e.displayName || 'Player',
    avatar: e.photoURL || '',
    level: Number(e.level) || 1,
    xp: Number(e.xp) || 0,
    coins: 0,
    email: '',
    gameStats: { wins: Number(e.wins) || 0 },
    rank: Number(e.rank) || 0,
  }));
}

export function subscribePresence(onData) {
  if (!rtdb) {
    onData({});
    return () => {};
  }
  const pRef = rtdbRef(rtdb, 'presence');
  return onValue(
    pRef,
    (snap) => onData(snap.val() || {}),
    () => onData({})
  );
}

export function subscribeFriendIds(uid, onData) {
  const u = String(uid || '');
  if (!u) {
    onData([]);
    return () => {};
  }
  const unsubs = [];
  let subList = [];
  let docList = [];
  const emit = () => onData(Array.from(new Set([...subList, ...docList].filter(Boolean))));

  unsubs.push(
    onSnapshot(
      collection(db, 'users', u, 'friends'),
      (snap) => {
        subList = snap.docs.map((d) => String(d.data()?.friendUid || d.id));
        emit();
      },
      () => {
        subList = [];
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'friends', u),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        docList = Array.isArray(data.friendsList) ? data.friendsList.map(String) : [];
        emit();
      },
      () => {
        docList = [];
        emit();
      }
    )
  );

  return () => unsubs.forEach((uFn) => uFn && uFn());
}

export async function getCurrentUser(uid) {
  const u = String(uid || '');
  if (!u) return null;
  const snap = await getDoc(doc(db, 'users', u));
  if (!snap.exists()) return null;
  return normalizeUser(u, snap.data());
}

