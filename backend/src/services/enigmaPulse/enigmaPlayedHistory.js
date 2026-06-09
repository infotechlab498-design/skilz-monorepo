import { FieldValue } from 'firebase-admin/firestore';
import { isPatternRecognitionGameKey } from '../../../../shared/enigmaPulse/gameKeys.js';
import { getAdminFirestore } from '../firebaseAdmin.js';

const SUB = 'enigmaPlayedQuestions';
/** 0 = never prune (permanent exclusion list for anti-repeat). Set e.g. 5000 to cap oldest docs. */
const PLAYED_CAP = Math.max(0, Number(process.env.ENIGMA_PLAYED_HISTORY_CAP || 0));

function dbOrThrow() {
  const db = getAdminFirestore();
  if (!db) {
    const e = new Error('Firestore Admin is not configured');
    e.code = 'FIRESTORE_UNAVAILABLE';
    throw e;
  }
  return db;
}

/**
 * @param {string} uid
 * @param {{ gameKey?: string }} [opts]
 * @returns {Promise<Set<string>>}
 */
export async function loadEnigmaPlayedIdSet(uid, opts = {}) {
  const db = dbOrThrow();
  const raw = String(opts.gameKey || '').trim().toLowerCase();
  if (!raw) {
    const snap = await db.collection('users').doc(String(uid)).collection(SUB).get();
    return new Set(snap.docs.map((d) => d.id));
  }
  const keys = isPatternRecognitionGameKey(raw) ? ['pattern_recognition', 'riddle_sequence'] : [raw];
  const merged = new Set();
  try {
    for (const gk of keys) {
      const snap = await db.collection('users').doc(String(uid)).collection(SUB).where('gameKey', '==', gk).get();
      snap.docs.forEach((d) => merged.add(d.id));
    }
    return merged;
  } catch (err) {
    throw err;
  }
}

/**
 * Reset served markers for one user scoped to category + difficulty.
 */
export async function resetEnigmaPlayedHistory(uid, category, difficulty, gameKey = '') {
  const db = dbOrThrow();
  const cat = String(category || '').trim();
  const diff = String(difficulty || '').trim().toLowerCase();
  const raw = String(gameKey || '').trim().toLowerCase();
  const keyVariants =
    !raw ? [null] : isPatternRecognitionGameKey(raw) ? ['pattern_recognition', 'riddle_sequence'] : [raw];
  const ref = db.collection('users').doc(String(uid)).collection(SUB);

  for (const key of keyVariants) {
    let q = ref.where('category', '==', cat).where('difficulty', '==', diff);
    if (key != null) q = q.where('gameKey', '==', key);
    q = q.orderBy('playedAt', 'asc');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let snap;
      try {
        snap = await q.limit(400).get();
      } catch (err) {
        throw err;
      }
      if (snap.empty) break;
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      if (snap.size < 400) break;
    }
  }
}

async function pruneEnigmaPlayed(uid) {
  if (!PLAYED_CAP) return;
  const db = dbOrThrow();
  const ref = db.collection('users').doc(String(uid)).collection(SUB);
  const snap = await ref.orderBy('playedAt', 'asc').get();
  const excess = snap.size - PLAYED_CAP;
  if (excess <= 0) return;

  const toDelete = snap.docs.slice(0, excess);
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    for (const d of toDelete.slice(i, i + 400)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

/**
 * @param {{ uid: string; questionIds: string[]; category: string; difficulty: string; gameKey?: string }} args
 */
export async function recordEnigmaPlayedQuestions({ uid, questionIds, category, difficulty, gameKey = '' }) {
  if (!uid || !Array.isArray(questionIds) || questionIds.length === 0) return;
  const db = dbOrThrow();
  const cat = String(category || '').trim();
  const diff = String(difficulty || '').trim().toLowerCase();
  const key = String(gameKey || '').trim().toLowerCase();
  const ref = db.collection('users').doc(String(uid)).collection(SUB);

  const batch = db.batch();
  for (const id of questionIds) {
    const qid = String(id || '').trim();
    if (!qid) continue;
    batch.set(
      ref.doc(qid),
      {
        playedAt: FieldValue.serverTimestamp(),
        category: cat,
        difficulty: diff,
        gameKey: key || null,
      },
      { merge: true }
    );
  }
  await batch.commit();
  await pruneEnigmaPlayed(uid);
}
