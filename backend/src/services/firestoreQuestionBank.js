import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin.js';

const PLAYED_CAP = 500;
/** Max Firestore docs read per fetch attempt (batched pages). */
const CANDIDATE_CAP = 400;
const CANDIDATE_PAGE = 100;
const BROAD_FETCH_CAP = 600;

export function normalizeTriviaCategory(category) {
  const c = String(category || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (c === 'current_affairs' || c === 'current-affairs' || c === 'current affairs') {
    return 'current_affairs';
  }
  return 'history';
}

export function normalizeTriviaDifficulty(difficulty) {
  const d = String(difficulty || 'easy').trim().toLowerCase();
  if (d === 'medium' || d === 'hard') return d;
  return 'easy';
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function firestoreRequired() {
  const db = getAdminFirestore();
  if (!db) {
    const e = new Error('Firestore Admin is not configured');
    e.code = 'FIRESTORE_UNAVAILABLE';
    throw e;
  }
  return db;
}

function docToRuntimeQuestion(doc) {
  const d = doc.data() || {};
  const options = Array.isArray(d.options)
    ? d.options.map((x) => String(x || '').trim())
    : [d.option1, d.option2, d.option3, d.option4].map((x) => String(x || '').trim());
  const correctIndex = Number(d.correctIndex);
  return {
    id: doc.id,
    category: String(d.category || ''),
    difficulty: String(d.difficulty || 'easy'),
    text: String(d.question || '').trim(),
    options,
    correctIndex,
    imageUrl: String(d.imageUrl || ''),
  };
}

function isDocActiveForPlay(d) {
  if (d.active === false) return false;
  if (String(d.active).toLowerCase() === 'false') return false;
  return true;
}

function categoryQueryAttempts(category) {
  const base = normalizeTriviaCategory(category);
  const attempts = new Set([base]);
  if (base === 'history') {
    attempts.add('History');
    attempts.add('General Knowledge');
    attempts.add('general_knowledge');
    attempts.add('general knowledge');
  } else if (base === 'current_affairs') {
    attempts.add('Current Affairs');
    attempts.add('current affairs');
    attempts.add('current-affairs');
  }
  return [...attempts];
}

function isIndexOrMissingCompositeError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  return code === 9 || /FAILED_PRECONDITION|requires an index/i.test(msg);
}

async function loadPlayedIdSet(uid) {
  const db = firestoreRequired();
  const snap = await db.collection('users').doc(uid).collection('playedQuestions').get();
  return new Set(snap.docs.map((d) => d.id));
}

/**
 * Delete played-question markers for one user scoped to category + difficulty.
 */
export async function resetPlayedHistory(uid, category, difficulty) {
  const db = firestoreRequired();
  const cat = normalizeTriviaCategory(category);
  const diff = normalizeTriviaDifficulty(difficulty);
  const ref = db.collection('users').doc(uid).collection('playedQuestions');
  const q = ref.where('category', '==', cat).where('difficulty', '==', diff).orderBy('playedAt', 'asc');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await q.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    if (snap.size < 400) break;
  }
}

async function loadCandidateDocs(category, difficulty) {
  const db = firestoreRequired();
  const catAttempts = categoryQueryAttempts(category);
  const diff = normalizeTriviaDifficulty(difficulty);
  /** @type {Map<string, FirebaseFirestore.QueryDocumentSnapshot>} */
  const byId = new Map();
  let lastDoc = null;

  async function collect(buildQuery, label) {
    lastDoc = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = buildQuery();
      if (lastDoc) q = q.startAfter(lastDoc);
      let snap;
      try {
        snap = await q.limit(CANDIDATE_PAGE).get();
      } catch (err) {
        if (isIndexOrMissingCompositeError(err)) {
          console.warn(`[Trivia] Firestore index missing for query stage "${label}":`, err?.message || err);
          return;
        }
        throw err;
      }
      if (snap.empty) return;
      for (const doc of snap.docs) byId.set(doc.id, doc);
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < CANDIDATE_PAGE || byId.size >= CANDIDATE_CAP) return;
    }
  }

  // Stage 1: strict query (fast path).
  for (const cat of catAttempts) {
    await collect(
      () =>
        db
          .collection('questions')
          .where('category', '==', cat)
          .where('difficulty', '==', diff)
          .where('active', '==', true)
          .orderBy('createdAt', 'desc'),
      'strict-category-difficulty-active-createdAt'
    );
  }

  // Stage 2: tolerate missing active field.
  if (byId.size < CANDIDATE_CAP) {
    for (const cat of catAttempts) {
      await collect(
        () =>
          db
            .collection('questions')
            .where('category', '==', cat)
            .where('difficulty', '==', diff)
            .orderBy('createdAt', 'desc'),
        'category-difficulty-createdAt'
      );
    }
  }

  // Stage 3: broad fallback (no orderBy/index requirement), in-memory filtering.
  if (byId.size < CANDIDATE_CAP) {
    const broad = await db.collection('questions').limit(BROAD_FETCH_CAP).get();
    for (const doc of broad.docs) {
      const d = doc.data() || {};
      if (!catAttempts.includes(String(d.category || '').trim())) continue;
      if (normalizeTriviaDifficulty(d.difficulty) !== diff) continue;
      if (!isDocActiveForPlay(d)) continue;
      byId.set(doc.id, doc);
      if (byId.size >= CANDIDATE_CAP) break;
    }
  }

  const filtered = [...byId.values()].filter((doc) => {
    const d = doc.data() || {};
    if (!isDocActiveForPlay(d)) return false;
    const c = String(d.category || '').trim();
    if (!catAttempts.includes(c)) return false;
    return normalizeTriviaDifficulty(d.difficulty) === diff;
  });
  filtered.sort((a, b) => {
    const av = a.data()?.createdAt;
    const bv = b.data()?.createdAt;
    const ats = typeof av?.toMillis === 'function' ? av.toMillis() : 0;
    const bts = typeof bv?.toMillis === 'function' ? bv.toMillis() : 0;
    return bts - ats;
  });
  return filtered.slice(0, CANDIDATE_CAP);
}

