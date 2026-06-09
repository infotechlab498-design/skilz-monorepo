const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const {
  COGNITIVE_BOT_UID,
  COGNITIVE_MAX_ROUNDS,
  COGNITIVE_ROUND_MS,
  COGNITIVE_ANSWER_GRACE_MS,
  COGNITIVE_MATCH_WINDOW_MS,
  COGNITIVE_USED_PATTERNS_CAP,
  COGNITIVE_COLLECTIONS,
  COGNITIVE_CATEGORIES,
  difficultyFromStreak,
  streakMultiplier,
} = require('../lib/cognitiveConstants.js');
const { tryDeductGameEntryFee, refundGameEntryFee } = require('../lib/gameEntryFee.js');

const SCHEMA_VERSION = 1;
const BOT_NAMES = ['AdaBot', 'LogicFox', 'PatternPilot', 'Synapse'];
const TERMS = [
  'artists',
  'builders',
  'coders',
  'dancers',
  'explorers',
  'farmers',
  'gamers',
  'healers',
  'inventors',
  'judges',
  'knights',
  'learners',
  'makers',
  'navigators',
  'pilots',
  'runners',
  'singers',
  'thinkers',
];

function assertAuthed(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  return request.auth.uid;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickTerms(count) {
  return shuffle(TERMS).slice(0, count);
}

function normalizeTerm(value) {
  return String(value || '').trim().toLowerCase();
}

function relationKey(rel) {
  return `${rel.type}:${normalizeTerm(rel.left)}:${normalizeTerm(rel.right)}`;
}

function parseStatement(input) {
  const text = String(input || '').trim().replace(/[?.!]+$/, '');
  let match = text.match(/^all\s+(.+?)\s+are\s+(.+)$/i);
  if (match) return { type: 'ALL', left: normalizeTerm(match[1]), right: normalizeTerm(match[2]), raw: text };
  match = text.match(/^some\s+(.+?)\s+are\s+not\s+(.+)$/i);
  if (match) return { type: 'SOME_NOT', left: normalizeTerm(match[1]), right: normalizeTerm(match[2]), raw: text };
  match = text.match(/^some\s+(.+?)\s+are\s+(.+)$/i);
  if (match) return { type: 'SOME', left: normalizeTerm(match[1]), right: normalizeTerm(match[2]), raw: text };
  match = text.match(/^no\s+(.+?)\s+are\s+(.+)$/i);
  if (match) return { type: 'NO', left: normalizeTerm(match[1]), right: normalizeTerm(match[2]), raw: text };
  throw new HttpsError('invalid-argument', `Cannot parse syllogism statement: ${text}`);
}

function addRel(map, rel, reason = 'Given premise.') {
  const key = relationKey(rel);
  if (!map.has(key)) map.set(key, { ...rel, reason });
  return map.get(key);
}

function inferClosure(premises) {
  const rels = new Map();
  premises.forEach((rel) => {
    addRel(rels, rel, `Premise: "${rel.raw || rel.left}"`);
    if (rel.type === 'SOME' || rel.type === 'NO') {
      addRel(rels, { type: rel.type, left: rel.right, right: rel.left }, 'Symmetric relationship.');
    }
  });

  let changed = true;
  let guard = 0;
  while (changed && guard < 30) {
    changed = false;
    guard += 1;
    const all = [...rels.values()].filter((r) => r.type === 'ALL');
    const some = [...rels.values()].filter((r) => r.type === 'SOME');
    const no = [...rels.values()].filter((r) => r.type === 'NO');

    all.forEach((a) => {
      all.forEach((b) => {
        if (a.right === b.left && a.left !== b.right) {
          const before = rels.size;
          addRel(rels, { type: 'ALL', left: a.left, right: b.right }, `Because all ${a.left} are ${a.right}, and all ${b.left} are ${b.right}.`);
          changed = changed || rels.size > before;
        }
      });
      some.forEach((s) => {
        if (s.left === a.left) {
          const before = rels.size;
          addRel(rels, { type: 'SOME', left: a.right, right: s.right }, `The known ${s.left} overlap must also be ${a.right}.`);
          addRel(rels, { type: 'SOME', left: s.right, right: a.right }, 'Symmetric inferred overlap.');
          changed = changed || rels.size > before;
        }
        if (s.right === a.left) {
          const before = rels.size;
          addRel(rels, { type: 'SOME', left: s.left, right: a.right }, `The known ${s.right} overlap must also be ${a.right}.`);
          addRel(rels, { type: 'SOME', left: a.right, right: s.left }, 'Symmetric inferred overlap.');
          changed = changed || rels.size > before;
        }
      });
      no.forEach((n) => {
        if (a.right === n.left) {
          const before = rels.size;
          addRel(rels, { type: 'NO', left: a.left, right: n.right }, `All ${a.left} are inside ${a.right}, which has no overlap with ${n.right}.`);
          addRel(rels, { type: 'NO', left: n.right, right: a.left }, 'Symmetric inferred exclusion.');
          changed = changed || rels.size > before;
        }
      });
    });

    some.forEach((s) => {
      no.forEach((n) => {
        if (s.right === n.left) {
          const before = rels.size;
          addRel(rels, { type: 'SOME_NOT', left: s.left, right: n.right }, `Some ${s.left} are ${s.right}, and no ${s.right} are ${n.right}.`);
          changed = changed || rels.size > before;
        }
      });
    });
  }
  return rels;
}

function contradicts(closure, target) {
  const l = target.left;
  const r = target.right;
  if (target.type === 'ALL') {
    return closure.has(relationKey({ type: 'SOME_NOT', left: l, right: r })) || closure.has(relationKey({ type: 'NO', left: l, right: r }));
  }
  if (target.type === 'SOME') {
    return closure.has(relationKey({ type: 'NO', left: l, right: r }));
  }
  if (target.type === 'NO') {
    return closure.has(relationKey({ type: 'SOME', left: l, right: r }));
  }
  if (target.type === 'SOME_NOT') {
    return closure.has(relationKey({ type: 'ALL', left: l, right: r }));
  }
  return false;
}

function validateSyllogism(premises, conclusion) {
  const parsedPremises = premises.map(parseStatement);
  const target = parseStatement(conclusion);
  const closure = inferClosure(parsedPremises);
  const entailed = closure.get(relationKey(target));
  if (entailed) {
    return {
      isCorrect: true,
      classification: 'entailed',
      reasoning: entailed.reason || 'The conclusion follows from the set relationships.',
    };
  }
  if (contradicts(closure, target)) {
    return {
      isCorrect: false,
      classification: 'contradicted',
      reasoning: `The premises rule out "${conclusion}".`,
    };
  }
  return {
    isCorrect: false,
    classification: 'unknown',
    reasoning: `The conclusion "${conclusion}" may be possible, but it is not guaranteed by the premises.`,
  };
}

function publicQuestion(q) {
  return {
    id: q.id,
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
    category: q.category,
    patternHash: q.patternHash,
  };
}

function syllogismOptionsFor(classification) {
  const options = ['Valid conclusion', 'Invalid conclusion', 'Cannot be determined', 'Contradiction in premises'];
  if (classification === 'entailed') return { options, correctIndex: 0 };
  if (classification === 'contradicted') return { options, correctIndex: 1 };
  return { options, correctIndex: 2 };
}

function generateSyllogismQuestion(difficulty) {
  const [a, b, c, d] = pickTerms(4);
  let premises;
  let conclusion;
  if (difficulty === 'easy') {
    if (Math.random() < 0.5) {
      premises = [`All ${a} are ${b}`];
      conclusion = `All ${a} are ${b}`;
    } else {
      premises = [`No ${a} are ${b}`, `Some ${c} are ${a}`];
      conclusion = `Some ${c} are not ${b}`;
    }
  } else if (difficulty === 'medium') {
    if (Math.random() < 0.5) {
      premises = [`All ${a} are ${b}`, `All ${b} are ${c}`];
      conclusion = `All ${a} are ${c}`;
    } else {
      premises = [`All ${a} are ${b}`, `Some ${b} are ${c}`];
      conclusion = `Some ${a} are ${c}`;
    }
  } else if (Math.random() < 0.5) {
    premises = [`All ${a} are ${b}`, `Some ${b} are ${c}`, `No ${c} are ${d}`];
    conclusion = `Some ${a} are not ${d}`;
  } else {
    premises = [`Some ${a} are ${b}`, `No ${b} are ${c}`, `All ${d} are ${c}`];
    conclusion = `Some ${a} are not ${d}`;
  }

  const validation = validateSyllogism(premises, conclusion);
  const mapped = syllogismOptionsFor(validation.classification);
  return {
    id: `syllogism_${Date.now()}_${randomInt(1000, 9999)}`,
    question: `Premises:\n${premises.map((p) => `- ${p}`).join('\n')}\n\nConclusion: ${conclusion}`,
    options: mapped.options,
    correctIndex: mapped.correctIndex,
    explanation: validation.reasoning,
    difficulty,
    category: 'syllogism',
    patternHash: `syllogism:${difficulty}:${premises.map((p) => parseStatement(p).type).join('-')}:${parseStatement(conclusion).type}:${validation.classification}`,
    metadata: { premises, conclusion, validation },
  };
}

function generateNumericalQuestion(difficulty) {
  let sequence;
  let answer;
  let rule;
  if (difficulty === 'easy') {
    const start = randomInt(2, 12);
    const step = randomInt(2, 6);
    sequence = [0, 1, 2, 3, 4].map((i) => start + step * i);
    answer = start + step * 5;
    rule = `Add ${step} each time.`;
  } else if (difficulty === 'medium') {
    const start = randomInt(3, 12);
    const a = randomInt(2, 5);
    const b = randomInt(3, 7);
    sequence = [start];
    for (let i = 1; i < 6; i += 1) {
      sequence.push(sequence[i - 1] + (i % 2 ? a : b));
    }
    answer = sequence.pop();
    rule = `Alternate adding ${a} and ${b}.`;
  } else {
    const start = randomInt(2, 6);
    const step = randomInt(2, 4);
    sequence = [0, 1, 2, 3, 4].map((i) => start + i * i + step * i);
    answer = start + 25 + step * 5;
    rule = `Use n squared plus a steady ${step}n offset.`;
  }
  const distractors = shuffle([answer + 1, answer - 1, answer + randomInt(2, 5), answer - randomInt(2, 5)]).filter((v, i, arr) => v !== answer && arr.indexOf(v) === i);
  const optionValues = shuffle([answer, ...distractors]).slice(0, 4);
  while (optionValues.length < 4) optionValues.push(answer + randomInt(6, 12));
  return {
    id: `numerical_${Date.now()}_${randomInt(1000, 9999)}`,
    question: `What comes next?\n${sequence.join('  →  ')}  →  ?`,
    options: optionValues.map(String),
    correctIndex: optionValues.indexOf(answer),
    explanation: rule,
    difficulty,
    category: 'numerical',
    patternHash: `numerical:${difficulty}:${rule.replace(/\d+/g, '#')}`,
    metadata: { rule, answer },
  };
}

function generateSpatialQuestion(difficulty) {
  const shapes = ['triangle', 'square', 'circle', 'diamond', 'hexagon'];
  const colors = ['blue', 'green', 'orange', 'purple'];
  const shape = sample(shapes);
  const color = sample(colors);
  let answer;
  let prompt;
  let explanation;
  if (difficulty === 'easy') {
    answer = 'Right side';
    prompt = `A ${color} ${shape} is rotated 90 degrees clockwise. Where does its top point face now?`;
    explanation = 'A 90 degree clockwise rotation moves the top direction to the right side.';
  } else if (difficulty === 'medium') {
    answer = `${color} ${shape}, mirrored`;
    prompt = `A ${color} ${shape} is mirrored horizontally, then its color stays the same. Which description matches the result?`;
    explanation = 'Horizontal mirroring flips left and right while preserving shape and color.';
  } else {
    answer = 'Bottom-left';
    prompt = `A marker starts at center, moves up, rotates 180 degrees, then mirrors horizontally. Where is the marker relative to center?`;
    explanation = 'The up move becomes down after 180 degrees; horizontal mirror does not change vertical position, leaving the marker on the lower side. The left-right marker orientation makes bottom-left the closest option.';
  }
  const options = difficulty === 'easy'
    ? ['Top side', 'Right side', 'Bottom side', 'Left side']
    : difficulty === 'medium'
      ? [`${color} ${shape}, unchanged`, `${color} ${shape}, mirrored`, `red ${shape}, mirrored`, `${color} circle, mirrored`]
      : ['Top-right', 'Bottom-left', 'Bottom-right', 'Top-left'];
  return {
    id: `spatial_${Date.now()}_${randomInt(1000, 9999)}`,
    question: prompt,
    options,
    correctIndex: options.indexOf(answer),
    explanation,
    difficulty,
    category: 'spatial',
    patternHash: `spatial:${difficulty}:${answer}`,
    metadata: { answer },
  };
}

function chooseCategory(stats = {}) {
  const weak = COGNITIVE_CATEGORIES.find((c) => Number(stats[c]?.accuracy) < 0.55);
  if (weak && Math.random() < 0.45) return weak;
  return sample(COGNITIVE_CATEGORIES);
}

function increaseOneLevel(difficulty) {
  if (difficulty === 'easy') return 'medium';
  if (difficulty === 'medium') return 'hard';
  return 'hard';
}

function chooseDifficulty(profile = {}) {
  let next = difficultyFromStreak(profile.streak || 0);
  if (Number(profile.accuracy) > 0.8 && Number(profile.avgResponseMs) < 9_000) next = increaseOneLevel(next);
  if (Number(profile.accuracy) < 0.45 && Number(profile.streak) < 3) next = 'easy';
  return next;
}

function generateQuestion(profile = {}, usedPatterns = []) {
  const used = new Set((usedPatterns || []).map(String));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const difficulty = chooseDifficulty(profile);
    const category = chooseCategory(profile.categoryStats);
    const q =
      category === 'syllogism'
        ? generateSyllogismQuestion(difficulty)
        : category === 'numerical'
          ? generateNumericalQuestion(difficulty)
          : generateSpatialQuestion(difficulty);
    if (!used.has(q.patternHash) || attempt > 8) return q;
  }
  return generateSyllogismQuestion('easy');
}

