import { getAdminFirestore } from '../firebaseAdmin.js';
import { enrichQuestionForPlay } from './engine/AnswerValidator.js';

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'info@aljazeeragc.com').toLowerCase().trim();

/** Client-safe question payload (mirrors enigmaPulseRealtime.normalizeQuestionForClient). */
export function normalizeQuestionForClient(question, gameKey = 'syllogism') {
  const key = String(gameKey || '').toLowerCase();
  let opts = Array.isArray(question.options) ? question.options.map((x) => String(x)).slice(0, 4) : [];
  if (key === 'riddle_text_input') {
    opts = [];
  }
  const payload = {
    id: question.id,
    text: question.text,
    options: opts,
    imageUrl: question.imageUrl || '',
    category: question.category,
    difficulty: question.difficulty,
    hint: question.hint || '',
    explanation: question.explanation || '',
    patternKind: question.patternKind || '',
    ...(Array.isArray(question.sequence) && question.sequence.length ? { sequence: question.sequence } : {}),
  };
  if (key === 'syllogism' && opts.length === 4 && Number.isInteger(Number(question.correctIndex))) {
    const correctIndex = Number(question.correctIndex);
    const wrong = [0, 1, 2, 3].filter((idx) => idx !== correctIndex);
    const randomWrong = wrong[Math.floor(Math.random() * wrong.length)] ?? wrong[0] ?? 0;
    payload.fiftyFiftyKeep = [correctIndex, randomWrong];
  }
  return payload;
}

/** @param {string} id */
export function isFirestoreBackedQuestionId(id) {
  const s = String(id || '').trim();
  return Boolean(s) && !s.startsWith('epq_');
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} uid
 */
async function userIsAdminRole(db, uid) {
  const snap = await db.collection('users').doc(String(uid)).get();
  return String(snap.data()?.role || '').trim() === 'admin';
}

/**
 * @param {{ user?: { uid?: string; email?: string } }} socket
 */
export async function assertEnigmaSocketAdmin(socket) {
  const uid = String(socket?.user?.uid || '').trim();
  const email = String(socket?.user?.email || '').toLowerCase().trim();
  if (!uid || email !== ADMIN_EMAIL) {
    return { ok: false, message: 'Unauthorized: admin access required' };
  }
  const db = getAdminFirestore();
  if (!db) {
    return { ok: false, message: 'Firestore Admin is not configured' };
  }
  const roleOk = await userIsAdminRole(db, uid);
  if (!roleOk) {
    return { ok: false, message: 'Unauthorized: admin role required' };
  }
  return { ok: true, uid, email };
}

/**
 * @param {Record<string, unknown>} updated serialized from firestoreQuestionAdmin
 */
export function playRowFromUpdatedDoc(updated) {
  const options = Array.isArray(updated.options) ? updated.options.map((x) => String(x)) : [];
  return {
    id: updated.id,
    text: String(updated.question ?? updated.text ?? '').trim(),
    options,
    correctIndex: Number(updated.correctIndex) || 0,
    imageUrl: '',
    category: updated.category,
    difficulty: updated.difficulty,
    type: updated.type || 'syllogism',
    hint: updated.hint || '',
    explanation: updated.explanation || '',
    patternKind: updated.patternKind || '',
    sequence: Array.isArray(updated.sequence) ? updated.sequence : [],
    acceptedAnswers: [],
    normalizedAnswer: '',
  };
}

/**
 * @param {Record<string, unknown>} match
 * @param {string} questionId
 */
export function findQuestionSlots(match, questionId) {
  const qid = String(questionId || '').trim();
  /** @type {{ uid: string; index: number }[]} */
  const slots = [];
  const byUid = match.questionsByUid || {};
  for (const [uid, deck] of Object.entries(byUid)) {
    if (!Array.isArray(deck)) continue;
    deck.forEach((q, index) => {
      if (q && String(q.id) === qid) slots.push({ uid, index });
    });
  }
  return slots;
}

/**
 * @param {Record<string, unknown>} match
 * @param {Record<string, unknown>} updatedDoc
 * @param {string} gameKey
 */
export function patchMatchDecksWithUpdated(match, updatedDoc, gameKey = 'syllogism') {
  const qid = String(updatedDoc.id || '').trim();
  const playRow = enrichQuestionForPlay(playRowFromUpdatedDoc(updatedDoc));
  const clientRow = normalizeQuestionForClient(playRow, gameKey);
  const slots = findQuestionSlots(match, qid);
  for (const { uid, index } of slots) {
    if (!match.questionsByUid[uid]) continue;
    match.questionsByUid[uid][index] = playRow;
    if (!match.clientQuestionsByUid) match.clientQuestionsByUid = {};
    if (!Array.isArray(match.clientQuestionsByUid[uid])) match.clientQuestionsByUid[uid] = [];
    match.clientQuestionsByUid[uid][index] = clientRow;
  }
  return slots;
}

function tombstonePlayRow(questionId) {
  return enrichQuestionForPlay({
    id: questionId,
    text: 'This question was removed by an administrator.',
    options: ['—', '—', '—', '—'],
    correctIndex: 0,
    category: 'Syllogism',
    difficulty: 'easy',
    type: 'syllogism',
    _adminRemoved: true,
  });
}

/**
 * Replace deck slots with questionId by tombstones (keeps indices stable for questionIndex).
 * @returns {{ hitsCurrent: boolean; slotCount: number }}
 */
export function tombstoneQuestionIdInDecks(match, questionId, gameKey = 'syllogism') {
  const qid = String(questionId || '').trim();
  const currentIdx = Number(match.questionIndex ?? 0);
  let hitsCurrent = false;
  let slotCount = 0;
  const playRow = tombstonePlayRow(qid);
  const clientRow = normalizeQuestionForClient(playRow, gameKey);
  const slots = findQuestionSlots(match, qid);
  for (const { uid, index } of slots) {
    slotCount += 1;
    if (index === currentIdx) hitsCurrent = true;
    if (!match.questionsByUid[uid]) continue;
    match.questionsByUid[uid][index] = playRow;
    if (!match.clientQuestionsByUid) match.clientQuestionsByUid = {};
    if (!Array.isArray(match.clientQuestionsByUid[uid])) match.clientQuestionsByUid[uid] = [];
    match.clientQuestionsByUid[uid][index] = clientRow;
  }
  return { hitsCurrent, slotCount };
}

/**
 * @param {Record<string, unknown>} match
 * @param {import('socket.io').Server} io
 * @param {EnigmaPulseEvents} events
 * @param {(match: Record<string, unknown>, uid: string) => Record<string, unknown>} roomPayloadForUid
 * @param {number[]} [indices]
 */
export function broadcastDeckSyncToRoom(match, io, events, roomPayloadForUid, indices = []) {
  const roomId = match.roomId;
  const currentIdx = Number(match.questionIndex ?? 0);
  const indexSet = new Set(indices.length ? indices : [currentIdx]);
  for (const pl of match.players || []) {
    const sid = match.sockets?.[pl.uid];
    if (!sid) continue;
    let shouldSync = false;
    for (const idx of indexSet) {
      if (match.questionsByUid?.[pl.uid]?.[idx]) shouldSync = true;
    }
    if (!shouldSync && match.clientQuestionsByUid?.[pl.uid]?.[currentIdx]) shouldSync = true;
    if (shouldSync) {
      io.to(sid).emit(events.SYNC_STATE, roomPayloadForUid(match, pl.uid));
    }
  }
}
