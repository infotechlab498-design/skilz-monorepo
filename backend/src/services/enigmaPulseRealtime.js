import { v4 as uuidv4 } from 'uuid';
import { ENIGMA_PULSE, EnigmaPulseEvents } from '../../../shared/enigmaPulse/constants.js';
import { WORD_CIPHER_CATEGORY } from '../../../shared/enigmaPulse/categories.js';
import { isAlternatingTurnEnigmaGameKey, isPatternRecognitionGameKey, isWordCipherGameKey } from '../../../shared/enigmaPulse/gameKeys.js';
import {
  computeBaseMatchRewards,
  computePerformanceBonuses,
  createEmptyMatchStats,
  recordTurnClosed,
  syncMaxStreak,
} from '../../../shared/enigmaPulse/performanceBonuses.js';
import {
  validateInvitePayload,
  validateJoinPrivatePayload,
  validateQueuePayload,
  validateSubmitPayload,
} from '../../../shared/enigmaPulse/validators.js';
import {
  createNotification,
  createEnigmaInvite,
  getInviteById,
  markInviteAccepted,
  markInviteExpired,
  markNotificationRead,
} from './enigmaPulse/inviteRepos.js';
import {
  recordRoomSummary,
  recordTransaction,
  settleEnigmaMatchReward,
  upsertLeaderboardEntry,
} from './enigmaPulse/firestoreRepos.js';
import { resolveEnigmaEngine } from './enigmaPulse/engines/registry.js';
import { getHintPreview } from './enigmaPulse/engine/AnswerValidator.js';
import { buildEnigmaMatchQuestionDecks } from './enigmaPulse/enigmaQuestionSelection.js';
import { recordEnigmaPlayedQuestions } from './enigmaPulse/enigmaPlayedHistory.js';
import { EP_INSUFFICIENT_QUESTIONS, EP_SYLLOGISM_DECK_INCOMPLETE, EP_WORD_CIPHER_DECK_INCOMPLETE } from '../../../shared/enigmaPulse/errorCodes.js';
import { epInsufficientQuestionsMessage, epSyllogismDeckIncompleteMessage, epWordCipherDeckIncompleteMessage } from './enigmaPulse/enigmaTruthpackCopy.js';
import { updateQuestion } from './firestoreQuestionAdmin.js';
import { clearSyllogismPoolCache } from './enigmaPulse/syllogismPoolCache.js';
import {
  assertEnigmaSocketAdmin,
  broadcastDeckSyncToRoom,
  isFirestoreBackedQuestionId,
  patchMatchDecksWithUpdated,
  tombstoneQuestionIdInDecks,
  findQuestionSlots,
} from './enigmaPulse/matchQuestionAdmin.js';
import {
  GAME_KEYS,
  refundAllGameEntryFees,
  refundGameEntryFee,
  tryDeductGameEntryFee,
} from './gameEntryFee.js';
import { getEnigmaModeSettings } from './gameConfigService.js';

function rankBucket(xp) {
  return Math.floor(Math.max(0, Number(xp || 0)) / 1000);
}

function publicPlayer(p) {
  return {
    uid: p.uid,
    displayName: p.displayName,
    photoURL: p.photoURL,
    score: p.score,
    coinsEarned: p.coinsEarned || 0,
    answered: p.answered,
    attemptsLeft: p.attemptsLeft,
    streak: Number(p.streak || 0),
    isBot: Boolean(p.isBot),
    powerUps: {
      fiftyFifty: Number(p?.powerUps?.fiftyFifty || 0),
      skip: Number(p?.powerUps?.skip || 0),
      doublePoints: Number(p?.powerUps?.doublePoints || 0),
    },
  };
}