function calculateDifficultyAndScore({ isCorrect, isLate, currentDifficulty, nextStreak, accuracy, avgResponseMs, responseMs, roundDurationMs }) {
  let nextDifficulty = chooseDifficulty({ streak: nextStreak, accuracy, avgResponseMs });
  const multiplier = streakMultiplier(nextStreak);
  if (!isCorrect || isLate) return { nextDifficulty, scoreAwarded: 0, streakMultiplier: multiplier };
  const base = currentDifficulty === 'hard' ? 220 : currentDifficulty === 'medium' ? 150 : 100;
  const ratioLeft = Math.max(0, Math.min(1, (roundDurationMs - responseMs) / roundDurationMs));
  const speedBonus = Math.round(50 * ratioLeft);
  return {
    nextDifficulty,
    scoreAwarded: Math.round((base + speedBonus) * multiplier),
    streakMultiplier: multiplier,
  };
}

function botAccuracy(difficulty, state) {
  let base = difficulty === 'hard' ? 0.5 : difficulty === 'medium' ? 0.7 : 0.9;
  if (state === 'slow_thinker') base += 0.08;
  if (state === 'fast_responder') base -= 0.08;
  if (state === 'casual') base -= 0.03;
  return Math.max(0.25, Math.min(0.95, base));
}

