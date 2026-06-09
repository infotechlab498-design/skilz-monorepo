const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

function assertAuthed(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  return request.auth.uid;
}

function normalizeMode(mode) {
  const m = String(mode || 'practice').trim().toLowerCase();
  if (m === 'practice' || m === '1v1' || m === 'invite') return m;
  return 'practice';
}

async function runCreateMatch(db, request) {
  const uid = assertAuthed(request);
  const data = request.data || {};
  const category = String(data.category || 'History').trim();
  const difficulty = String(data.difficulty || 'easy').trim().toLowerCase();
  const mode = normalizeMode(data.mode);
  const ref = db.collection('matches').doc();
  await ref.set({
    gameType: 'trivia',
    createdBy: uid,
    mode,
    category,
    difficulty,
    status: mode === 'invite' ? 'waiting' : 'forming',
    playerIds: [uid],
    score: { [uid]: 0 },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { matchId: ref.id, mode, category, difficulty };
}

async function runJoinMatch(db, request) {
  const uid = assertAuthed(request);
  const matchId = String(request.data?.matchId || '').trim();
  if (!matchId) throw new HttpsError('invalid-argument', 'matchId is required.');
  const ref = db.collection('matches').doc(matchId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Match not found.');
    const m = snap.data() || {};
    const playerIds = Array.isArray(m.playerIds) ? [...m.playerIds] : [];
    if (!playerIds.includes(uid)) playerIds.push(uid);
    if (playerIds.length > 2) throw new HttpsError('failed-precondition', 'Match is full.');
    tx.update(ref, {
      playerIds,
      status: playerIds.length === 2 ? 'ready' : 'waiting',
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true, matchId };
}

async function runFindMatch(db, request) {
  const uid = assertAuthed(request);
  const category = String(request.data?.category || 'History').trim();
  const difficulty = String(request.data?.difficulty || 'easy').trim().toLowerCase();
  const waiting = await db
    .collection('matches')
    .where('gameType', '==', 'trivia')
    .where('status', '==', 'waiting')
    .where('category', '==', category)
    .where('difficulty', '==', difficulty)
    .limit(10)
    .get();
  const candidate = waiting.docs.find((d) => {
    const ids = d.data()?.playerIds || [];
    return Array.isArray(ids) && ids.length < 2 && !ids.includes(uid);
  });
  if (!candidate) return { found: false };
  return { found: true, matchId: candidate.id };
}

async function runSubmitAnswer(db, request) {
  const uid = assertAuthed(request);
  const matchId = String(request.data?.matchId || '').trim();
  const questionId = String(request.data?.questionId || '').trim();
  const selectedIndex = Number(request.data?.selectedIndex);
  if (!matchId || !questionId || Number.isNaN(selectedIndex)) {
    throw new HttpsError('invalid-argument', 'matchId, questionId, selectedIndex are required.');
  }
  const answerRef = db.collection('matches').doc(matchId).collection('answers').doc(`${uid}_${questionId}`);
  await answerRef.set({
    uid,
    questionId,
    selectedIndex,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

module.exports = {
  runCreateMatch,
  runJoinMatch,
  runFindMatch,
  runSubmitAnswer,
};
