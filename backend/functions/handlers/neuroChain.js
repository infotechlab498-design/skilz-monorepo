const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { existsSync, readFileSync } = require('fs');
const path = require('path');
const {
  NODES_PER_MATCH,
  NC_BOT_UID,
  COLLECTIONS,
  DEFAULT_QUESTION_MS,
  ANSWER_GRACE_MS,
  USED_QUESTION_IDS_CAP,
  MATCH_WINDOW_MS,
  BOT_CORRECT_PROBABILITY,
  nodeTier,
  botUiDelayRangeMs,
} = require('../lib/neurochainConstants.js');
const { tryDeductGameEntryFee, refundGameEntryFee } = require('../lib/gameEntryFee.js');

const SCHEMA_VERSION = 2;
const DEBUG_ENDPOINT = 'http://127.0.0.1:7889/ingest/315b70b2-50ee-40dc-9f35-3f8c09643cc1';
const DEBUG_SESSION_ID = '55a939';
const DEBUG_LOG_ENABLED = process.env.NODE_ENV !== 'production' && process.env.ENABLE_FUNCTION_DEBUG_LOGS === '1';

function debugLog(hypothesisId, message, data = {}) {
  if (!DEBUG_LOG_ENABLED) return;
  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': DEBUG_SESSION_ID },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId: 'pre-fix',
      hypothesisId,
      location: 'backend/functions/handlers/neuroChain.js',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

let cachedPool = null;

function getQuestionPool() {
  if (cachedPool) return cachedPool;
  const p = path.join(__dirname, '..', 'data', 'neurochainQuestions.json');
  if (!existsSync(p)) {
    throw new Error(`NeuroChain question pool missing at ${p}`);
  }
  cachedPool = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(cachedPool) || cachedPool.length < NODES_PER_MATCH) {
    throw new Error('NeuroChain question pool invalid or too small.');
  }
  return cachedPool;
}

function assertAuthed(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  return request.auth.uid;
}

function publicQuestion(q) {
  return {
    id: q.id,
    sequence: q.sequence,
    options: q.options,
    difficulty: q.difficulty,
    patternType: q.patternType,
  };
}

function isStrictEasyQuestion(q) {
  if (!q || q.difficulty !== 'easy' || !Array.isArray(q.sequence)) return false;
  const nums = q.sequence.map((v) => Number(v));
  if (nums.some((n) => Number.isNaN(n))) return false;
  if (nums.length < 4) return false;
  const diffs = [];
  for (let i = 1; i < nums.length - 1; i += 1) {
    diffs.push(nums[i] - nums[i - 1]);
  }
  if (diffs.length === 0) return false;
  const step = diffs[0];
  if (!diffs.every((d) => d === step)) return false;
  return Math.abs(step) >= 1 && Math.abs(step) <= 3;
}

/**
 * Picks 10 unique questions (tiered by node). Excludes ids in `usedSet` (per-user ring history) when possible.
 * Fallback: if a tier is exhausted after exclusions, allow repeats for that tier, then any unused-in-session id.
 */
