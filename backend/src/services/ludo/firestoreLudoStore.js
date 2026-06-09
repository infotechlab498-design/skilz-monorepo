/**
 * Firestore persistence for Ludo matches (single source of truth).
 * Collection: ludoMatches/{matchId}
 *
 * Meta fields: schemaVersion, revision, updatedAt
 * Game fields: same shape as in-memory state except `sockets` (runtime-only, not stored).
 * Client receives `revision` on each ludo:gameState for stale-update guards.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../firebaseAdmin.js';

export const LUDO_MATCHES_COLLECTION = 'ludoMatches';
export const LUDO_SCHEMA_VERSION = 1;

function pruneUndefined(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((x) => pruneUndefined(x)).filter((x) => x !== undefined);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const pv = pruneUndefined(v);
    if (pv !== undefined) out[k] = pv;
  }
  return out;
}

/**
 * @param {FirebaseFirestore.DocumentData | undefined} data
 * @returns {object | null}
 */
export function stateFromDoc(data) {
  if (!data || typeof data !== 'object') return null;
  const { schemaVersion: _sv, revision, updatedAt: _ua, ...game } = data;
  const state = { ...game };
  state.sockets = {};
  state.revision = typeof revision === 'number' ? revision : 0;
  return state;
}

/**
 * @param {object} state
 * @param {number} nextRevision
 */
export function docFromState(state, nextRevision) {
  const clone = JSON.parse(JSON.stringify(state));
  delete clone.sockets;
  delete clone.revision;
  return pruneUndefined({
    ...clone,
    schemaVersion: LUDO_SCHEMA_VERSION,
    revision: nextRevision,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * @param {import('firebase-admin/firestore').Firestore} adb
 * @param {string} roomId
 */
export async function readLudoMatch(adb, roomId) {
  const snap = await adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId).get();
  if (!snap.exists) return null;
  return stateFromDoc(snap.data());
}

/**
 * Full replace write (use after transaction or initial create).
 * @param {import('firebase-admin/firestore').Firestore} adb
 * @param {string} roomId
 * @param {object} state
 * @param {number} [explicitRevision]
 */
export async function writeLudoMatch(adb, roomId, state, explicitRevision) {
  const ref = adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId);
  return adb.runTransaction(async (t) => {
    const cur = await t.get(ref);
    const currentRevision = cur.exists ? Number(cur.data()?.revision) || 0 : 0;
    const requestedRevision =
      explicitRevision == null ? null : Number(explicitRevision) || 0;
    const nextRev =
      requestedRevision == null ? currentRevision + 1 : requestedRevision;

    // Guard against stale callers trying to persist an older snapshot.
    if (nextRev <= currentRevision) {
      const err = new Error('STALE_SNAPSHOT_WRITE');
      err.code = 'STALE_SNAPSHOT_WRITE';
      err.currentRevision = currentRevision;
      err.requestedRevision = nextRev;
      throw err;
    }

    const payload = docFromState(state, nextRev);
    t.set(ref, payload);
    return { ...state, revision: nextRev, sockets: {} };
  });
}

/**
 * Run a mutation inside a Firestore transaction (optimistic concurrency via revision).
 * @param {import('firebase-admin/firestore').Firestore} adb
 * @param {string} roomId
 * @param {(state: object) => void} mutator — mutates state in place; throw to abort
 * @returns {Promise<object>} updated state with sockets {} and revision set
 */
export async function runLudoMatchTransaction(adb, roomId, mutator) {
  const ref = adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId);
  return adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      const err = new Error('ROOM_NOT_FOUND');
      err.code = 'ROOM_NOT_FOUND';
      throw err;
    }
    const data = snap.data();
    const state = stateFromDoc(data);
    if (!state) {
      const err = new Error('INVALID_ROOM_DOC');
      err.code = 'INVALID_ROOM_DOC';
      throw err;
    }
    const prevRev = Number(data.revision) || 0;
    mutator(state);
    state.lastUpdated = Date.now();
    const payload = docFromState(state, prevRev + 1);
    t.set(ref, payload);
    state.revision = prevRev + 1;
    state.sockets = {};
    return state;
  });
}

/**
 * Create initial room document (no prior doc).
 * @param {import('firebase-admin/firestore').Firestore} adb
 * @param {string} roomId
 * @param {object} state
 */
export async function createLudoMatchDoc(adb, roomId, state) {
  const ref = adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId);
  const payload = docFromState(state, 1);
  await ref.set(payload);
  const out = { ...state, revision: 1, sockets: state.sockets || {} };
  return out;
}

/**
 * Delete match doc (e.g. host closed empty lobby or post-cleanup).
 * @param {import('firebase-admin/firestore').Firestore} adb
 * @param {string} roomId
 */
export async function deleteLudoMatchDoc(adb, roomId) {
  await adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId).delete();
}

/**
 * Load all LOBBY / PLAYING matches into a Map (server boot).
 * @param {import('firebase-admin/firestore').Firestore} adb
 * @param {Map<string, object>} target
 */
export async function loadActiveLudoMatchesIntoMap(adb, target) {
  const col = adb.collection(LUDO_MATCHES_COLLECTION);
  const [lobbySnap, playingSnap] = await Promise.all([
    col.where('status', '==', 'LOBBY').get(),
    col.where('status', '==', 'PLAYING').get(),
  ]);
  let n = 0;
  for (const snap of [...lobbySnap.docs, ...playingSnap.docs]) {
    const st = stateFromDoc(snap.data());
    if (st && st.gameId) {
      target.set(st.gameId, st);
      n++;
    }
  }
  if (n) console.log(`[Ludo] Restored ${n} match(es) from Firestore`);
}

export function getFirestoreOrNull() {
  return getAdminFirestore();
}
