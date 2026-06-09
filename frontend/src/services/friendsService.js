import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';

/**
 * Add a friend document under `users/{myUid}/friends/{friendUid}`.
 * @param {string} myUid
 * @param {string} friendUid
 */
export async function addFriendByUid(myUid, friendUid) {
  const f = String(friendUid || '').trim();
  if (!f || f === myUid) {
    throw new Error('Enter a valid friend user id');
  }
  const prof = await getDoc(doc(db, 'publicProfiles', f));
  if (!prof.exists()) {
    throw new Error('Friend profile not found');
  }
  const d = prof.data() || {};
  await setDoc(
    doc(db, 'users', myUid, 'friends', f),
    {
      friendUid: f,
      displayName: d.displayName || f,
      photoURL: d.photoURL || '',
      since: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * @param {string} myUid
 * @returns {Promise<Array<{ id: string, friendUid: string, displayName?: string, photoURL?: string }>>}
 */
export async function listFriendDocs(myUid) {
  if (!myUid) return [];
  const col = collection(db, 'users', myUid, 'friends');
  const snap = await getDocs(col);
  return snap.docs.map((x) => ({ id: x.id, ...x.data() }));
}
