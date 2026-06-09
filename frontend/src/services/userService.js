import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';

function userRef(uid) {
  return doc(db, 'users', String(uid));
}

function isFirestoreTimestampLike(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.toMillis === 'function' &&
    typeof value.toDate === 'function'
  );
}

/**
 * Convert Firestore SDK Timestamp values into epoch milliseconds
 * so Redux state remains fully serializable (fixes RTK non-serializable warnings
 * for fields like `createdAt`, `updatedAt`, `lastSeen`).
 */
export function toSerializableFirebase(value) {
  if (isFirestoreTimestampLike(value)) {
    return value.toMillis();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSerializableFirebase(item));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toSerializableFirebase(v);
    }
    return out;
  }
  return value;
}

/**
 * OLD BACKEND (DISABLED - MIGRATED TO FIREBASE)
 * const FS_BASE = '/api/user/firestore';
 */

export async function getUser(uid) {
  if (!uid || !db) return null;
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) return null;
  return toSerializableFirebase({ id: snap.id, ...snap.data() });
}

export async function createUser(uid, data = {}) {
  if (!uid || !db) throw new Error('uid is required');
  const now = serverTimestamp();
  const payload = {
    uid: String(uid),
    displayName: data.displayName || 'Player',
    email: data.email || null,
    photoURL: data.photoURL || '',
    coins: Number.isFinite(data.coins) ? Number(data.coins) : 200,
    xp: Number.isFinite(data.xp) ? Number(data.xp) : 0,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(userRef(uid), payload, { merge: true });
  return getUser(uid);
}

function economyClientBlocked() {
  return new Error(
    'Client-side coin/XP/stats updates are disabled. Use callUpdateGameStats from src/api/cloudFunctionsApi.js (Cloud Function updateGameStats).'
  );
}

/** @deprecated Use Cloud Function `updateGameStats` via callUpdateGameStats. */
export async function updateCoins() {
  throw economyClientBlocked();
}

/** @deprecated Use Cloud Function `updateGameStats` via callUpdateGameStats. */
export async function updateXP() {
  throw economyClientBlocked();
}

/** @deprecated Use Cloud Function `updateGameStats` via callUpdateGameStats. */
export async function addCoins() {
  throw economyClientBlocked();
}

/** @deprecated Use Cloud Function `updateGameStats` via callUpdateGameStats. */
export async function deductCoins() {
  throw economyClientBlocked();
}

/** @deprecated Use Cloud Function `updateGameStats` via callUpdateGameStats. */
export async function addXP() {
  throw economyClientBlocked();
}

/** @deprecated Use Cloud Function `updateGameStats` (extend server handler if needed). */
export async function updateDailyStreak() {
  throw economyClientBlocked();
}

/** @deprecated Use Cloud Function `updateGameStats` via callUpdateGameStats. */
export async function recordGameOutcome() {
  throw economyClientBlocked();
}

export async function getUserProfileDoc(uid) {
  return getUser(uid);
}

export function subscribeUserProfile(uid, onData) {
  if (!uid || !db) return null;
  return onSnapshot(
    userRef(uid),
    (snap) => {
      onData(snap.exists() ? toSerializableFirebase({ id: snap.id, ...snap.data() }) : null);
    },
    () => onData(null)
  );
}