function normalizeQuestionForClient(question, gameKey = 'riddle_classic') {
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

function questionSecondsForGame(gameKey = '') {
  const key = String(gameKey || '').toLowerCase();
  // Product rule: Syllogism is always 15s per question.
  if (key === 'syllogism') return 15;
  return ENIGMA_PULSE.QUESTION_SECONDS;
}

function syllogismRoundDifficulty(questionIndex) {
  const q = Number(questionIndex || 0) + 1;
  if (q <= 5) return 'easy';
  if (q <= 10) return 'medium';
  return 'hard';
}

function defaultTotalQuestionsForMatch(match) {
  if (String(match.gameKey || '').toLowerCase() === 'syllogism') return ENIGMA_PULSE.QUESTION_COUNT;
  if (isPatternRecognitionGameKey(match.gameKey)) return ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS;
  if (isWordCipherGameKey(match.gameKey)) return ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS;
  return ENIGMA_PULSE.QUESTION_COUNT;
}

function deckQuestionCountForGameKey(gameKey) {
  if (isPatternRecognitionGameKey(gameKey)) return ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS;
  if (isWordCipherGameKey(gameKey)) return ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS;
  return ENIGMA_PULSE.QUESTION_COUNT;
}

/** Question IDs each human actually faced (by round index), for played-history only. */
function playedQuestionIdsByPlayer(match) {
  /** @type {Record<string, string[]>} */
  const byUid = {};
  for (const p of match.players || []) {
    if (p?.uid && !p.isBot) byUid[p.uid] = [];
  }
  for (const sum of match.questionSummary || []) {
    const idx = Number(sum?.index);
    if (!Number.isFinite(idx) || idx < 0) continue;
    const pl = match.players[idx % 2];
    if (!pl?.uid || pl.isBot) continue;
    const q = match.questionsByUid?.[pl.uid]?.[idx];
    const id = q?.id;
    if (id && byUid[pl.uid]) byUid[pl.uid].push(String(id));
  }
  return byUid;
}

/** Per-player progress (1..10) vs shared questionIndex (0..19) for alternating-turn modes. */
function alternatingTurnPersonalProgressForUid(match, uid) {
  if (!isAlternatingTurnEnigmaGameKey(match.gameKey) || !uid) {
    return { personalQuestionIndex: null, personalQuestionTotal: null };
  }
  const players = match.players || [];
  const myIdx = players.findIndex((p) => p.uid === uid);
  if (myIdx < 0) {
    return { personalQuestionIndex: null, personalQuestionTotal: null };
  }
  const q = Math.max(0, Number(match.questionIndex ?? 0));
  const totalShared = Math.max(
    1,
    Number(
      match.questionTarget ||
        (isWordCipherGameKey(match.gameKey)
          ? ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS
          : ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS)
    )
  );
  const personalTotal = Math.max(1, Math.ceil(totalShared / 2));
  let answeredCountForMe = 0;
  for (let i = 0; i < q; i += 1) {
    if (i % 2 === myIdx) answeredCountForMe += 1;
  }
  const myTurn = String(match.currentTurnUid || '') === String(uid);
  const raw = answeredCountForMe + (myTurn ? 1 : 0);
  const personalQuestionIndex = Math.min(personalTotal, Math.max(0, raw));
  return { personalQuestionIndex, personalQuestionTotal: personalTotal };
}

function roomPayloadForUid(match, uid) {
  const qIdx = Number(match.questionIndex ?? 0);
  let question = null;
  if (match.clientQuestionsByUid && uid && Array.isArray(match.clientQuestionsByUid[uid])) {
    question = match.clientQuestionsByUid[uid][qIdx] ?? null;
  }
  const isSyllogism = String(match.gameKey || '').toLowerCase() === 'syllogism';
  const rosterDefault = defaultTotalQuestionsForMatch(match);
  const total = isSyllogism
    ? ENIGMA_PULSE.QUESTION_COUNT
    : match.status === 'waiting' || match.status === 'preparing'
      ? rosterDefault
      : Number(match.questionTarget || rosterDefault);
  const seqPersonal = alternatingTurnPersonalProgressForUid(match, uid);
  return {
    roomId: match.roomId,
    status: match.status,
    category: match.category,
    difficulty: match.difficulty,
    gameKey: match.gameKey,
    roundDifficulty:
      String(match.gameKey || '').toLowerCase() === 'syllogism'
        ? syllogismRoundDifficulty(qIdx)
        : match.difficulty,
    questionIndex: qIdx,
    totalQuestions: total,
    personalQuestionIndex: seqPersonal.personalQuestionIndex,
    personalQuestionTotal: seqPersonal.personalQuestionTotal,
    currentTurnUid: match.currentTurnUid || null,
    question,
    deadlineMs: match.deadlineMs || null,
    players: match.players.map(publicPlayer),
  };
}

function safeNow() {
  return Date.now();
}

function botDifficultyProfile(difficulty = '') {
  const d = String(difficulty || 'medium').toLowerCase();
  if (d === 'easy') return { minAccuracy: 0.4, maxAccuracy: 0.6 };
  if (d === 'hard') return { minAccuracy: 0.8, maxAccuracy: 0.95 };
  return { minAccuracy: 0.6, maxAccuracy: 0.8 };
}

export function createEnigmaPulseHandlers(io) {
  const queue = [];
  const matches = new Map();
  const timers = new Map();
  const reconnectTimers = new Map();
  const botTimers = new Map();
  const userSockets = new Map();
  const activeSocketToUid = new Map();

  function notifyUser(uid, payload) {
    const sids = userSockets.get(uid);
    if (!sids?.size) return;
    for (const sid of sids) {
      io.to(sid).emit(EnigmaPulseEvents.NOTIFICATION_PUSH, payload);
    }
  }

  function addUserSocket(uid, socketId) {
    if (!uid) return;
    const s = userSockets.get(uid) || new Set();
    s.add(socketId);
    userSockets.set(uid, s);
    activeSocketToUid.set(socketId, uid);
  }

  function removeUserSocket(socketId) {
    const uid = activeSocketToUid.get(socketId);
    if (!uid) return '';
    activeSocketToUid.delete(socketId);
    const s = userSockets.get(uid);
    if (!s) return uid;
    s.delete(socketId);
    if (!s.size) userSockets.delete(uid);
    return uid;
  }

  function emitError(socket, message, code = 'EP_ERROR') {
    socket.emit(EnigmaPulseEvents.ERROR, { message, code });
  }

  function getMatch(roomId) {
    return matches.get(roomId);
  }

  function clearTimer(roomId) {
    const t = timers.get(roomId);
    if (t) {
      clearInterval(t);
      timers.delete(roomId);
    }
  }

  function clearBotTimer(roomId) {
    const t = botTimers.get(roomId);
    if (!t) return;
    if (t && typeof t === 'object' && ('typing' in t || 'answer' in t)) {
      if (t.typing) clearTimeout(t.typing);
      if (t.answer) clearTimeout(t.answer);
    } else {
      clearTimeout(t);
    }
    botTimers.delete(roomId);
  }

  function reconnectKey(roomId, uid) {
    return `${roomId}:${uid}`;
  }

  function clearReconnectGrace(roomId, uid) {
    const key = reconnectKey(roomId, uid);
    const t = reconnectTimers.get(key);
    if (t) {
      clearTimeout(t);
      reconnectTimers.delete(key);
    }
  }

  function scheduleBotAnswer(roomId) {
    const match = getMatch(roomId);
    if (!match || match.status !== 'playing') return;
    const bot = match.players.find((p) => p.isBot);
    if (!bot || bot.answered) return;
    if (match.currentTurnUid && match.currentTurnUid !== bot.uid) return;
    clearBotTimer(roomId);
    const q = match.questionsByUid?.[bot.uid]?.[match.questionIndex];
    const qDifficulty = String(q?.difficulty || match.difficulty || 'medium').toLowerCase();
    const difficultyFactor = qDifficulty === 'hard' ? 1.2 : qDifficulty === 'easy' ? 0.85 : 1;
    const delayBase = ENIGMA_PULSE.BOT_MIN_MS + Math.random() * (ENIGMA_PULSE.BOT_MAX_MS - ENIGMA_PULSE.BOT_MIN_MS);
    const delay = Math.round(delayBase * difficultyFactor);
    const typingMs = Math.min(1800, Math.max(400, Math.floor(delay * 0.35)));
    const answerAfterMs = Math.max(250, delay - typingMs);
    const typingTimer = setTimeout(() => {
      const answerTimer = setTimeout(() => {
        const m = getMatch(roomId);
        if (!m || m.status !== 'playing' || safeNow() > m.deadlineMs) return;
        const q = m.questionsByUid?.[bot.uid]?.[m.questionIndex];
        const profile = botDifficultyProfile(m.difficulty);
        const accuracy = profile.minAccuracy + Math.random() * (profile.maxAccuracy - profile.minAccuracy);
        const accepted =
          Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length
            ? q.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean)
            : [];
        const fallbackCorrect = String(q.options?.[q.correctIndex] ?? '').trim();
        // Human-like behavior: occasional hesitation and re-thinking.
        const hesitationFlip = Math.random() < 0.18;
        const shouldBeCorrect = Math.random() <= accuracy;
        let answerText = accepted[0] || fallbackCorrect || '';
        if (!shouldBeCorrect) {
          const wrongPool = (q.options || []).filter((_, idx) => idx !== Number(q.correctIndex));
          const weightedWrong = wrongPool[Math.floor(Math.random() * Math.max(1, wrongPool.length))] || accepted[1] || 'unknown';
          answerText = weightedWrong;
        }
        if (hesitationFlip && Array.isArray(q.options) && q.options.length > 1) {
          const alt = q.options[Math.floor(Math.random() * q.options.length)];
          if (alt) answerText = String(alt);
        }
        processAnswer({
          roomId,
          userId: bot.uid,
          questionId: q.id,
          questionIndex: m.questionIndex,
          answerText,
        });
      }, answerAfterMs);
      botTimers.set(roomId, { typing: null, answer: answerTimer });
    }, typingMs);
    botTimers.set(roomId, { typing: typingTimer, answer: null });
  }

  function startQuestion(roomId) {
    const match = getMatch(roomId);
    if (!match || match.status !== 'playing') return;
    clearTimer(roomId);
    clearBotTimer(roomId);
    match.players.forEach((p) => {
      p.answered = p.uid !== match.currentTurnUid;
      p.attemptsLeft = ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION;
      p.usedHint = false;
      p.skipped = false;
    });
    match.answersByQuestion.set(match.questionIndex, {});
    const primaryUid = match.players[0]?.uid;
    const primaryQ =
      primaryUid && match.questionsByUid?.[primaryUid]
        ? match.questionsByUid[primaryUid][match.questionIndex]
        : null;
    match.questionSummary.push({
      questionId: primaryQ?.id || `q_${match.questionIndex}`,
      index: match.questionIndex,
      attempts: {},
      correctByUid: {},
      skippedByUid: {},
    });
    const roundSeconds = isPatternRecognitionGameKey(match.gameKey)
      ? Math.max(1, Number(ENIGMA_PULSE.QUESTION_SECONDS) || 15)
      : questionSecondsForGame(match.gameKey);
    match.deadlineMs = safeNow() + roundSeconds * 1000;
    for (const pl of match.players) {
      const sid = match.sockets?.[pl.uid];
      if (!sid) continue;
      io.to(sid).emit(EnigmaPulseEvents.QUESTION_START, roomPayloadForUid(match, pl.uid));
    }
    io.to(roomId).emit(EnigmaPulseEvents.TIMER_SYNC, {
      roomId,
      questionIndex: match.questionIndex,
      secondsLeft: roundSeconds,
      deadlineMs: match.deadlineMs,
      serverNowMs: safeNow(),
    });
    let left = roundSeconds;
    const intv = setInterval(() => {
      left -= 1;
      io.to(roomId).emit(EnigmaPulseEvents.TIMER_SYNC, {
        roomId,
        questionIndex: match.questionIndex,
        secondsLeft: Math.max(0, left),
        deadlineMs: match.deadlineMs,
        serverNowMs: safeNow(),
      });
      if (left <= 0) {
        clearTimer(roomId);
        resolveQuestion(roomId, 'timeout');
      }
    }, 1000);
    timers.set(roomId, intv);
    scheduleBotAnswer(roomId);
  }

  function resolveQuestion(roomId, reason) {
    const match = getMatch(roomId);
    if (!match || match.status !== 'playing') return;
    clearTimer(roomId);
    clearBotTimer(roomId);
    if (reason === 'timeout') {
      const current = match.players.find((p) => p.uid === match.currentTurnUid);
      if (current) {
        current.streak = 0;
        current.answered = true;
      }
    }
    const turnUid = match.currentTurnUid;
    if (turnUid) {
      const turnPlayer = match.players.find((p) => p.uid === turnUid);
      if (turnPlayer) {
        if (!turnPlayer.matchStats) turnPlayer.matchStats = createEmptyMatchStats();
        recordTurnClosed(turnPlayer.matchStats, {
          timedOut: reason === 'timeout',
          skipped: reason === 'skipped',
        });
      }
    }
    const answers = match.answersByQuestion.get(match.questionIndex) || {};
    const answerResults = [];
    for (const p of match.players) {
      const state = answers[p.uid];
      answerResults.push({
        uid: p.uid,
        correct: Boolean(state?.correct),
        attemptsUsed: Number(state?.attemptsUsed || 0),
        skipped: Boolean(state?.skipped),
        score: Number(p.score || 0),
        streak: Number(p.streak || 0),
        coinsEarned: p.coinsEarned || 0,
      });
    }
    const basePayload = {
      roomId,
      questionIndex: match.questionIndex,
      reason,
      answerResults,
      scores: match.players.map((p) => ({
        uid: p.uid,
        score: Number(p.score || 0),
        coinsEarned: Number(p.coinsEarned || 0),
        streak: Number(p.streak || 0),
      })),
    };
    for (const p of match.players) {
      const sid = match.sockets?.[p.uid];
      if (!sid) continue;
      const q = match.questionsByUid?.[p.uid]?.[match.questionIndex];
      const answerPreview = q?.options?.[Number(q?.correctIndex)] || '';
      io.to(sid).emit(EnigmaPulseEvents.ANSWER_RESULT, {
        ...basePayload,
        correctAnswerPreview: answerPreview,
      });
    }
    match.questionIndex += 1;
    if (match.players.length >= 2) {
      const nextTurn = match.players.find((p) => p.uid !== match.currentTurnUid);
      match.currentTurnUid = nextTurn?.uid || match.players[0]?.uid || null;
    }
    if (match.questionIndex >= Number(match.questionTarget || defaultTotalQuestionsForMatch(match))) {
      void endMatch(roomId, 'completed');
      return;
    }
    io.to(roomId).emit(EnigmaPulseEvents.NEXT_QUESTION, {
      roomId,
      questionIndex: match.questionIndex,
    });
    startQuestion(roomId);
  }

  async function endMatch(roomId, endReason) {
    const match = getMatch(roomId);
    if (!match) return;
    if (match.settlementState === 'processing' || match.settlementState === 'done') return;
    match.settlementState = 'processing';
    clearTimer(roomId);
    clearBotTimer(roomId);
    match.status = 'ended';
    match.lifecycleStatus = 'COMPLETED';
    let winnerUid = 'draw';
    if (endReason === 'leave_forfeit' && match.forfeitUid) {
      const survivor = match.players.find((p) => p.uid !== match.forfeitUid);
      winnerUid = survivor?.uid || 'draw';
    } else
    if ((match.players[0]?.score || 0) !== (match.players[1]?.score || 0)) {
      winnerUid = match.players[0].score > match.players[1].score ? match.players[0].uid : match.players[1].uid;
    }
    const progression = [];
    const shouldSettleRewards = endReason !== 'returned_lobby_prestart';
    try {
      await recordRoomSummary({
        roomId,
        status: 'ended',
        endReason,
        winnerUid,
        category: match.category,
        difficulty: match.difficulty,
        gameKey: match.gameKey,
        players: match.players.map((p) => ({ uid: p.uid, score: p.score, coinsEarned: p.coinsEarned || 0 })),
        questionCount: Number(match.questionTarget || defaultTotalQuestionsForMatch(match)),
        createdAtMs: match.createdAtMs,
        endedAtMs: safeNow(),
        questionSummary: match.questionSummary,
        progression,
      });
      for (const p of match.players) {
        if (p.isBot) continue;
        if (!shouldSettleRewards) {
          progression.push({
            uid: p.uid,
            xpGained: 0,
            coinsGained: 0,
            xp: Number(p.xp || 0),
            rank: String(p.rank || ''),
          });
          continue;
        }
        const won = winnerUid === p.uid;
        const draw = winnerUid === 'draw';
        const isForfeitLeaver =
          endReason === 'leave_forfeit' && String(match.forfeitUid || '') === String(p.uid);
        if (isForfeitLeaver) {
          progression.push({
            uid: p.uid,
            xpGained: 0,
            coinsGained: 0,
            baseXp: 0,
            baseCoins: 0,
            bonusXp: 0,
            bonusCoins: 0,
            performanceBreakdown: [],
            xp: Number(p.xp || 0),
            rank: String(p.rank || ''),
          });
          continue;
        }
        const scoreDelta = won ? 20 : draw ? 10 : 5;
        await upsertLeaderboardEntry({ uid: p.uid, scoreDelta, win: won });
        const { baseXp, baseCoins } = computeBaseMatchRewards(ENIGMA_PULSE, {
          gameKey: match.gameKey,
          won,
          draw,
        });
        const perf = computePerformanceBonuses({
          gameKey: match.gameKey,
          matchStats: p.matchStats || createEmptyMatchStats(),
          endReason,
          isForfeitLeaver: false,
          allowBonuses: shouldSettleRewards,
        });
        const xpGained = baseXp + perf.bonusXp;
        const coinsGained = baseCoins + perf.bonusCoins;
        const settled = await settleEnigmaMatchReward({
          roomId,
          uid: p.uid,
          won,
          draw,
          xpDelta: xpGained,
          coinsDelta: coinsGained,
          baseXp,
          baseCoins,
          bonusXp: perf.bonusXp,
          bonusCoins: perf.bonusCoins,
          performanceBreakdown: perf.breakdown,
        });
        if (settled?.rewarded) {
          await recordTransaction({
            txId: `${roomId}_${p.uid}_match_reward`,
            uid: p.uid,
            roomId,
            type: 'match_reward',
            amount: coinsGained,
            meta: {
              gameType: ENIGMA_PULSE.GAME_TYPE,
              won,
              draw,
              baseCoins,
              bonusCoins: perf.bonusCoins,
              baseXp,
              bonusXp: perf.bonusXp,
              performanceBreakdown: perf.breakdown,
            },
          });
        }
        progression.push({
          uid: p.uid,
          xpGained,
          coinsGained,
          baseXp,
          baseCoins,
          bonusXp: perf.bonusXp,
          bonusCoins: perf.bonusCoins,
          performanceBreakdown: perf.breakdown,
          xp: Number(settled?.xp || 0),
          rank: String(settled?.rank || 'Bronze'),
        });
      }
      const playedByUid = playedQuestionIdsByPlayer(match);
      for (const p of match.players) {
        if (p.isBot) continue;
        const questionIds = playedByUid[p.uid] || [];
        if (questionIds.length) {
          await recordEnigmaPlayedQuestions({
            uid: p.uid,
            questionIds,
            category: match.category,
            difficulty: match.difficulty,
            gameKey: match.gameKey,
          });
        }
      }
    } catch (e) {
      console.warn('[EnigmaPulse] settlement warning:', e?.message || e);
    }
    match.lifecycleStatus = 'REWARDED';
    match.settlementState = 'done';
    io.to(roomId).emit(EnigmaPulseEvents.MATCH_END, {
      roomId,
      winnerUid,
      endReason,
      players: match.players.map((p) => ({ uid: p.uid, score: p.score, coinsEarned: p.coinsEarned || 0 })),
      progression,
    });
    matches.delete(roomId);
  }

  async function startMatch(p1, p2, matchType = 'queue', gameKey = 'riddle_classic', opts = {}) {
    const modeSettings = await getEnigmaModeSettings(gameKey);
    if (!modeSettings.enabled) {
      const s1 = io.sockets.sockets.get(p1.socketId);
      if (s1) emitError(s1, 'This EnigmaPulse mode is temporarily unavailable.', 'MODE_DISABLED');
      return null;
    }

    const prepaid = { ...(opts.prepaidEntryFees || {}) };
    /** @type {Record<string, number>} */
    const entryFeeByUid = { ...prepaid };

    if (!p1.isBot && p1.uid && entryFeeByUid[p1.uid] == null) {
      const d1 = await tryDeductGameEntryFee(p1.uid, GAME_KEYS.ENIGMA_PULSE, { variantKey: gameKey });
      if (!d1.ok) {
        const s1 = io.sockets.sockets.get(p1.socketId);
        if (s1) emitError(s1, d1.error || 'Insufficient coins', 'INSUFFICIENT_COINS');
        return null;
      }
      entryFeeByUid[p1.uid] = d1.entryFee;
    }
    if (!p2.isBot && p2.uid && entryFeeByUid[p2.uid] == null) {
      const d2 = await tryDeductGameEntryFee(p2.uid, GAME_KEYS.ENIGMA_PULSE, { variantKey: gameKey });
      if (!d2.ok) {
        const s2 = io.sockets.sockets.get(p2.socketId);
        if (s2) emitError(s2, d2.error || 'Insufficient coins', 'INSUFFICIENT_COINS');
        await refundAllGameEntryFees(
          Object.fromEntries(Object.entries(entryFeeByUid).filter(([uid]) => uid !== p2.uid)),
          'EnigmaPulse'
        );
        return null;
      }
      entryFeeByUid[p2.uid] = d2.entryFee;
    }

    const refundEntryFees = () => refundAllGameEntryFees(entryFeeByUid, 'EnigmaPulse');

    const roomId = uuidv4();
    const s1 = io.sockets.sockets.get(p1.socketId);
    const s2 = p2.isBot ? null : io.sockets.sockets.get(p2.socketId);
    s1?.join(roomId);
    if (!p2.isBot) s2?.join(roomId);

    const effectiveCategory =
      String(gameKey || '').toLowerCase() === 'syllogism'
        ? 'Syllogism'
        : String(gameKey || '').toLowerCase() === 'word_cipher'
          ? WORD_CIPHER_CATEGORY
          : p1.category;
    const preparingPlayer = (p, isBot) =>
      publicPlayer({
        uid: p.uid,
        displayName: p.displayName,
        photoURL: p.photoURL,
        score: 0,
        coinsEarned: 0,
        streak: 0,
        answered: false,
        attemptsLeft: ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION,
        usedHint: false,
        skipped: false,
        isBot: Boolean(isBot),
        powerUps: { fiftyFifty: 1, skip: 1, doublePoints: 1 },
      });
    io.to(roomId).emit(EnigmaPulseEvents.MATCH_PREPARING, {
      roomId,
      status: 'preparing',
      category: effectiveCategory,
      difficulty: p1.difficulty,
      gameKey,
      players: [preparingPlayer(p1, p1.isBot), preparingPlayer(p2, p2.isBot)],
    });

    const engine = resolveEnigmaEngine(gameKey);
    const deckQuestionCount = deckQuestionCountForGameKey(gameKey);
    let decksByUid = {};
    let questionTarget = 0;
    try {
      const built = await buildEnigmaMatchQuestionDecks({
        uidA: p1.uid,
        uidB: p2.uid,
        isBotB: Boolean(p2.isBot),
        category: effectiveCategory,
        difficulty: p1.difficulty,
        gameKey,
        count: deckQuestionCount,
        roomId,
      });
      decksByUid = built.decksByUid || {};
      questionTarget = Number(built.questionTarget || 0);
    } catch (e) {
      console.warn('[EnigmaPulse] deck build failed:', e?.message || e);
    }
    const isSyllogism = String(gameKey || '').toLowerCase() === 'syllogism';
    if (!questionTarget) {
      const insufficientPayload = {
        message: epInsufficientQuestionsMessage(),
        code: EP_INSUFFICIENT_QUESTIONS,
      };
      io.to(roomId).emit(EnigmaPulseEvents.ERROR, insufficientPayload);
      io.to(p1.socketId).emit(EnigmaPulseEvents.ERROR, insufficientPayload);
      if (p2?.socketId) io.to(p2.socketId).emit(EnigmaPulseEvents.ERROR, insufficientPayload);
      s1?.leave(roomId);
      s2?.leave(roomId);
      await refundEntryFees();
      return null;
    }
    if (isSyllogism && questionTarget < ENIGMA_PULSE.QUESTION_COUNT) {
      const syllogismPayload = {
        message: epSyllogismDeckIncompleteMessage(),
        code: EP_SYLLOGISM_DECK_INCOMPLETE,
      };
      io.to(roomId).emit(EnigmaPulseEvents.ERROR, syllogismPayload);
      io.to(p1.socketId).emit(EnigmaPulseEvents.ERROR, syllogismPayload);
      if (p2?.socketId) io.to(p2.socketId).emit(EnigmaPulseEvents.ERROR, syllogismPayload);
      s1?.leave(roomId);
      s2?.leave(roomId);
      await refundEntryFees();
      return null;
    }
    const isWordCipher = isWordCipherGameKey(gameKey);
    if (isWordCipher && questionTarget < ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS) {
      const wordCipherPayload = {
        message: epWordCipherDeckIncompleteMessage(),
        code: EP_WORD_CIPHER_DECK_INCOMPLETE,
      };
      io.to(roomId).emit(EnigmaPulseEvents.ERROR, wordCipherPayload);
      io.to(p1.socketId).emit(EnigmaPulseEvents.ERROR, wordCipherPayload);
      if (p2?.socketId) io.to(p2.socketId).emit(EnigmaPulseEvents.ERROR, wordCipherPayload);
      s1?.leave(roomId);
      s2?.leave(roomId);
      await refundEntryFees();
      return null;
    }
    const requiredNonSyllogism = deckQuestionCountForGameKey(gameKey);
    if (!isSyllogism && questionTarget < requiredNonSyllogism) {
      console.warn(
        `[EnigmaPulse] starting short match due to limited pool: category=${p1.category} difficulty=${p1.difficulty} usable=${questionTarget} required=${requiredNonSyllogism}`
      );
    }
    const effectiveQuestionTarget = isSyllogism ? ENIGMA_PULSE.QUESTION_COUNT : Math.max(1, questionTarget);
    const clientQuestionsByUid = {};
    for (const uidKey of [p1.uid, p2.uid]) {
      const deck = decksByUid[uidKey] || [];
      clientQuestionsByUid[uidKey] = deck.map((q) => normalizeQuestionForClient(q, gameKey));
    }
    const match = {
      roomId,
      status: 'playing',
      lifecycleStatus: 'IN_PROGRESS',
      settlementState: 'pending',
      createdAtMs: safeNow(),
      category: effectiveCategory,
      difficulty: p1.difficulty,
      gameKey,
      engine,
      questionsByUid: decksByUid,
      clientQuestionsByUid,
      players: [
        {
          uid: p1.uid,
          displayName: p1.displayName,
          photoURL: p1.photoURL,
          score: 0,
          coinsEarned: 0,
          streak: 0,
          answered: false,
          attemptsLeft: ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION,
          usedHint: false,
          skipped: false,
          isBot: Boolean(p1.isBot),
          powerUps: { fiftyFifty: 1, skip: 1, doublePoints: 1 },
          matchStats: createEmptyMatchStats(),
        },
        {
          uid: p2.uid,
          displayName: p2.displayName,
          photoURL: p2.photoURL,
          score: 0,
          coinsEarned: 0,
          streak: 0,
          answered: false,
          attemptsLeft: ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION,
          usedHint: false,
          skipped: false,
          isBot: Boolean(p2.isBot),
          powerUps: { fiftyFifty: 1, skip: 1, doublePoints: 1 },
          matchStats: createEmptyMatchStats(),
        },
      ],
      questionIndex: 0,
      currentTurnUid: p1.uid,
      questionTarget: effectiveQuestionTarget,
      answersByQuestion: new Map(),
      sockets: {
        [p1.uid]: p1.socketId,
        [p2.uid]: p2.socketId,
      },
      matchType,
      deadlineMs: null,
      questionSummary: [],
      entryFeeByUid,
      entryFee: Math.max(...Object.values(entryFeeByUid).map((n) => Number(n) || 0), 0),
    };
    matches.set(roomId, match);
    io.to(roomId).emit(EnigmaPulseEvents.MATCH_FOUND, {
      roomId,
      players: match.players.map(publicPlayer),
      category: match.category,
      difficulty: match.difficulty,
      gameKey: match.gameKey,
    });
    startQuestion(roomId);
    return roomId;
  }

  function removeFromQueue(uid) {
    const idx = queue.findIndex((x) => x.uid === uid);
    if (idx >= 0) queue.splice(idx, 1);
  }

  function tryPair(entry) {
    const compatible = queue
      .filter(
        (x) =>
          x.uid !== entry.uid &&
          x.category === entry.category &&
          x.difficulty === entry.difficulty &&
          x.gameKey === entry.gameKey &&
          Math.abs((x.rank || 0) - (entry.rank || 0)) <= ENIGMA_PULSE.RANK_BUCKET_MAX_DELTA
      )
      .sort((a, b) => Math.abs(a.rank - entry.rank) - Math.abs(b.rank - entry.rank));
    const best = compatible[0];
    if (!best) return false;
    removeFromQueue(entry.uid);
    removeFromQueue(best.uid);
    void startMatch(entry, best, 'queue', entry.gameKey);
    return true;
  }

  function scheduleReconnectGrace(roomId, uid) {
    clearReconnectGrace(roomId, uid);
    io.to(roomId).emit(EnigmaPulseEvents.RECONNECT_GRACE, {
      roomId,
      uid,
      ms: ENIGMA_PULSE.RECONNECT_GRACE_MS,
    });
    const t = setTimeout(() => {
      reconnectTimers.delete(reconnectKey(roomId, uid));
      void endMatch(roomId, 'disconnect_forfeit');
    }, ENIGMA_PULSE.RECONNECT_GRACE_MS);
    reconnectTimers.set(reconnectKey(roomId, uid), t);
  }

  function reconnectPlayer(socket, uid) {
    for (const [, match] of matches) {
      const target = match.players.find((p) => p.uid === uid);
      if (!target) continue;
      socket.join(match.roomId);
      match.sockets[uid] = socket.id;
      clearReconnectGrace(match.roomId, uid);
      socket.emit(EnigmaPulseEvents.SYNC_STATE, roomPayloadForUid(match, uid));
      io.to(match.roomId).emit(EnigmaPulseEvents.RECONNECT_CLEARED, { roomId: match.roomId, uid });
      return true;
    }
    return false;
  }

  function processAnswer({ roomId, userId, questionId, questionIndex, selectedIndex = null, answerText = '', useDoublePoints = false }) {
    const match = getMatch(roomId);
    if (!match || match.status !== 'playing') return;
    if (safeNow() > Number(match.deadlineMs || 0)) return;
    if (questionIndex !== match.questionIndex) return;
    const question = match.questionsByUid?.[userId]?.[match.questionIndex];
    if (!question || (questionId && String(question.id) !== String(questionId))) return;
    if (!match.players.some((x) => x.uid === userId)) return;
    if (match.currentTurnUid && userId !== match.currentTurnUid) return;
    const player = match.players.find((x) => x.uid === userId);
    if (!player || player.answered) return;
    const answers = match.answersByQuestion.get(match.questionIndex) || {};
    const existing = answers[userId] || { attemptsUsed: 0, correct: false, skipped: false };
    if (existing.correct || existing.skipped) return;
    if (player.attemptsLeft <= 0) {
      player.answered = true;
      answers[userId] = { ...existing, skipped: true, attemptsUsed: existing.attemptsUsed };
      match.answersByQuestion.set(match.questionIndex, answers);
      io.to(roomId).emit(EnigmaPulseEvents.OPPONENT_SKIPPED, { roomId, questionIndex, uid: userId });
      return;
    }
    const check = match.engine.validateAnswer({ question, answerText, selectedIndex });
    const used = Number(existing.attemptsUsed || 0) + 1;
    player.attemptsLeft = Math.max(0, ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION - used);
    const summary = match.questionSummary[match.questionSummary.length - 1];
    if (summary) {
      summary.attempts[userId] = used;
      summary.correctByUid[userId] = Boolean(check.correct);
    }
    if (check.correct) {
      const nextStreak = Number(player.streak || 0) + 1;
      player.streak = nextStreak;
      if (!player.matchStats) player.matchStats = createEmptyMatchStats();
      player.matchStats.correct = Number(player.matchStats.correct || 0) + 1;
      if (used === 1) {
        player.matchStats.firstTryCorrect = Number(player.matchStats.firstTryCorrect || 0) + 1;
      }
      syncMaxStreak(player.matchStats, nextStreak);
      const isSyllogism = String(match.gameKey || '').toLowerCase() === 'syllogism';
      const streakBonus = isSyllogism ? (nextStreak >= 5 ? 10 : nextStreak >= 3 ? 5 : 0) : nextStreak >= 3 ? 10 : nextStreak === 2 ? 5 : 0;
      const secondsRemaining = Math.max(0, Math.ceil((Number(match.deadlineMs || 0) - safeNow()) / 1000));
      const timeBonus = isSyllogism ? Math.min(10, secondsRemaining) : 0;
      const canDouble = Boolean(useDoublePoints) && Number(player?.powerUps?.doublePoints || 0) > 0;
      if (canDouble) player.powerUps.doublePoints -= 1;
      const scoreDelta = (10 + streakBonus + timeBonus) * (canDouble ? 2 : 1);
      const coinsDelta = Math.max(1, Math.round(scoreDelta / 2));
      player.score += scoreDelta;
      player.coinsEarned = Number(player.coinsEarned || 0) + Number(coinsDelta || 0);
      player.answered = true;
      answers[userId] = { attemptsUsed: used, correct: true, skipped: false };
    } else {
      player.streak = 0;
      answers[userId] = { attemptsUsed: used, correct: false, skipped: false };
      if (player.attemptsLeft <= 0) {
        player.answered = true;
        if (!player.matchStats) player.matchStats = createEmptyMatchStats();
        player.matchStats.wrong = Number(player.matchStats.wrong || 0) + 1;
      }
    }
    match.answersByQuestion.set(match.questionIndex, answers);
    io.to(roomId).emit(EnigmaPulseEvents.OPPONENT_ANSWERED, {
      roomId,
      questionIndex,
      uid: userId,
      attemptsLeft: player.attemptsLeft,
      locked: player.answered,
      correct: Boolean(check.correct),
      powerUps: player.powerUps,
    });
    if (player.answered) resolveQuestion(roomId, 'turn_answered');
  }

  function removeWaitingPrivateHost(roomId, me) {
    const m = getMatch(roomId);
    if (!m || m.status !== 'waiting' || m.players[0]?.uid !== me) return false;
    io.to(roomId).emit(EnigmaPulseEvents.PRIVATE_CANCELLED, { roomId, reason: 'host_returned_lobby' });
    matches.delete(roomId);
    return true;
  }

  return function register(socket) {
    const uid = () => String(socket.user?.uid || '').trim();
    const userId = uid();
    if (userId) addUserSocket(userId, socket.id);

    socket.on(EnigmaPulseEvents.JOIN_QUEUE, (payload) => {
      const me = uid();
      if (!me) return;
      const p = validateQueuePayload(payload);
      const entry = {
        socketId: socket.id,
        uid: me,
        displayName: p.displayName,
        photoURL: p.photoURL,
        category: p.category,
        difficulty: p.difficulty,
        gameKey: p.gameKey,
        rank: rankBucket(p.xp),
        isBot: false,
      };
      if (p.soloBot) {
        removeFromQueue(me);
        const bot = {
          socketId: socket.id,
          uid: `ep_bot_${uuidv4().slice(0, 8)}`,
          displayName: 'EnigmaBot',
          photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=EnigmaBot',
          category: entry.category,
          difficulty: entry.difficulty,
          gameKey: entry.gameKey,
          rank: entry.rank,
          isBot: true,
        };
        void startMatch(entry, bot, 'practice', entry.gameKey);
        return;
      }
      removeFromQueue(me);
      queue.push(entry);
      socket.emit(EnigmaPulseEvents.WAITING, { message: 'Searching for opponent...' });
      if (tryPair(entry)) return;
      setTimeout(() => {
        const still = queue.find((x) => x.uid === me);
        if (!still) return;
        removeFromQueue(me);
        const gk = String(still.gameKey || '').toLowerCase();
        if (['riddle_classic', 'syllogism'].includes(gk) || isPatternRecognitionGameKey(gk)) {
          const bot = {
            socketId: socket.id,
            uid: `ep_bot_${uuidv4().slice(0, 8)}`,
            displayName: 'EnigmaBot',
            photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=EnigmaBot',
            category: still.category,
            difficulty: still.difficulty,
            gameKey: still.gameKey,
            rank: still.rank,
            isBot: true,
          };
          void startMatch(still, bot, 'fallback_bot', still.gameKey);
          return;
        }
        emitError(socket, 'No player found in queue window', 'QUEUE_TIMEOUT');
      }, ENIGMA_PULSE.MATCHMAKING_TIMEOUT_MS);
    });

    socket.on(EnigmaPulseEvents.LEAVE_QUEUE, () => removeFromQueue(uid()));

    socket.on(EnigmaPulseEvents.RETURN_TO_LOBBY, ({ roomId }) => {
      const me = uid();
      if (!me) return;
      removeFromQueue(me);
      if (!roomId) return;
      if (removeWaitingPrivateHost(roomId, me)) return;
      const m = getMatch(roomId);
      if (!m || !m.players.some((p) => p.uid === me)) return;
      const meState = m.players.find((p) => p.uid === me);
      const preStartReturn =
        Number(m.questionIndex || 0) === 0 &&
        Number(meState?.score || 0) === 0 &&
        Number(m.questionSummary?.length || 0) === 0;
      if (m.status === 'playing') {
        if (preStartReturn) {
          m.forfeitUid = '';
          void endMatch(roomId, 'returned_lobby_prestart');
        } else {
          m.forfeitUid = me;
          void endMatch(roomId, 'leave_forfeit');
        }
      } else {
        socket.leave(roomId);
      }
    });

    socket.on(EnigmaPulseEvents.LEAVE_MATCH, ({ roomId }) => {
      const me = uid();
      if (!me || !roomId) return;
      const m = getMatch(roomId);
      if (!m || m.status !== 'playing' || !m.players.some((p) => p.uid === me)) return;
      m.forfeitUid = me;
      m.lifecycleStatus = 'COMPLETED';
      void endMatch(roomId, 'leave_forfeit');
    });

    socket.on(EnigmaPulseEvents.CREATE_PRIVATE, async (payload) => {
      const me = uid();
      if (!me) return;
      const p = validateQueuePayload(payload);
      const deduct = await tryDeductGameEntryFee(me, GAME_KEYS.ENIGMA_PULSE, {
        variantKey: p.gameKey,
      });
      if (!deduct.ok) {
        return emitError(socket, deduct.error || 'Insufficient coins', 'INSUFFICIENT_COINS');
      }
      const roomId = uuidv4();
      const host = {
        uid: me,
        displayName: p.displayName,
        photoURL: p.photoURL,
        score: 0,
        coinsEarned: 0,
        streak: 0,
        answered: false,
        attemptsLeft: ENIGMA_PULSE.MAX_ATTEMPTS_PER_QUESTION,
        powerUps: { fiftyFifty: 1, skip: 1, doublePoints: 1 },
      };
      const waitingRoom = {
        roomId,
        status: 'waiting',
        lifecycleStatus: 'MATCHMAKING',
        createdAtMs: safeNow(),
        category: p.category,
        difficulty: p.difficulty,
        gameKey: p.gameKey,
        players: [host],
        sockets: { [me]: socket.id },
        questionIndex: 0,
        questionsByUid: {},
        clientQuestionsByUid: {},
        questionTarget: 0,
        answersByQuestion: new Map(),
        matchType: 'private',
        deadlineMs: null,
        questionSummary: [],
        entryFeeByUid: { [me]: deduct.entryFee },
        entryFee: deduct.entryFee,
      };
      matches.set(roomId, waitingRoom);
      socket.join(roomId);
      socket.emit(EnigmaPulseEvents.PRIVATE_CREATED, { roomId, match: roomPayloadForUid(waitingRoom, me) });
    });

    socket.on(EnigmaPulseEvents.JOIN_PRIVATE, async (payload) => {
      const me = uid();
      const p = validateJoinPrivatePayload(payload);
      if (!me || !p.roomId) return;
      const m = getMatch(p.roomId);
      if (!m) return emitError(socket, 'Room not found', 'ROOM_NOT_FOUND');
      if (m.status !== 'waiting') return emitError(socket, 'Room is not joinable', 'ROOM_STATE_INVALID');
      if (m.players[0]?.uid === me) return emitError(socket, 'Host cannot self-join as guest', 'HOST_SELF_JOIN');
      if (m.players.length >= 2) return emitError(socket, 'Room is full', 'ROOM_FULL');
      const host = {
        socketId: m.sockets[m.players[0].uid],
        uid: m.players[0].uid,
        displayName: m.players[0].displayName,
        photoURL: m.players[0].photoURL,
        category: m.category,
        difficulty: m.difficulty,
        gameKey: m.gameKey,
        isBot: false,
      };
      const guestEntry = {
        socketId: socket.id,
        uid: me,
        displayName: p.displayName,
        photoURL: p.photoURL,
        category: m.category,
        difficulty: m.difficulty,
        gameKey: m.gameKey,
        isBot: false,
      };
      matches.delete(p.roomId);
      await startMatch(host, guestEntry, 'private', m.gameKey, {
        prepaidEntryFees: m.entryFeeByUid || {},
      });
    });

    socket.on(EnigmaPulseEvents.CANCEL_PRIVATE, async ({ roomId }) => {
      const m = getMatch(roomId);
      const me = uid();
      if (!m || m.status !== 'waiting' || m.players[0]?.uid !== me) return;
      const fee = Number(m.entryFeeByUid?.[me] || 0);
      if (fee > 0) await refundGameEntryFee(me, fee, 'EnigmaPulse');
      io.to(roomId).emit(EnigmaPulseEvents.PRIVATE_CANCELLED, { roomId, reason: 'host_cancelled' });
      matches.delete(roomId);
    });

    socket.on(EnigmaPulseEvents.USE_HINT, ({ roomId, questionIndex }) => {
      const me = uid();
      const match = getMatch(roomId);
      if (!me || !match || match.status !== 'playing' || questionIndex !== match.questionIndex) return;
      if (match.currentTurnUid && match.currentTurnUid !== me) return;
      const player = match.players.find((x) => x.uid === me);
      if (!player || player.usedHint || player.answered) return;
      player.usedHint = true;
      const q = match.questionsByUid?.[me]?.[match.questionIndex];
      if (!q) return;
      const hint = getHintPreview(q);
      socket.emit(EnigmaPulseEvents.OPPONENT_USED_HINT, { roomId, questionIndex, uid: me, hint });
      socket.to(roomId).emit(EnigmaPulseEvents.OPPONENT_USED_HINT, { roomId, questionIndex, uid: me });
    });

    socket.on(EnigmaPulseEvents.SKIP_QUESTION, ({ roomId, questionIndex }) => {
      const me = uid();
      const match = getMatch(roomId);
      if (!me || !match || match.status !== 'playing' || questionIndex !== match.questionIndex) return;
      const player = match.players.find((x) => x.uid === me);
      if (!player || player.answered || (match.currentTurnUid && match.currentTurnUid !== me)) return;
      if (Number(player?.powerUps?.skip || 0) <= 0) return;
      player.powerUps.skip -= 1;
      player.skipped = true;
      player.answered = true;
      player.attemptsLeft = 0;
      player.streak = 0;
      const answers = match.answersByQuestion.get(match.questionIndex) || {};
      const existing = answers[me] || { attemptsUsed: 0, correct: false };
      answers[me] = { ...existing, skipped: true, correct: false };
      match.answersByQuestion.set(match.questionIndex, answers);
      const summary = match.questionSummary[match.questionSummary.length - 1];
      if (summary) summary.skippedByUid[me] = true;
      io.to(roomId).emit(EnigmaPulseEvents.OPPONENT_SKIPPED, { roomId, questionIndex, uid: me });
      resolveQuestion(roomId, 'skipped');
    });

    socket.on(EnigmaPulseEvents.SUBMIT_ANSWER, (payload) => {
      const me = uid();
      if (!me) return;
      const data = validateSubmitPayload(payload);
      if (!data.valid) return;
      const match = getMatch(data.roomId);
      if (match && match.status === 'playing' && match.currentTurnUid && me !== match.currentTurnUid) {
        emitError(socket, 'Not your turn', 'EP_NOT_YOUR_TURN');
        return;
      }
      processAnswer({
        roomId: data.roomId,
        userId: me,
        questionId: data.questionId,
        questionIndex: data.questionIndex,
        selectedIndex: data.selectedIndex,
        answerText: data.answerText,
        useDoublePoints: data.useDoublePoints,
      });
    });

    socket.on(EnigmaPulseEvents.REQUEST_SYNC_STATE, ({ roomId }) => {
      const me = uid();
      const match = getMatch(roomId);
      if (!me || !match || !match.players.some((p) => p.uid === me)) return;
      socket.emit(EnigmaPulseEvents.SYNC_STATE, roomPayloadForUid(match, me));
    });

    socket.on(EnigmaPulseEvents.ADMIN_EDIT_QUESTION, async (data) => {
      const auth = await assertEnigmaSocketAdmin(socket);
      if (!auth.ok) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: auth.message });
        return;
      }
      const { roomId, questionId, updateFields } = data || {};
      if (!roomId || !questionId || !updateFields || typeof updateFields !== 'object') {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'roomId, questionId, and updateFields are required' });
        return;
      }
      if (!isFirestoreBackedQuestionId(questionId)) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'Cannot edit local fallback questions from the game room' });
        return;
      }
      const match = getMatch(roomId);
      if (!match || match.status !== 'playing') {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'Match not found or not in progress' });
        return;
      }
      if (String(match.gameKey || '').toLowerCase() !== 'syllogism') {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'In-match question edit is only supported for Syllogism' });
        return;
      }
      try {
        const patch = {
          ...updateFields,
          gameType: 'enigma_pulse',
          type: 'syllogism',
          category: 'Syllogism',
        };
        const updated = await updateQuestion(questionId, patch, auth.uid);
        clearSyllogismPoolCache();
        const slots = patchMatchDecksWithUpdated(match, updated, 'syllogism');
        const indices = [...new Set(slots.map((s) => s.index))];
        broadcastDeckSyncToRoom(match, io, EnigmaPulseEvents, roomPayloadForUid, indices);
        console.info('[EnigmaPulse][admin_question] edit', { roomId, questionId, adminUid: auth.uid });
        socket.emit(EnigmaPulseEvents.ADMIN_ACTION_SUCCESS, { action: 'edit', questionId, roomId });
      } catch (err) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, {
          message: err?.message || 'Failed to update question',
        });
      }
    });

    socket.on(EnigmaPulseEvents.ADMIN_DELETE_QUESTION, async (data) => {
      const auth = await assertEnigmaSocketAdmin(socket);
      if (!auth.ok) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: auth.message });
        return;
      }
      const { roomId, questionId } = data || {};
      if (!roomId || !questionId) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'roomId and questionId are required' });
        return;
      }
      if (!isFirestoreBackedQuestionId(questionId)) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'Cannot delete local fallback questions from the game room' });
        return;
      }
      const match = getMatch(roomId);
      if (!match || match.status !== 'playing') {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'Match not found or not in progress' });
        return;
      }
      if (String(match.gameKey || '').toLowerCase() !== 'syllogism') {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, { message: 'In-match question delete is only supported for Syllogism' });
        return;
      }
      try {
        await updateQuestion(questionId, { active: false }, auth.uid);
        clearSyllogismPoolCache();
        const { hitsCurrent, slotCount } = tombstoneQuestionIdInDecks(match, questionId, 'syllogism');
        const indices = findQuestionSlots(match, questionId).map((s) => s.index);
        broadcastDeckSyncToRoom(match, io, EnigmaPulseEvents, roomPayloadForUid, indices);
        if (hitsCurrent) {
          clearTimer(roomId);
          clearBotTimer(roomId);
          resolveQuestion(roomId, 'admin_skip');
        }
        console.info('[EnigmaPulse][admin_question] delete', {
          roomId,
          questionId,
          adminUid: auth.uid,
          slotCount,
          hitsCurrent,
        });
        socket.emit(EnigmaPulseEvents.ADMIN_ACTION_SUCCESS, { action: 'delete', questionId, roomId });
      } catch (err) {
        socket.emit(EnigmaPulseEvents.ADMIN_ERROR, {
          message: err?.message || 'Failed to delete question',
        });
      }
    });

    socket.on(EnigmaPulseEvents.CREATE_INVITE, async (payload) => {
      const me = uid();
      if (!me) return;
      const p = validateInvitePayload(payload);
      if (!p.targetUserId && !p.targetEmail) return emitError(socket, 'targetUserId or targetEmail is required', 'INVITE_INVALID');
      const inviteId = uuidv4();
      const inviteLink = `${String(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')}/enigmaPulseLobby?inviteId=${encodeURIComponent(inviteId)}`;
      await createEnigmaInvite({
        inviteId,
        fromUserId: me,
        toUserId: p.targetUserId || null,
        toEmail: p.targetEmail || null,
        gameType: ENIGMA_PULSE.GAME_TYPE,
        gameKey: p.gameKey,
        category: p.category,
        difficulty: p.difficulty,
        expiresAtMs: safeNow() + ENIGMA_PULSE.INVITE_TTL_MS,
      });
      if (p.targetUserId) {
        await createNotification({
          userId: p.targetUserId,
          type: 'invite',
          message: 'You received an EnigmaPulse invite.',
          meta: { inviteId, gameType: ENIGMA_PULSE.GAME_TYPE },
        });
        notifyUser(p.targetUserId, {
          type: 'invite',
          message: 'You received an EnigmaPulse invite.',
          inviteId,
          gameType: ENIGMA_PULSE.GAME_TYPE,
        });
      }
      socket.emit(EnigmaPulseEvents.INVITE_CREATED, {
        inviteId,
        inviteLink,
        whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Join my EnigmaPulse match: ${inviteLink}`)}`,
      });
    });

    socket.on(EnigmaPulseEvents.ACCEPT_INVITE_LINK, async ({ inviteId, displayName, photoURL }) => {
      const me = uid();
      if (!me || !inviteId) return;
      const invite = await getInviteById(inviteId);
      if (!invite) return emitError(socket, 'Invite not found', 'INVITE_NOT_FOUND');
      if (String(invite.gameType || '') !== ENIGMA_PULSE.GAME_TYPE) return emitError(socket, 'Invite game mismatch', 'INVITE_GAME_MISMATCH');
      if (String(invite.status || '') !== 'pending') return emitError(socket, 'Invite already used', 'INVITE_USED');
      if (invite.toUserId && String(invite.toUserId) !== me) return emitError(socket, 'Invite not for this user', 'INVITE_UNAUTHORIZED');
      const expiresMs = invite.expiresAt?.toMillis?.() || new Date(invite.expiresAt || 0).getTime();
      if (safeNow() > expiresMs) {
        await markInviteExpired(inviteId);
        return emitError(socket, 'Invite expired', 'INVITE_EXPIRED');
      }
      const hostSocketId = invite.fromUserId ? (Array.from(userSockets.get(invite.fromUserId) || [])[0] || socket.id) : socket.id;
      const hostEntry = {
        socketId: hostSocketId,
        uid: invite.fromUserId,
        displayName: 'Host',
        photoURL: '',
        category: invite.category || 'General Knowledge',
        difficulty: invite.difficulty || 'medium',
        gameKey: invite.gameKey || 'riddle_classic',
        isBot: false,
      };
      const guestEntry = {
        socketId: socket.id,
        uid: me,
        displayName: displayName || 'Player',
        photoURL: photoURL || '',
        category: hostEntry.category,
        difficulty: hostEntry.difficulty,
        gameKey: hostEntry.gameKey,
        isBot: false,
      };
      const roomId = await startMatch(hostEntry, guestEntry, 'invite', hostEntry.gameKey);
      if (!roomId) return;
      await markInviteAccepted(inviteId, { userId: me, roomId });
      await createNotification({
        userId: invite.fromUserId,
        type: 'match',
        message: 'Your Enigma invite was accepted.',
        meta: { inviteId, roomId, gameType: ENIGMA_PULSE.GAME_TYPE },
      });
      notifyUser(invite.fromUserId, {
        type: 'match',
        message: 'Your Enigma invite was accepted.',
        inviteId,
        roomId,
      });
      socket.emit(EnigmaPulseEvents.INVITE_ACCEPTED, { inviteId, roomId, gameKey: hostEntry.gameKey });
    });

    socket.on(EnigmaPulseEvents.LIST_NOTIFICATIONS, async () => {
      socket.emit(EnigmaPulseEvents.NOTIFICATIONS_LIST, { items: [] });
    });

    socket.on(EnigmaPulseEvents.MARK_NOTIFICATION_READ, async ({ notificationId }) => {
      const me = uid();
      if (!me || !notificationId) return;
      await markNotificationRead(notificationId, me);
    });

    socket.on(EnigmaPulseEvents.RECONNECT, () => reconnectPlayer(socket, uid()));
    socket.on('reconnect_user', () => reconnectPlayer(socket, uid()));

    socket.on('disconnect', () => {
      const me = removeUserSocket(socket.id) || uid();
      removeFromQueue(me);
      for (const [roomId, m] of matches) {
        if (m.status === 'waiting' && m.players[0]?.uid === me) {
          io.to(roomId).emit(EnigmaPulseEvents.PRIVATE_CANCELLED, { roomId, reason: 'host_disconnected' });
          matches.delete(roomId);
          continue;
        }
        if (m.status !== 'playing') continue;
        if (m.sockets[me] === socket.id) {
          delete m.sockets[me];
          scheduleReconnectGrace(roomId, me);
          break;
        }
      }
    });
  };
}