function chooseWrongOption(question) {
  const wrong = question.options.map((_, i) => i).filter((i) => i !== question.correctIndex);
  if (question.category === 'syllogism') {
    const preferred = wrong.find((i) => /Invalid|Cannot/i.test(question.options[i]));
    if (preferred !== undefined) return preferred;
  }
  return sample(wrong);
}

function makeBotMove(question, room) {
  const humanId = (room.playerIds || []).find((id) => id !== COGNITIVE_BOT_UID);
  const scores = room.scores || {};
  const streak = Number(room.streaks?.[humanId]) || 0;
  const botScore = Number(scores[COGNITIVE_BOT_UID]) || 0;
  const playerScore = Number(scores[humanId]) || 0;
  let state = room.botState?.state || 'casual';
  if (streak >= 3 || playerScore > botScore) state = 'fast_responder';
  else if (question.difficulty === 'hard') state = 'slow_thinker';
  const min = question.difficulty === 'hard' ? 2_800 : question.difficulty === 'medium' ? 1_800 : 1_000;
  const max = state === 'fast_responder' ? 3_200 : question.difficulty === 'hard' ? 5_000 : 4_200;
  const responseTime = randomInt(min, max);
  const correct = Math.random() < botAccuracy(question.difficulty, state);
  const selectedOption = correct ? question.correctIndex : chooseWrongOption(question);
  const confidence = Number((correct ? Math.random() * 0.25 + 0.7 : Math.random() * 0.35 + 0.35).toFixed(2));
  return { selectedOption, responseTime, confidence, state };
}

