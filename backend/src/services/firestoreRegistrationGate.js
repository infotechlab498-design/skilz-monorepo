import { getAdminFirestore } from './firebaseAdmin.js';

/**
 * Strict registration gate: Skilz treats `users/{uid}` in Firestore as "completed signup".
 * @param {string} uid
 * @returns {Promise<'yes'|'no'|'unknown'|'error'>}
 *   `unknown` — Admin SDK not configured / key file missing.
 *   `error` — Admin is configured but reading `users/{uid}` failed (permissions, API, network).
 */
export async function firestoreRegistrationDocState(uid) {
  if (!uid) return 'no';
  const adb = getAdminFirestore();
  if (!adb) return 'unknown';
  try {
    const snap = await adb.collection('users').doc(uid).get();
    return snap.exists ? 'yes' : 'no';
  } catch (err) {
    console.warn('[firestoreRegistrationGate] users/%s read failed:', uid, err?.code ?? err?.message ?? err);
    return 'error';
  }
}
