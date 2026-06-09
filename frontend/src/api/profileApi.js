import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config.js';
import { toSerializableFirebase } from '../services/userService.js';

function userDocRef(uid) {
  return doc(db, 'users', String(uid));
}

function publicProfileRef(uid) {
  return doc(db, 'publicProfiles', String(uid));
}

/** Keys that must not be written from the client (economy / server-owned). */
const STRIP_FROM_USER_MERGE = new Set([
  'coins',
  'xp',
  'earnedCoins',
  'level',
  'dailyStreak',
  'stats',
  'games',
  'monthlyGameStats',
  'rankingHistory',
]);

function sanitizeUserProfilePayload(data) {
  if (!data || typeof data !== 'object') return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (!STRIP_FROM_USER_MERGE.has(k)) out[k] = v;
  }
  return out;
}

/**
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
export async function getUserProfile(uid) {
  const u = String(uid || '');
  if (!u) return null;
  const snap = await getDoc(userDocRef(u));
  if (!snap.exists()) return null;
  return toSerializableFirebase({ id: u, ...snap.data() });
}

/**
 * Merge update into `users/{uid}`.
 * @param {string} uid
 * @param {Record<string, unknown>} data
 */
export async function updateUserProfile(uid, data) {
  const u = String(uid || '');
  if (!u) throw new Error('Missing uid');
  const safe = sanitizeUserProfilePayload(data);
  await setDoc(
    userDocRef(u),
    {
      ...safe,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Writes a sanitized cross-user safe profile to `publicProfiles/{uid}`.
 * @param {string} uid
 * @param {{ displayName: string, photoURL: string, level?: number, xp?: number }} data
 */
export async function upsertPublicProfile(uid, data) {
  const u = String(uid || '');
  if (!u) throw new Error('Missing uid');
  const payload = {
    uid: u,
    displayName: String(data?.displayName || '').trim(),
    photoURL: String(data?.photoURL || '').trim(),
    level: Number.isFinite(data?.level) ? Number(data.level) : 1,
    xp: Number.isFinite(data?.xp) ? Number(data.xp) : 0,
    updatedAt: serverTimestamp(),
  };
  await setDoc(publicProfileRef(u), payload, { merge: true });
}

/**
 * Upload profile image via backend (Cloudinary) and returns { url }.
 * @param {File} file
 * @returns {Promise<{ url: string }>}
 */
export async function uploadProfileImage(file) {
  if (!file) throw new Error('Missing file');
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to upload a profile image');
  }
  const idToken = await currentUser.getIdToken();
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch('/api/upload/profile-image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Could not upload profile image');
  }
  const url = String(payload?.url || '').trim();
  if (!url) throw new Error('Profile image URL missing from upload response');
  return { url };
}

/**
 * Optional: small patch update (uses updateDoc).
 * @param {string} uid
 * @param {Record<string, unknown>} patch
 */
export async function patchUserProfile(uid, patch) {
  const u = String(uid || '');
  if (!u) throw new Error('Missing uid');
  const safe = sanitizeUserProfilePayload(patch);
  await updateDoc(userDocRef(u), { ...safe, updatedAt: serverTimestamp() });
}