function pickSessionQuestions(pool, usedSet) {
  const sessionIds = new Set();
  const chosen = [];
  for (let node = 0; node < NODES_PER_MATCH; node += 1) {
    const tier = nodeTier(node);
    let candidates = pool.filter((q) => {
      if (q.difficulty !== tier) return false;
      if (tier === 'easy' && !isStrictEasyQuestion(q)) return false;
      return !usedSet.has(q.id) && !sessionIds.has(q.id);
    });
    if (candidates.length === 0) {
      candidates = pool.filter((q) => {
        if (q.difficulty !== tier) return false;
        if (tier === 'easy' && !isStrictEasyQuestion(q)) return false;
        return !sessionIds.has(q.id);
      });
    }
    
    // Final fallback: if strict-easy pool is exhausted, allow any easy question.

    if (candidates.length === 0 && tier === 'easy') {
      candidates = pool.filter((q) => q.difficulty === tier && !sessionIds.has(q.id));
    }
    if (candidates.length === 0) {
      candidates = pool.filter((q) => !sessionIds.has(q.id));
    }
    if (candidates.length === 0) {
      throw new HttpsError('failed-precondition', 'Question pool exhausted.');
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    sessionIds.add(pick.id);
    chosen.push(pick);
  }
  return chosen;
}

/** Ring buffer on `users.neurochainUsedQuestionIds` — avoids unbounded Firestore doc growth. */
function mergeUsedIds(existingArr, newIds) {
  const prev = Array.isArray(existingArr) ? existingArr.map(String) : [];
  const merged = [...prev, ...newIds.map(String)];
  return merged.slice(-USED_QUESTION_IDS_CAP);
}

function scoreDeltaForAnswer(isCorrect, submittedAtMs, deadlineMs) {
  if (!isCorrect) return 0;
  const secLeft = Math.max(0, Math.floor((deadlineMs - submittedAtMs) / 1000));
  return 100 + secLeft;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function computeBotIndex(correctIndex, optionsLen) {
  if (Math.random() < BOT_CORRECT_PROBABILITY) return correctIndex;
  const wrong = [];
  for (let i = 0; i < optionsLen; i += 1) {
    if (i !== correctIndex) wrong.push(i);
  }
  return wrong[Math.floor(Math.random() * wrong.length)];
}

async function displayNameFor(db, uid) {
  try {
    const pub = await db.collection('publicProfiles').doc(uid).get();
    const n = pub.data()?.displayName;
    if (n && String(n).trim()) return String(n).trim();
  } catch (_) {
    /* ignore */
  }
  return uid.length > 8 ? `${uid.slice(0, 6)}…` : uid;
}

/** Sync fallback for display name from `users/{uid}` (safe inside Firestore transactions). */
function displayNameFromUserDoc(data, uid) {
  const d = data || {};
  const n = d.displayName || d.name || d.username;
  if (n && String(n).trim()) return String(n).trim();
  return uid.length > 8 ? `${uid.slice(0, 6)}…` : uid;
}

async function createGameDocs(db, batchWrite, { mode, playerEntries, questionObjs }) {
  const gameRef = db.collection(COLLECTIONS.GAMES).doc();
  const secretRef = db.collection(COLLECTIONS.SECRETS).doc(gameRef.id);
  const now = Timestamp.now();
  const ends = Timestamp.fromMillis(now.toMillis() + DEFAULT_QUESTION_MS);
  const correctIndices = questionObjs.map((q) => q.correctIndex);

  const gamePayload = {
    gameType: 'neurochain',
    schemaVersion: SCHEMA_VERSION,
    mode,
    status: 'active',
    players: playerEntries,
    playerIds: playerEntries.map((p) => p.uid),
    currentQuestionIndex: 0,
    questions: questionObjs.map(publicQuestion),
    questionMs: DEFAULT_QUESTION_MS,
    questionStartedAt: now,
    questionEndsAt: ends,
    submissionStatus: {},
    answers: {},
    scores: Object.fromEntries(playerEntries.map((p) => [p.uid, 0])),
    correctCount: Object.fromEntries(playerEntries.map((p) => [p.uid, 0])),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  batchWrite.set(secretRef, { correctIndices, picks: {} });
  batchWrite.set(gameRef, gamePayload);
  return { gameId: gameRef.id, gameRef, secretRef };
}

async function runStartPractice(db, request) {
  const uid = assertAuthed(request);
  const deduct = await tryDeductGameEntryFee(db, uid, 'neurochain');
  if (!deduct.ok) {
    throw new HttpsError('failed-precondition', deduct.error || 'Insufficient coins');
  }
  const pool = getQuestionPool();
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const usedArr = userSnap.exists ? userSnap.data()?.neurochainUsedQuestionIds : [];
  const usedSet = new Set((usedArr || []).map(String));

  const picked = pickSessionQuestions(pool, usedSet);
  const newIds = picked.map((q) => q.id);

  const displayName = await displayNameFor(db, uid);
  const photoURL = userSnap.exists ? String(userSnap.data()?.photoURL || '') : '';

  const batch = db.batch();
  const { gameId } = await createGameDocs(db, batch, {
    mode: 'practice',
    playerEntries: [
      { uid, displayName, photoURL },
      { uid: NC_BOT_UID, displayName: 'NeuroBot', photoURL: '', isBot: true },
    ],
    questionObjs: picked,
  });

  batch.set(
    userRef,
    { neurochainUsedQuestionIds: mergeUsedIds(usedArr, newIds), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  await batch.commit();
  return { gameId };
}

async function runEnqueue1v1(db, request) {
  const uid = assertAuthed(request);
  const ref = db.collection(COLLECTIONS.QUEUE).doc(uid);
  await ref.set({
    userId: uid,
    status: 'waiting',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

async function runLeaveQueue(db, request) {
  const uid = assertAuthed(request);
  await db.collection(COLLECTIONS.QUEUE).doc(uid).delete().catch(() => {});
  return { ok: true };
}

async function runTryMatch(db, request) {
  const uid = assertAuthed(request);
  const nowMs = Date.now();
  const windowStart = Timestamp.fromMillis(nowMs - MATCH_WINDOW_MS);

  const snap = await db
    .collection(COLLECTIONS.QUEUE)
    .where('status', '==', 'waiting')
    .where('createdAt', '>=', windowStart)
    .orderBy('createdAt', 'asc')
    .limit(25)
    .get();

  const peers = snap.docs.filter((d) => d.id !== uid && d.data()?.userId && d.data().userId !== uid);
  if (peers.length === 0) {
    return { matched: false };
  }

  const peerId = peers[0].id;

  const pool = getQuestionPool();
  const [u1snap, u2snap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(peerId).get(),
  ]);
  const used1 = new Set((u1snap.data()?.neurochainUsedQuestionIds || []).map(String));
  const used2 = new Set((u2snap.data()?.neurochainUsedQuestionIds || []).map(String));
  const usedUnion = new Set([...used1, ...used2]);
  const picked = pickSessionQuestions(pool, usedUnion);
  const newIds = picked.map((q) => q.id);

  const gameRef = db.collection(COLLECTIONS.GAMES).doc();
  const gameId = gameRef.id;
  const secretRef = db.collection(COLLECTIONS.SECRETS).doc(gameId);

  const [n1, n2] = await Promise.all([displayNameFor(db, uid), displayNameFor(db, peerId)]);
  const p1 = u1snap.data()?.photoURL ? String(u1snap.data().photoURL) : '';
  const p2 = u2snap.data()?.photoURL ? String(u2snap.data().photoURL) : '';

  const deduct1 = await tryDeductGameEntryFee(db, uid, 'neurochain');
  if (!deduct1.ok) {
    throw new HttpsError('failed-precondition', deduct1.error || 'Insufficient coins');
  }
  const deduct2 = await tryDeductGameEntryFee(db, peerId, 'neurochain');
  if (!deduct2.ok) {
    await refundGameEntryFee(db, uid, deduct1.entryFee);
    return { matched: false };
  }

  try {
    await db.runTransaction(async (tx) => {
      const [selfSnap, peerSnap, ru1, ru2] = await Promise.all([
        tx.get(db.collection(COLLECTIONS.QUEUE).doc(uid)),
        tx.get(db.collection(COLLECTIONS.QUEUE).doc(peerId)),
        tx.get(db.collection('users').doc(uid)),
        tx.get(db.collection('users').doc(peerId)),
      ]);
      if (!selfSnap.exists || selfSnap.data()?.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'Not in queue.');
      }
      if (!peerSnap.exists || peerSnap.data()?.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'Peer left queue.');
      }

      const t0 = Timestamp.now();
      const ends = Timestamp.fromMillis(t0.toMillis() + DEFAULT_QUESTION_MS);

      const sorted = [uid, peerId].sort();
      const [firstUid, secondUid] = sorted;
      const firstName = firstUid === uid ? n1 : n2;
      const secondName = firstUid === uid ? n2 : n1;
      const firstPhoto = firstUid === uid ? p1 : p2;
      const secondPhoto = firstUid === uid ? p2 : p1;

      tx.set(secretRef, { correctIndices: picked.map((q) => q.correctIndex), picks: {} });
      tx.set(gameRef, {
        gameType: 'neurochain',
        schemaVersion: SCHEMA_VERSION,
        mode: '1v1',
        status: 'active',
        players: [
          { uid: firstUid, displayName: firstName, photoURL: firstPhoto },
          { uid: secondUid, displayName: secondName, photoURL: secondPhoto },
        ],
        playerIds: sorted,
        currentQuestionIndex: 0,
        questions: picked.map(publicQuestion),
        questionMs: DEFAULT_QUESTION_MS,
        questionStartedAt: t0,
        questionEndsAt: ends,
        submissionStatus: {},
        answers: {},
        scores: { [firstUid]: 0, [secondUid]: 0 },
        correctCount: { [firstUid]: 0, [secondUid]: 0 },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.delete(db.collection(COLLECTIONS.QUEUE).doc(uid));
      tx.delete(db.collection(COLLECTIONS.QUEUE).doc(peerId));

      const merged1 = mergeUsedIds(ru1.data()?.neurochainUsedQuestionIds, newIds);
      const merged2 = mergeUsedIds(ru2.data()?.neurochainUsedQuestionIds, newIds);
      tx.set(
        db.collection('users').doc(uid),
        { neurochainUsedQuestionIds: merged1, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(peerId),
        { neurochainUsedQuestionIds: merged2, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    return { matched: false };
  }

  return { matched: true, gameId };
}

/**
 * Invite games use deterministic doc id === Firestore matches/{matchId} id (single game per match).
 */
async function runStartInviteFromMatch(db, request) {
  const uid = assertAuthed(request);
  const matchId = String(request.data?.matchId || '').trim();
  if (!matchId) throw new HttpsError('invalid-argument', 'matchId is required.');

  const matchRef = db.collection('matches').doc(matchId);
  const gameRef = db.collection(COLLECTIONS.GAMES).doc(matchId);
  const secretRef = db.collection(COLLECTIONS.SECRETS).doc(matchId);

  const pool = getQuestionPool();

  const result = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError('not-found', 'Match not found.');
    const m = matchSnap.data() || {};
    const gid = String(m.gameId || '').toLowerCase();
    if (gid !== 'neurochain' && gid !== 'neuro_chain') {
      throw new HttpsError('failed-precondition', 'Not a NeuroChain match.');
    }
    const pids = Array.isArray(m.playerIds) ? m.playerIds.map(String) : [];
    if (!pids.includes(uid)) throw new HttpsError('permission-denied', 'Not a player in this match.');
    if (pids.length < 2) throw new HttpsError('failed-precondition', 'Waiting for opponent.');

    const existingGame = await tx.get(gameRef);
    if (existingGame.exists) {
      const gd = existingGame.data() || {};
      if (gd.gameType === 'neurochain' && String(gd.inviteMatchId || '') === matchId) {
        return { gameId: matchId, reused: true };
      }
      throw new HttpsError('already-exists', 'This game id is already in use for a different session.');
    }

    const uReads = await Promise.all(pids.map((id) => tx.get(db.collection('users').doc(id))));
    const usedUnion = new Set();
    uReads.forEach((s) => {
      (s.data()?.neurochainUsedQuestionIds || []).forEach((x) => usedUnion.add(String(x)));
    });
    const picked = pickSessionQuestions(pool, usedUnion);
    const newIds = picked.map((q) => q.id);

    const idToName = {};
    const idToPhoto = {};
    pids.forEach((id, i) => {
      const d = uReads[i].data();
      idToName[id] = displayNameFromUserDoc(d, id);
      idToPhoto[id] = d?.photoURL ? String(d.photoURL) : '';
    });

    const t0 = Timestamp.now();
    const ends = Timestamp.fromMillis(t0.toMillis() + DEFAULT_QUESTION_MS);

    const sorted = [...pids].sort();
    const players = sorted.map((id) => ({
      uid: id,
      displayName: idToName[id] || id,
      photoURL: idToPhoto[id] || '',
    }));

    tx.set(secretRef, { correctIndices: picked.map((q) => q.correctIndex), picks: {} });
    tx.set(gameRef, {
      gameType: 'neurochain',
      schemaVersion: SCHEMA_VERSION,
      mode: 'invite',
      inviteMatchId: matchId,
      status: 'active',
      players,
      playerIds: sorted,
      currentQuestionIndex: 0,
      questions: picked.map(publicQuestion),
      questionMs: DEFAULT_QUESTION_MS,
      questionStartedAt: t0,
      questionEndsAt: ends,
      submissionStatus: {},
      answers: {},
      scores: Object.fromEntries(sorted.map((id) => [id, 0])),
      correctCount: Object.fromEntries(sorted.map((id) => [id, 0])),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const idToUserSnap = {};
    pids.forEach((id, i) => {
      idToUserSnap[id] = uReads[i];
    });
    sorted.forEach((id) => {
      const uref = db.collection('users').doc(id);
      const arr = idToUserSnap[id]?.data()?.neurochainUsedQuestionIds;
      tx.set(
        uref,
        { neurochainUsedQuestionIds: mergeUsedIds(arr, newIds), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    });

    tx.update(matchRef, { neurochainGameId: matchId, updatedAt: FieldValue.serverTimestamp() });
    return { gameId: matchId, reused: false };
  });

  return { gameId: result.gameId, reused: !!result.reused };
}

/** Merge picks in secret; fill 1v1 timeouts into secret picks when past deadline. */
function mergeSecretPicks(secData, nodeKey, uid, selectedIndex, now) {
  const picks = { ...(secData.picks || {}) };
  const nk = { ...(picks[nodeKey] || {}) };
  nk[uid] = { selectedIndex, at: now };
  picks[nodeKey] = nk;
  return picks;
}

/** Public `submissionStatus` mirrors secret picks for this node (timeouts, bot, etc.). */
function submissionStatusForNodeFromPicks(g, nodeKey, picksRoot, fallbackNow) {
  const sub = { ...(g.submissionStatus || {}) };
  const nodePicks = picksRoot[nodeKey] || {};
  const nkSub = { ...(sub[nodeKey] || {}) };
  Object.entries(nodePicks).forEach(([pid, row]) => {
    if (row && row.selectedIndex !== undefined && !nkSub[pid]) {
      nkSub[pid] = { lockedAt: row.at || fallbackNow, timedOut: Boolean(row.timedOut) };
    }
  });
  sub[nodeKey] = nkSub;
  return sub;
}

/**
 * Fill missing human picks with -1 in secret when past deadline (1v1).
 * `secData.picks` must already include this player's new pick for the node.
 */
function applyTimeoutPicksToSecret(secData, nodeKey, humanIds, now, endMs, graceMs) {
  const picks = { ...(secData.picks || {}) };
  const nk = { ...(picks[nodeKey] || {}) };
  const nowMs = now.toMillis();
  const deadlineMs = endMs + graceMs;
  if (nowMs <= deadlineMs) {
    picks[nodeKey] = nk;
    return picks;
  }
  humanIds.forEach((hid) => {
    if (!nk[hid]) {
      nk[hid] = { selectedIndex: -1, at: now, timedOut: true };
    }
  });
  picks[nodeKey] = nk;
  return picks;
}

/**
 * Returns true if node fully resolved and game advanced or finished.
 */
function tryResolveNodeRound(tx, gameRef, secretRef, g, secData, idx, questionObj) {
  const nodeKey = String(idx);
  const pids = Array.isArray(g.playerIds) ? g.playerIds.map(String) : [];
  const isPractice = pids.includes(NC_BOT_UID);
  const humanIds = pids.filter((id) => id !== NC_BOT_UID);
  const picks = secData.picks?.[nodeKey] || {};
  const correctIdx = secData.correctIndices?.[idx];
  if (correctIdx === undefined || !questionObj) return false;

  if (isPractice) {
    const h = humanIds[0];
    if (!h || !picks[h] || !picks[NC_BOT_UID]) return false;
  } else if (humanIds.length < 2) {
    return false;
  } else if (!picks[humanIds[0]] || !picks[humanIds[1]]) {
    return false;
  }

  const endMs = g.questionEndsAt?.toMillis?.() ?? Date.now();
  const now = Timestamp.now();
  const nowMs = now.toMillis();

  const roundSummary = {};
  let lastReveal = {};
  const scoreDeltas = {};
  const correctInc = {};

  const idsToScore = isPractice ? [...humanIds, NC_BOT_UID] : [...humanIds];
  idsToScore.forEach((pid) => {
    const row = picks[pid];
    const ch = Number(row?.selectedIndex);
    const submittedAtMs = Math.min(row?.at?.toMillis?.() ?? nowMs, endMs);
    const corr = ch >= 0 && ch === correctIdx;
    const d = scoreDeltaForAnswer(corr, submittedAtMs, endMs);
    roundSummary[pid] = { correct: corr, delta: d };
    lastReveal[pid] = { correct: corr };
    scoreDeltas[pid] = d;
    if (corr) correctInc[pid] = 1;
  });

  const scores = { ...(g.scores || {}) };
  Object.keys(scoreDeltas).forEach((pid) => {
    scores[pid] = (scores[pid] || 0) + scoreDeltas[pid];
  });
  const correctCount = { ...(g.correctCount || {}) };
  Object.keys(correctInc).forEach((pid) => {
    if (correctInc[pid]) correctCount[pid] = (correctCount[pid] || 0) + 1;
  });

  const answers = { ...(g.answers || {}) };
  answers[nodeKey] = { resolved: true, byUser: roundSummary };

  const nextIdx = idx + 1;
  if (nextIdx >= NODES_PER_MATCH) {
    const entries = Object.entries(scores);
    let winnerUid = null;
    if (entries.length >= 2) {
      entries.sort((a, b) => b[1] - a[1]);
      if (entries[0][1] > entries[1][1]) winnerUid = entries[0][0];
    }
    tx.update(gameRef, {
      answers,
      scores,
      correctCount,
      lastReveal,
      practiceBotReadyAfter: FieldValue.delete(),
      status: 'finished',
      winnerUid,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  }

  const tNext = Timestamp.now();
  const endsNext = Timestamp.fromMillis(tNext.toMillis() + (g.questionMs || DEFAULT_QUESTION_MS));
  tx.update(gameRef, {
    answers,
    scores,
    correctCount,
    lastReveal,
    practiceBotReadyAfter: FieldValue.delete(),
    currentQuestionIndex: nextIdx,
    questionStartedAt: tNext,
    questionEndsAt: endsNext,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return true;
}

async function runSubmitAnswer(db, request) {
  const uid = assertAuthed(request);
  const gameId = String(request.data?.gameId || '').trim();
  const questionIndex = Number(request.data?.questionIndex);
  let selectedIndex = request.data?.selectedIndex;
  debugLog('H4', 'submit_answer_enter', {
    gameId,
    questionIndex,
    selectedIndex: selectedIndex === undefined ? 'undefined' : Number(selectedIndex),
    uidTail: String(uid).slice(-6),
  });
  if (!gameId || Number.isNaN(questionIndex)) {
    debugLog('H4', 'submit_answer_invalid_args', { gameId, questionIndex });
    throw new HttpsError('invalid-argument', 'gameId and questionIndex are required.');
  }
  if (selectedIndex !== null && selectedIndex !== undefined) {
    selectedIndex = Number(selectedIndex);
  } else {
    selectedIndex = -1;
  }

  const gameRef = db.collection(COLLECTIONS.GAMES).doc(gameId);
  const secretRef = db.collection(COLLECTIONS.SECRETS).doc(gameId);

  await db.runTransaction(async (tx) => {
    const [gameSnap, secretSnap] = await Promise.all([tx.get(gameRef), tx.get(secretRef)]);
    if (!gameSnap.exists || !secretSnap.exists) {
      debugLog('H4', 'submit_answer_game_or_secret_missing', { gameExists: gameSnap.exists, secretExists: secretSnap.exists });
      throw new HttpsError('not-found', 'Game not found.');
    }
    const g = gameSnap.data() || {};
    if (g.schemaVersion !== SCHEMA_VERSION) {
      debugLog('H5', 'submit_answer_schema_mismatch', { schemaVersion: g.schemaVersion, expected: SCHEMA_VERSION });
      throw new HttpsError('failed-precondition', 'This game uses an older schema. Start a new match.');
    }
    if (g.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Game is not active.');
    }
    const pids = Array.isArray(g.playerIds) ? g.playerIds.map(String) : [];
    if (!pids.includes(uid)) throw new HttpsError('permission-denied', 'Not a player.');
    const idx = Number(g.currentQuestionIndex);
    if (idx !== questionIndex) {
      debugLog('H5', 'submit_answer_question_mismatch', { currentQuestionIndex: idx, requestQuestionIndex: questionIndex });
      throw new HttpsError('failed-precondition', 'Question index mismatch.');
    }

    const now = Timestamp.now();
    const nowMs = now.toMillis();
    const endMs = g.questionEndsAt?.toMillis?.() ?? nowMs + DEFAULT_QUESTION_MS;
    const deadlineMs = endMs + ANSWER_GRACE_MS;

    const nodeKey = String(idx);
    let secData = secretSnap.data() || {};
    const existingPick = secData.picks?.[nodeKey]?.[uid];
    if (existingPick) {
      throw new HttpsError('already-exists', 'Already answered this node.');
    }

    const subStatus = g.submissionStatus?.[nodeKey]?.[uid];
    if (subStatus?.lockedAt) {
      throw new HttpsError('already-exists', 'Already answered this node.');
    }

    let chosen = selectedIndex;
    if (chosen < 0 || chosen > 3) {
      if (nowMs > deadlineMs) {
        chosen = -1;
      } else {
        throw new HttpsError('invalid-argument', 'Invalid answer or too early to skip.');
      }
    } else if (nowMs > deadlineMs) {
      chosen = -1;
    }

    const correctIdx = secData.correctIndices?.[idx];
    if (correctIdx === undefined) throw new HttpsError('failed-precondition', 'Invalid game state.');

    const q = (g.questions || [])[idx];
    if (!q) throw new HttpsError('failed-precondition', 'Missing question.');
    const isPractice = pids.includes(NC_BOT_UID);
    debugLog('H4', 'submit_answer_state_validated', {
      idx,
      mode: String(g.mode || ''),
      status: String(g.status || ''),
      isPractice: Boolean(isPractice),
    });

    let picks = mergeSecretPicks(secData, nodeKey, uid, chosen, now);
    secData = { ...secData, picks };

    const humanIds = pids.filter((id) => id !== NC_BOT_UID);

    if (!isPractice) {
      picks = applyTimeoutPicksToSecret({ ...secData, picks }, nodeKey, humanIds, now, endMs, ANSWER_GRACE_MS);
      secData = { ...secData, picks };
    }

    const submissionStatus = submissionStatusForNodeFromPicks(g, nodeKey, picks, now);

    const patch = {
      submissionStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (isPractice && uid !== NC_BOT_UID) {
      const tier = nodeTier(idx);
      const delayMs = randomInt(botUiDelayRangeMs(tier).min, botUiDelayRangeMs(tier).max);
      patch.practiceBotReadyAfter = Timestamp.fromMillis(nowMs + delayMs);
    }

    tx.update(secretRef, { picks });
    tx.update(gameRef, patch);
    debugLog('H4', 'submit_answer_updates_written', {
      idx,
      isPractice: Boolean(isPractice),
      chosen,
      pidsCount: pids.length,
    });

    const g2Snap = await tx.get(gameRef);
    const s2Snap = await tx.get(secretRef);
    const g2 = g2Snap.data() || {};
    const s2 = s2Snap.data() || {};

    if (isPractice) {
      const pk = s2.picks?.[nodeKey] || {};
      if (!pk[NC_BOT_UID] && uid !== NC_BOT_UID) {
        return;
      }
    } else {
      const pk = s2.picks?.[nodeKey] || {};
      if (!humanIds.every((h) => pk[h])) {
        return;
      }
    }

    tryResolveNodeRound(tx, gameRef, secretRef, g2, s2, idx, q);
  });

  debugLog('H4', 'submit_answer_exit_ok', { gameId, questionIndex });
  return { ok: true };
}

async function runProcessBotTurn(db, request) {
  const uid = assertAuthed(request);
  const gameId = String(request.data?.gameId || '').trim();
  if (!gameId) throw new HttpsError('invalid-argument', 'gameId is required.');

  const gameRef = db.collection(COLLECTIONS.GAMES).doc(gameId);
  const secretRef = db.collection(COLLECTIONS.SECRETS).doc(gameId);

  await db.runTransaction(async (tx) => {
    const [gameSnap, secretSnap] = await Promise.all([tx.get(gameRef), tx.get(secretRef)]);
    if (!gameSnap.exists || !secretSnap.exists) throw new HttpsError('not-found', 'Game not found.');
    const g = gameSnap.data() || {};
    if (g.schemaVersion !== SCHEMA_VERSION) {
      throw new HttpsError('failed-precondition', 'This game uses an older schema. Start a new match.');
    }
    if (g.status !== 'active') return;
    const pids = Array.isArray(g.playerIds) ? g.playerIds.map(String) : [];
    if (!pids.includes(NC_BOT_UID)) throw new HttpsError('failed-precondition', 'Not a practice game.');
    const humanIds = pids.filter((id) => id !== NC_BOT_UID);
    const h = humanIds[0];
    if (!h || uid !== h) throw new HttpsError('permission-denied', 'Only the human player can request the bot turn.');
    const idx = Number(g.currentQuestionIndex);
    const nodeKey = String(idx);
    const secData = secretSnap.data() || {};
    const pk = secData.picks?.[nodeKey] || {};
    if (!pk[h]) throw new HttpsError('failed-precondition', 'Human has not submitted yet.');
    if (pk[NC_BOT_UID]) return;

    const nowMs = Date.now();
    const readyAfter = g.practiceBotReadyAfter?.toMillis?.() ?? 0;
    const started = g.questionStartedAt?.toMillis?.() ?? 0;
    const tierMin = botUiDelayRangeMs(nodeTier(idx)).min;
    if (nowMs < Math.max(readyAfter, started + tierMin)) {
      throw new HttpsError('failed-precondition', 'Bot is not ready yet.');
    }

    const correctIdx = secData.correctIndices?.[idx];
    const q = (g.questions || [])[idx];
    if (correctIdx === undefined || !q) throw new HttpsError('failed-precondition', 'Invalid round state.');

    const botIdx = computeBotIndex(correctIdx, q.options.length);
    const now = Timestamp.now();
    let picks = mergeSecretPicks(secData, nodeKey, NC_BOT_UID, botIdx, now);
    const secMerged = { ...secData, picks };
    tx.update(secretRef, { picks: secMerged.picks });
    tx.update(gameRef, {
      submissionStatus: submissionStatusForNodeFromPicks(g, nodeKey, secMerged.picks, now),
      practiceBotReadyAfter: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const g2Snap = await tx.get(gameRef);
    const s2Snap = await tx.get(secretRef);
    tryResolveNodeRound(tx, gameRef, secretRef, g2Snap.data() || {}, s2Snap.data() || {}, idx, q);
  });

  return { ok: true };
}

async function runResolveRoundIfStale(db, request) {
  const uid = assertAuthed(request);
  const gameId = String(request.data?.gameId || '').trim();
  if (!gameId) throw new HttpsError('invalid-argument', 'gameId is required.');

  const gameRef = db.collection(COLLECTIONS.GAMES).doc(gameId);
  const secretRef = db.collection(COLLECTIONS.SECRETS).doc(gameId);

  await db.runTransaction(async (tx) => {
    const [gameSnap, secretSnap] = await Promise.all([tx.get(gameRef), tx.get(secretRef)]);
    if (!gameSnap.exists || !secretSnap.exists) return;
    const g = gameSnap.data() || {};
    if (g.schemaVersion !== SCHEMA_VERSION || g.status !== 'active') return;
    const pids = Array.isArray(g.playerIds) ? g.playerIds.map(String) : [];
    if (!pids.includes(uid)) throw new HttpsError('permission-denied', 'Not a player.');

    const idx = Number(g.currentQuestionIndex);
    const nodeKey = String(idx);
    const now = Timestamp.now();
    const nowMs = now.toMillis();
    const endMs = g.questionEndsAt?.toMillis?.() ?? nowMs;
    const deadlineMs = endMs + ANSWER_GRACE_MS;
    const secData = secretSnap.data() || {};
    const humanIds = pids.filter((id) => id !== NC_BOT_UID);
    const isPractice = pids.includes(NC_BOT_UID);

    let picks = { ...(secData.picks || {}) };
    let nk = { ...(picks[nodeKey] || {}) };

    if (!isPractice && nowMs > deadlineMs) {
      humanIds.forEach((hid) => {
        if (!nk[hid]) nk[hid] = { selectedIndex: -1, at: now, timedOut: true };
      });
      picks[nodeKey] = nk;
      tx.update(secretRef, { picks });
      tx.update(gameRef, {
        submissionStatus: submissionStatusForNodeFromPicks(g, nodeKey, picks, now),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (isPractice) {
      const h = humanIds[0];
      if (h && nk[h] && !nk[NC_BOT_UID]) {
        const readyAfter = g.practiceBotReadyAfter?.toMillis?.() ?? 0;
        const started = g.questionStartedAt?.toMillis?.() ?? 0;
        const tierMin = botUiDelayRangeMs(nodeTier(idx)).min;
        if (nowMs >= Math.max(readyAfter, started + tierMin)) {
          const correctIdx = secData.correctIndices?.[idx];
          const q = (g.questions || [])[idx];
          if (correctIdx !== undefined && q) {
            const botIdx = computeBotIndex(correctIdx, q.options.length);
            nk = { ...nk, [NC_BOT_UID]: { selectedIndex: botIdx, at: now } };
            picks[nodeKey] = nk;
            tx.update(secretRef, { picks });
            tx.update(gameRef, {
              submissionStatus: submissionStatusForNodeFromPicks(g, nodeKey, picks, now),
              practiceBotReadyAfter: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      }
    }

    const g2Snap = await tx.get(gameRef);
    const s2Snap = await tx.get(secretRef);
    const g2 = g2Snap.data() || {};
    const s2 = s2Snap.data() || {};
    const q = (g2.questions || [])[idx];
    const pk2 = s2.picks?.[nodeKey] || {};
    if (isPractice) {
      const h = humanIds[0];
      if (!h || !pk2[h] || !pk2[NC_BOT_UID]) return;
    } else if (!humanIds.every((h) => pk2[h])) {
      return;
    }
    tryResolveNodeRound(tx, gameRef, secretRef, g2, s2, idx, q);
  });

  return { ok: true };
}

module.exports = {
  runStartPractice,
  runEnqueue1v1,
  runLeaveQueue,
  runTryMatch,
  runStartInviteFromMatch,
  runSubmitAnswer,
  runProcessBotTurn,
  runResolveRoundIfStale,
};