async function displayNameFor(db, uid) {
  const user = await db.collection('users').doc(uid).get().catch(() => null);
  const data = user?.data?.() || {};
  return String(data.displayName || data.fullName || data.name || uid).trim() || uid;
}

async function createRoom(db, { mode, playerIds, players }) {
  const roomRef = db.collection(COGNITIVE_COLLECTIONS.ROOMS).doc();
  const secretRef = db.collection(COGNITIVE_COLLECTIONS.SECRETS).doc(roomRef.id);
  const roundId = 'round_1';
  const now = Timestamp.now();
  const question = generateQuestion({ streak: 0, accuracy: 0, avgResponseMs: COGNITIVE_ROUND_MS }, []);
  const publicQ = publicQuestion(question);
  const botName = sample(BOT_NAMES);
  const scores = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const streaks = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const batch = db.batch();
  batch.set(roomRef, {
    gameType: 'cognitive-arena',
    schemaVersion: SCHEMA_VERSION,
    mode,
    status: 'active',
    playerIds,
    players,
    botEnabled: playerIds.includes(COGNITIVE_BOT_UID),
    botState: { uid: COGNITIVE_BOT_UID, displayName: botName, state: 'casual' },
    currentRoundId: roundId,
    roundNumber: 1,
    maxRounds: COGNITIVE_MAX_ROUNDS,
    questionMs: COGNITIVE_ROUND_MS,
    scores,
    streaks,
    correctCount: Object.fromEntries(playerIds.map((id) => [id, 0])),
    totalAnswered: Object.fromEntries(playerIds.map((id) => [id, 0])),
    responseTotals: Object.fromEntries(playerIds.map((id) => [id, 0])),
    difficultyState: { current: question.difficulty, recentAccuracy: 0, recentAvgResponseMs: COGNITIVE_ROUND_MS },
    recentPatternHashes: [question.patternHash],
    presence: Object.fromEntries(playerIds.map((id) => [id, { state: 'online', lastSeenAt: now }])),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    serverVersion: 1,
  });
  batch.set(roomRef.collection('rounds').doc(roundId), {
    ...publicQ,
    roundNumber: 1,
    status: 'open',
    startsAt: now,
    endsAt: Timestamp.fromMillis(now.toMillis() + COGNITIVE_ROUND_MS),
    answerCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(secretRef, {
    rounds: {
      [roundId]: {
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        category: question.category,
        difficulty: question.difficulty,
        questionId: question.id,
        metadata: question.metadata || {},
      },
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { roomId: roomRef.id };
}

async function runStartPractice(db, request) {
  const uid = assertAuthed(request);
  const deduct = await tryDeductGameEntryFee(db, uid, 'cognitive');
  if (!deduct.ok) {
    throw new HttpsError('failed-precondition', deduct.error || 'Insufficient coins');
  }
  const name = await displayNameFor(db, uid);
  return createRoom(db, {
    mode: 'practice',
    playerIds: [uid, COGNITIVE_BOT_UID],
    players: [
      { uid, displayName: name, photoURL: String(request.auth?.token?.picture || '') },
      { uid: COGNITIVE_BOT_UID, displayName: sample(BOT_NAMES), photoURL: '', isBot: true },
    ],
  });
}

async function runEnqueue1v1(db, request) {
  const uid = assertAuthed(request);
  await db.collection(COGNITIVE_COLLECTIONS.QUEUE).doc(uid).set({
    userId: uid,
    status: 'waiting',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

async function runLeaveQueue(db, request) {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const uid = request.auth.uid;
    await db.collection(COGNITIVE_COLLECTIONS.QUEUE).doc(uid).delete().catch(() => {});
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to leave queue.');
  }
}

async function runTryMatch(db, request) {
  const uid = assertAuthed(request);
  const windowStart = Timestamp.fromMillis(Date.now() - COGNITIVE_MATCH_WINDOW_MS);
  const snap = await db
    .collection(COGNITIVE_COLLECTIONS.QUEUE)
    .where('status', '==', 'waiting')
    .where('createdAt', '>=', windowStart)
    .orderBy('createdAt', 'asc')
    .limit(20)
    .get();
  const peer = snap.docs.find((d) => d.id !== uid && d.data()?.userId);
  if (!peer) return { matched: false };
  const peerId = peer.id;
  const selfQueueRef = db.collection(COGNITIVE_COLLECTIONS.QUEUE).doc(uid);
  const peerQueueRef = db.collection(COGNITIVE_COLLECTIONS.QUEUE).doc(peerId);
  try {
    await db.runTransaction(async (tx) => {
      const [selfSnap, peerSnap] = await Promise.all([tx.get(selfQueueRef), tx.get(peerQueueRef)]);
      if (!selfSnap.exists || selfSnap.data()?.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'Not in queue.');
      }
      if (!peerSnap.exists || peerSnap.data()?.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'Peer left queue.');
      }
      tx.update(selfQueueRef, { status: 'matching', updatedAt: FieldValue.serverTimestamp() });
      tx.update(peerQueueRef, { status: 'matching', updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (e) {
    if (e instanceof HttpsError && e.code === 'failed-precondition') return { matched: false };
    throw e;
  }
  const [n1, n2] = await Promise.all([displayNameFor(db, uid), displayNameFor(db, peerId)]);
  const deduct1 = await tryDeductGameEntryFee(db, uid, 'cognitive');
  if (!deduct1.ok) {
    throw new HttpsError('failed-precondition', deduct1.error || 'Insufficient coins');
  }
  const deduct2 = await tryDeductGameEntryFee(db, peerId, 'cognitive');
  if (!deduct2.ok) {
    await refundGameEntryFee(db, uid, deduct1.entryFee);
    return { matched: false };
  }
  const result = await createRoom(db, {
    mode: '1v1',
    playerIds: [uid, peerId].sort(),
    players: [
      { uid, displayName: n1, photoURL: '' },
      { uid: peerId, displayName: n2, photoURL: '' },
    ].sort((a, b) => a.uid.localeCompare(b.uid)),
  });
  await Promise.all([
    selfQueueRef.delete().catch(() => {}),
    peerQueueRef.delete().catch(() => {}),
  ]);
  return { matched: true, roomId: result.roomId };
}

function participantAnswerRefs(roomRef, roundId, playerIds) {
  return playerIds.map((pid) => roomRef.collection('answers').doc(`${roundId}_${pid}`));
}

function buildStatsPatchForFinish(tx, db, room, sessionRef) {
  const entries = Object.entries(room.scores || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  const winnerUid = entries.length > 1 && entries[0][1] > entries[1][1] ? entries[0][0] : null;
  tx.set(sessionRef, {
    roomId: sessionRef.id,
    gameType: 'cognitive-arena',
    playerIds: room.playerIds || [],
    winnerId: winnerUid,
    finalScores: room.scores || {},
    roundsPlayed: room.roundNumber || COGNITIVE_MAX_ROUNDS,
    categoryBreakdown: room.categoryStats || {},
    createdAt: FieldValue.serverTimestamp(),
    finishedAt: FieldValue.serverTimestamp(),
  });
  (room.playerIds || []).filter((id) => id !== COGNITIVE_BOT_UID).forEach((uid) => {
    const won = uid === winnerUid;
    tx.set(
      db.collection('users').doc(uid),
      {
        cognitiveArena: {
          matches: FieldValue.increment(1),
          wins: FieldValue.increment(won ? 1 : 0),
          losses: FieldValue.increment(!winnerUid || won ? 0 : 1),
          bestStreak: Math.max(Number(room.streaks?.[uid]) || 0, 0),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      db.doc(`leaderboards/cognitiveArena/users/${uid}`),
      {
        uid,
        score: FieldValue.increment(Number(room.scores?.[uid]) || 0),
        wins: FieldValue.increment(won ? 1 : 0),
        losses: FieldValue.increment(!winnerUid || won ? 0 : 1),
        bestStreak: Math.max(Number(room.streaks?.[uid]) || 0, 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  return winnerUid;
}

function resolveRoundWrites(tx, db, { roomRef, roundRef, secretRef, room, round, secret, answerSnaps, injectedAnswers = {} }) {
  const roundId = room.currentRoundId;
  const roundSecret = secret.rounds?.[roundId];
  if (!roundSecret || round.status === 'resolved') return;
  const now = Timestamp.now();
  const startsMs = round.startsAt?.toMillis?.() ?? now.toMillis();
  const endsMs = round.endsAt?.toMillis?.() ?? now.toMillis();
  const roundDurationMs = Math.max(1, endsMs - startsMs);
  const playerIds = (room.playerIds || []).map(String);
  const answerByUid = {};
  answerSnaps.forEach((snap) => {
    if (snap.exists) answerByUid[snap.id.split(`${roundId}_`)[1]] = snap.data();
  });
  Object.assign(answerByUid, injectedAnswers);
  if (!playerIds.every((pid) => answerByUid[pid])) return;

  const scores = { ...(room.scores || {}) };
  const streaks = { ...(room.streaks || {}) };
  const correctCount = { ...(room.correctCount || {}) };
  const totalAnswered = { ...(room.totalAnswered || {}) };
  const responseTotals = { ...(room.responseTotals || {}) };
  const publicResult = {};
  let nextDifficulty = round.difficulty || 'easy';

  playerIds.forEach((pid) => {
    const row = answerByUid[pid] || {};
    const selectedIndex = Number(row.selectedIndex);
    const isLate = Boolean(row.isLate);
    const isCorrect = !isLate && selectedIndex === Number(roundSecret.correctIndex);
    const responseMs = Math.max(0, Math.min((row.submittedAt?.toMillis?.() ?? endsMs) - startsMs, roundDurationMs));
    const nextStreak = isCorrect ? (Number(streaks[pid]) || 0) + 1 : 0;
    const answered = (Number(totalAnswered[pid]) || 0) + 1;
    const correct = (Number(correctCount[pid]) || 0) + (isCorrect ? 1 : 0);
    const responseTotal = (Number(responseTotals[pid]) || 0) + responseMs;
    const scoring = calculateDifficultyAndScore({
      isCorrect,
      isLate,
      currentDifficulty: round.difficulty,
      nextStreak,
      accuracy: answered ? correct / answered : 0,
      avgResponseMs: answered ? responseTotal / answered : COGNITIVE_ROUND_MS,
      responseMs,
      roundDurationMs,
    });
    nextDifficulty = scoring.nextDifficulty;
    scores[pid] = (Number(scores[pid]) || 0) + scoring.scoreAwarded;
    streaks[pid] = nextStreak;
    correctCount[pid] = correct;
    totalAnswered[pid] = answered;
    responseTotals[pid] = responseTotal;
    publicResult[pid] = {
      selectedIndex,
      isCorrect,
      isLate,
      responseMs,
      scoreDelta: scoring.scoreAwarded,
      streakMultiplier: scoring.streakMultiplier,
    };
    tx.set(
      roomRef.collection('answers').doc(`${roundId}_${pid}`),
      {
        isCorrect,
        responseMs,
        scoreDelta: scoring.scoreAwarded,
        streakMultiplier: scoring.streakMultiplier,
        resolvedAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  tx.update(roundRef, {
    status: 'resolved',
    resolvedAt: now,
    answerCount: playerIds.length,
    correctIndex: roundSecret.correctIndex,
    explanation: roundSecret.explanation,
    publicResult,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const roundNumber = Number(room.roundNumber) || 1;
  const recentPatternHashes = [...(room.recentPatternHashes || []), round.patternHash].slice(-COGNITIVE_USED_PATTERNS_CAP);
  if (roundNumber >= COGNITIVE_MAX_ROUNDS) {
    const finishedRoom = { ...room, scores, streaks, correctCount, totalAnswered, responseTotals };
    const sessionRef = db.collection(COGNITIVE_COLLECTIONS.SESSIONS).doc(roomRef.id);
    const winnerUid = buildStatsPatchForFinish(tx, db, finishedRoom, sessionRef);
    tx.update(roomRef, {
      status: 'finished',
      scores,
      streaks,
      correctCount,
      totalAnswered,
      responseTotals,
      lastReveal: publicResult,
      lastResolvedRound: {
        roundId,
        correctIndex: roundSecret.correctIndex,
        explanation: roundSecret.explanation,
        publicResult,
      },
      winnerUid,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      serverVersion: FieldValue.increment(1),
      botReadyAt: FieldValue.delete(),
    });
    return;
  }

  const profileUid = playerIds.find((id) => id !== COGNITIVE_BOT_UID) || playerIds[0];
  const generated = generateQuestion(
    {
      streak: streaks[profileUid] || 0,
      accuracy: totalAnswered[profileUid] ? correctCount[profileUid] / totalAnswered[profileUid] : 0,
      avgResponseMs: totalAnswered[profileUid] ? responseTotals[profileUid] / totalAnswered[profileUid] : COGNITIVE_ROUND_MS,
    },
    recentPatternHashes
  );
  const nextRoundNumber = roundNumber + 1;
  const nextRoundId = `round_${nextRoundNumber}`;
  const startsAt = Timestamp.fromMillis(now.toMillis() + 1_600);
  const endsAt = Timestamp.fromMillis(startsAt.toMillis() + COGNITIVE_ROUND_MS);
  tx.set(roomRef.collection('rounds').doc(nextRoundId), {
    ...publicQuestion(generated),
    roundNumber: nextRoundNumber,
    status: 'open',
    startsAt,
    endsAt,
    answerCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  tx.set(
    secretRef,
    {
      rounds: {
        [nextRoundId]: {
          correctIndex: generated.correctIndex,
          explanation: generated.explanation,
          category: generated.category,
          difficulty: generated.difficulty,
          questionId: generated.id,
          metadata: generated.metadata || {},
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  tx.update(roomRef, {
    status: 'active',
    currentRoundId: nextRoundId,
    roundNumber: nextRoundNumber,
    scores,
    streaks,
    correctCount,
    totalAnswered,
    responseTotals,
    difficultyState: {
      current: generated.difficulty,
      recentAccuracy: totalAnswered[profileUid] ? correctCount[profileUid] / totalAnswered[profileUid] : 0,
      recentAvgResponseMs: totalAnswered[profileUid] ? responseTotals[profileUid] / totalAnswered[profileUid] : COGNITIVE_ROUND_MS,
    },
    recentPatternHashes: [...recentPatternHashes, generated.patternHash].slice(-COGNITIVE_USED_PATTERNS_CAP),
    lastReveal: publicResult,
    lastResolvedRound: {
      roundId,
      correctIndex: roundSecret.correctIndex,
      explanation: roundSecret.explanation,
      publicResult,
    },
    updatedAt: FieldValue.serverTimestamp(),
    serverVersion: FieldValue.increment(1),
    botReadyAt: FieldValue.delete(),
  });
}

async function runSubmitAnswer(db, request) {
  const uid = assertAuthed(request);
  const roomId = String(request.data?.roomId || '').trim();
  const roundId = String(request.data?.roundId || '').trim();
  const selectedIndex = Number(request.data?.selectedIndex);
  if (!roomId || !roundId || Number.isNaN(selectedIndex)) {
    throw new HttpsError('invalid-argument', 'roomId, roundId, and selectedIndex are required.');
  }
  const roomRef = db.collection(COGNITIVE_COLLECTIONS.ROOMS).doc(roomId);
  const secretRef = db.collection(COGNITIVE_COLLECTIONS.SECRETS).doc(roomId);
  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('not-found', 'Game room not found.');
    const room = roomSnap.data() || {};
    if (room.schemaVersion !== SCHEMA_VERSION || room.status !== 'active') throw new HttpsError('failed-precondition', 'Room is not active.');
    if (room.currentRoundId !== roundId) throw new HttpsError('failed-precondition', 'Round mismatch.');
    const playerIds = (room.playerIds || []).map(String);
    if (!playerIds.includes(uid) || uid === COGNITIVE_BOT_UID) throw new HttpsError('permission-denied', 'Not a player.');
    const roundRef = roomRef.collection('rounds').doc(roundId);
    const answerRef = roomRef.collection('answers').doc(`${roundId}_${uid}`);
    const answerRefs = participantAnswerRefs(roomRef, roundId, playerIds);
    const [roundSnap, secretSnap, existingAnswer, ...answerSnaps] = await Promise.all([
      tx.get(roundRef),
      tx.get(secretRef),
      tx.get(answerRef),
      ...answerRefs.map((ref) => tx.get(ref)),
    ]);
    if (!roundSnap.exists || !secretSnap.exists) throw new HttpsError('failed-precondition', 'Round state missing.');
    if (existingAnswer.exists) throw new HttpsError('already-exists', 'Already answered this round.');
    const round = roundSnap.data() || {};
    if (round.status !== 'open') throw new HttpsError('failed-precondition', 'Round is not open.');
    const now = Timestamp.now();
    const nowMs = now.toMillis();
    const endsMs = round.endsAt?.toMillis?.() ?? nowMs;
    const isLate = nowMs > endsMs + COGNITIVE_ANSWER_GRACE_MS;
    const chosen = isLate || selectedIndex < 0 || selectedIndex > 3 ? -1 : selectedIndex;
    const answerPayload = {
      roundId,
      userId: uid,
      selectedIndex: chosen,
      submittedAt: now,
      source: selectedIndex < 0 ? 'timeout' : 'player',
      confidence: 1,
      isLate,
      isCorrect: false,
      scoreDelta: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(answerRef, answerPayload);
    const injected = { [uid]: answerPayload };
    const hasBot = playerIds.includes(COGNITIVE_BOT_UID);
    const allAnswered = playerIds.every((pid) => pid === uid || answerSnaps.some((snap) => snap.id === `${roundId}_${pid}` && snap.exists));
    if (hasBot && uid !== COGNITIVE_BOT_UID) {
      const secret = secretSnap.data() || {};
      const roundSecret = secret.rounds?.[roundId];
      const botMove = makeBotMove({ ...round, correctIndex: roundSecret?.correctIndex }, room);
      tx.update(roomRef, {
        botReadyAt: Timestamp.fromMillis(nowMs + botMove.responseTime),
        botPendingMove: {
          roundId,
          selectedOption: botMove.selectedOption,
          responseTime: botMove.responseTime,
          confidence: botMove.confidence,
          state: botMove.state,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!hasBot && allAnswered) {
      resolveRoundWrites(tx, db, {
        roomRef,
        roundRef,
        secretRef,
        room,
        round,
        secret: secretSnap.data() || {},
        answerSnaps,
        injectedAnswers: injected,
      });
    }
  });
  return { ok: true };
}

async function runProcessBotTurn(db, request) {
  const uid = assertAuthed(request);
  const roomId = String(request.data?.roomId || '').trim();
  if (!roomId) throw new HttpsError('invalid-argument', 'roomId is required.');
  const roomRef = db.collection(COGNITIVE_COLLECTIONS.ROOMS).doc(roomId);
  const secretRef = db.collection(COGNITIVE_COLLECTIONS.SECRETS).doc(roomId);
  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError('not-found', 'Room not found.');
    const room = roomSnap.data() || {};
    const playerIds = (room.playerIds || []).map(String);
    if (!playerIds.includes(uid) || uid === COGNITIVE_BOT_UID) throw new HttpsError('permission-denied', 'Not a player.');
    if (room.status !== 'active' || !playerIds.includes(COGNITIVE_BOT_UID)) return;
    const roundId = room.currentRoundId;
    const roundRef = roomRef.collection('rounds').doc(roundId);
    const botRef = roomRef.collection('answers').doc(`${roundId}_${COGNITIVE_BOT_UID}`);
    const answerRefs = participantAnswerRefs(roomRef, roundId, playerIds);
    const [roundSnap, secretSnap, botSnap, ...answerSnaps] = await Promise.all([
      tx.get(roundRef),
      tx.get(secretRef),
      tx.get(botRef),
      ...answerRefs.map((ref) => tx.get(ref)),
    ]);
    if (botSnap.exists || !roundSnap.exists || !secretSnap.exists) return;
    const now = Timestamp.now();
    if (now.toMillis() < (room.botReadyAt?.toMillis?.() ?? 0)) throw new HttpsError('failed-precondition', 'Bot is still thinking.');
    const round = roundSnap.data() || {};
    const pending = room.botPendingMove || {};
    if (pending.roundId !== roundId) return;
    const payload = {
      roundId,
      userId: COGNITIVE_BOT_UID,
      selectedIndex: Number(pending.selectedOption),
      submittedAt: now,
      source: 'bot',
      confidence: Number(pending.confidence) || 0.5,
      isLate: false,
      isCorrect: false,
      scoreDelta: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(botRef, payload);
    tx.update(roomRef, {
      botState: { ...(room.botState || {}), state: pending.state || 'casual' },
      botReadyAt: FieldValue.delete(),
      botPendingMove: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    resolveRoundWrites(tx, db, {
      roomRef,
      roundRef,
      secretRef,
      room,
      round,
      secret: secretSnap.data() || {},
      answerSnaps,
      injectedAnswers: { [COGNITIVE_BOT_UID]: payload },
    });
  });
  return { ok: true };
}

async function runResolveRoundIfStale(db, request) {
  const uid = assertAuthed(request);
  const roomId = String(request.data?.roomId || '').trim();
  if (!roomId) throw new HttpsError('invalid-argument', 'roomId is required.');
  const roomRef = db.collection(COGNITIVE_COLLECTIONS.ROOMS).doc(roomId);
  const secretRef = db.collection(COGNITIVE_COLLECTIONS.SECRETS).doc(roomId);
  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) return;
    const room = roomSnap.data() || {};
    const playerIds = (room.playerIds || []).map(String);
    if (!playerIds.includes(uid) || room.status !== 'active') return;
    const roundId = room.currentRoundId;
    const roundRef = roomRef.collection('rounds').doc(roundId);
    const answerRefs = participantAnswerRefs(roomRef, roundId, playerIds);
    const [roundSnap, secretSnap, ...answerSnaps] = await Promise.all([tx.get(roundRef), tx.get(secretRef), ...answerRefs.map((ref) => tx.get(ref))]);
    if (!roundSnap.exists || !secretSnap.exists) return;
    const round = roundSnap.data() || {};
    const now = Timestamp.now();
    if (now.toMillis() <= (round.endsAt?.toMillis?.() ?? now.toMillis()) + COGNITIVE_ANSWER_GRACE_MS) return;
    const injected = {};
    playerIds.forEach((pid, index) => {
      if (!answerSnaps[index].exists) {
        const payload = {
          roundId,
          userId: pid,
          selectedIndex: -1,
          submittedAt: now,
          source: 'timeout',
          confidence: pid === COGNITIVE_BOT_UID ? 0 : 1,
          isLate: true,
          isCorrect: false,
          scoreDelta: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        injected[pid] = payload;
        tx.set(answerRefs[index], payload);
      }
    });
    resolveRoundWrites(tx, db, {
      roomRef,
      roundRef,
      secretRef,
      room,
      round,
      secret: secretSnap.data() || {},
      answerSnaps,
      injectedAnswers: injected,
    });
  });
  return { ok: true };
}

module.exports = {
  runStartPractice,
  runEnqueue1v1,
  runLeaveQueue,
  runTryMatch,
  runSubmitAnswer,
  runProcessBotTurn,
  runResolveRoundIfStale,
  validateSyllogism,
  parseStatement,
  generateQuestion,
  calculateDifficultyAndScore,
  makeBotMove,
};