function mapOptionFieldsIfNeeded(doc) {
  const d = doc.data() || {};
  if (Array.isArray(d.options) && d.options.length === 4) return;
  const fromLegacy = [d.option1, d.option2, d.option3, d.option4].map((x) => String(x || '').trim());
  if (fromLegacy.some((x) => !x)) return;
  doc.ref
    .set({ options: fromLegacy }, { merge: true })
    .catch((err) => console.warn('[Trivia] failed to backfill options for doc:', doc.id, err?.message || err));
}

function maybeBackfillDocFields(doc) {
  const d = doc.data() || {};
  const patch = {};
  if (d.active === undefined) patch.active = true;
  if (d.createdAt === undefined) patch.createdAt = FieldValue.serverTimestamp();
  if (Object.keys(patch).length > 0) {
    doc.ref
      .set(patch, { merge: true })
      .catch((err) =>
        console.warn('[Trivia] failed to backfill active/createdAt for doc:', doc.id, err?.message || err)
      );
  }
  mapOptionFieldsIfNeeded(doc);
}

function pickUnplayed(docs, playedSet, count) {
  docs.forEach(maybeBackfillDocFields);
  const mapped = docs.map((d) => docToRuntimeQuestion(d)).filter((q) => {
    if (!q.text || q.options.length !== 4) return false;
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) return false;
    return true;
  });
  const unplayed = mapped.filter((q) => !playedSet.has(q.id));
  return shuffle(unplayed).slice(0, count);
}

/**
 * Fetch trivia questions for one match (same array used for all players in room).
 * Excludes questions already in users/{uid}/playedQuestions for the requesting user.
 * If fewer than `count` unplayed exist, resets that user's history for category+difficulty and retries once.
 */


export async function fetchQuestionsFromFirestore({ uid, category, difficulty, count = 10 }) {
  if (!uid) {
    const e = new Error('User id required');
    e.code = 'INVALID_UID';
    throw e;
  }
  const cat = normalizeTriviaCategory(category);
  const diff = normalizeTriviaDifficulty(difficulty);

  let playedSet = await loadPlayedIdSet(uid);
  let docs = await loadCandidateDocs(cat, diff);
  let picked = pickUnplayed(docs, playedSet, count);

  if (picked.length < count) {
    await resetPlayedHistory(uid, cat, diff);
    playedSet = await loadPlayedIdSet(uid);
    docs = await loadCandidateDocs(cat, diff);
    picked = pickUnplayed(docs, playedSet, count);
  }

  if (picked.length < count) {
    const e = new Error('No questions available for this category');
    e.code = 'INSUFFICIENT_QUESTIONS';
    throw e;
  }

  return picked;
}


/**
 * Prune oldest played markers so subcollection stays at most PLAYED_CAP documents.
 */


export async function prunePlayedQuestions(uid) {
  const db = firestoreRequired();
  const ref = db.collection('users').doc(uid).collection('playedQuestions');
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
 * Record question IDs as played for a user (after match ends). Rolls window to PLAYED_CAP.
 */


export async function recordPlayedQuestions({ uid, questionIds, category, difficulty }) {
  if (!uid || !Array.isArray(questionIds) || questionIds.length === 0) return;
  const db = firestoreRequired();
  const cat = normalizeTriviaCategory(category);
  const diff = normalizeTriviaDifficulty(difficulty);
  const ref = db.collection('users').doc(uid).collection('playedQuestions');

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
      },
      { merge: true }
    );
  }
  await batch.commit();
  await prunePlayedQuestions(uid);
}
