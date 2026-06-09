import { v4 as uuidv4 } from 'uuid';
import * as userFirestoreAdmin from './userFirestoreAdmin.js';
import {
  fetchQuestionsFromFirestore,
  recordPlayedQuestions,
} from './firestoreQuestionBank.js';
import { deleteQuestion, updateQuestion } from './firestoreQuestionAdmin.js';
import { getAdminFirestore } from './firebaseAdmin.js';
import {
  triviaLog,
  triviaCheckpoint,
  debugRealtime,
} from './gameRealtimeDebug.js';
import { GAME_KEYS, refundGameEntryFee, tryDeductGameEntryFee } from './gameEntryFee.js';
import { getTriviaVariantSettings } from './gameConfigService.js';
import {
  computeTriviaMatchRewards,
  createEmptyTriviaMatchStats,
  recordTriviaAnswer,
  summarizeTriviaPerformance,
  syncTriviaMaxStreak,
} from '../../../shared/trivia/performanceBonuses.js';

function agentDebugLog(location, message, data, hypothesisId, runId = 'run1') {
  // #region agent log
  fetch('http://127.0.0.1:7889/ingest/315b70b2-50ee-40dc-9f35-3f8c09643cc1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '384503',
    },
    body: JSON.stringify({
      sessionId: '384503',
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => { });
  // #endregion
}

function mapFirestoreBankError(error) {
  if (error?.code === 'FIRESTORE_UNAVAILABLE') {
    return 'Game database is temporarily unavailable. Please try again shortly.';
  }
  if (error?.code === 'INSUFFICIENT_QUESTIONS') {
    return 'No questions available for this category. Please try another category or try again later.';
  }
  const msg = String(error?.message || error || '');
  const code = error?.code;
  const looksLikeIndex =
    code === 9 ||
    String(code).toLowerCase() === 'failed-precondition' ||
    /failed_precondition|requires an index/i.test(msg);
  if (looksLikeIndex) {
    console.error('[Trivia] Firestore index or query error (full message for ops):', msg);
    return 'Quiz data is still updating. Please try again in a minute. If this keeps happening, contact support.';
  }
  return error?.message || 'No questions available for this category';
}

const MATCHMAKING_TIMEOUT_MS = 12000;
const RECONNECT_GRACE_MS = 10000;
const REMATCH_TIMEOUT_MS = 60000;
const ENDED_SNAPSHOT_TTL_MS = 120000;
const QUESTION_COUNT = 20;
const QUESTION_SEC = 15;
const BOT_MIN_MS = 2000;
const BOT_MAX_MS = 6000;

function newTriviaPlayer({ uid, displayName, photoURL, isBot = false }) {
  return {
    uid,
    displayName: displayName || (isBot ? 'TriviaBot' : 'Player'),
    photoURL: photoURL || '',
    isBot: Boolean(isBot),
    score: 0,
    correctCount: 0,
    currentStreak: 0,
    matchStats: createEmptyTriviaMatchStats(),
  };
}

function botCorrectRate(difficulty) {
  const d = String(difficulty || 'easy').toLowerCase();
  if (d === 'easy') return 0.6;
  if (d === 'medium') return 0.75;
  return 0.85;
}

function normalizeTriviaCategory(category) {
  const c = String(category || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (c === 'current_affairs' || c === 'current-affairs' || c === 'current affairs') {
    return 'current_affairs';
  }
  return 'history';
}

function publicQuestion(q) {
  if (!q) return null;
  const { id, category, difficulty, imageUrl, options, text } = q;
  return { id, category, difficulty, imageUrl, options, text };
}

function stripQuestionsForClient(questions) {
  return (questions || []).map(publicQuestion);
}

function toPlayerMap(players) {
  return (players || []).reduce((acc, player) => {
    if (!player?.uid) return acc;
    acc[player.uid] = {
      uid: player.uid,
      displayName: player.displayName || 'Player',
      photoURL: player.photoURL || '',
      isBot: Boolean(player.isBot),
      score: Number(player.score) || 0,
      correctCount: Number(player.correctCount) || 0,
    };
    return acc;
  }, {});
}

async function persistGameDoc(roomId, match, questions) {
  const db = getAdminFirestore();
  if (!db || !roomId || !match) return;
  try {
    await db.collection('games').doc(roomId).set(
      {
        status: match.status,
        gameType: 'trivia',
        category: match.category,
        difficulty: match.difficulty,
        currentQuestionIndex: match.gameState?.currentQuestionIndex ?? 0,
        currentTurnUid: match.gameState?.currentTurnUid || null,
        questions: Array.isArray(questions) ? questions : [],
        players: toPlayerMap(match.players),
        createdAt: match.createdAt || Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('[Trivia] Failed to persist game doc:', e?.message || e);
  }
}

/** Remove server-only fields from match payload. */
function publicMatch(m) {
  const o = JSON.parse(JSON.stringify(m));
  const full = o._fullQuestions;
  delete o._fullQuestions;
  delete o.sockets;
  delete o.hostFeeUserId;
  delete o.guestFeeUserId;
  if (o.gameState && full) {
    const idx = o.gameState.currentQuestionIndex ?? 0;
    o.gameState.questions = stripQuestionsForClient(full);
    o.gameState.currentQuestion = publicQuestion(full[idx]) || null;
  }
  for (const p of o.players || []) {
    delete p.matchStats;
    delete p.currentStreak;
  }
  return o;
}

/**
 * @param {import('socket.io').Server} io
 */
export function createTriviaHandlers(io) {
  /** @type {Array<{ socketId: string, uid: string, displayName: string, photoURL: string, difficulty: string, category: string, soloBot?: boolean }>} */
  const queue = [];
  const matches = new Map();
  /** @type {Map<string, { players: object[], category: string, difficulty: string, matchType: string, playerOrder: string[], endedAt: number }>} */
  const endedSnapshots = new Map();
  /** @type {Map<string, { sourceRoomId: string, category: string, difficulty: string, matchType: string, players: object[], playerOrder: string[], accepted: Set<string>, socketIds: Record<string, string>, expiresAt: number, timeoutId: ReturnType<typeof setTimeout>|null }>} */
  const rematchOffers = new Map();
  /** roomId -> interval */
  const questionTimers = new Map();
  const botFallbackTimers = new Map();
  const botThinkTimers = new Map();
  /** `roomId:uid` -> Timeout */
  const reconnectGraceTimers = new Map();
  /** roomId -> Timeout */
  const endedSnapshotTimers = new Map();

  function graceKey(roomId, uid) {
    return `${roomId}:${uid}`;
  }

  function clearReconnectGrace(roomId, uid) {
    const k = graceKey(roomId, uid);
    const t = reconnectGraceTimers.get(k);
    if (t) {
      clearTimeout(t);
      reconnectGraceTimers.delete(k);
    }
  }

  function forfeitMatchAfterGrace(roomId, disconnectedUid) {
    const m = matches.get(roomId);
    if (!m || m.status !== 'playing') return;
    triviaLog('Reconnect grace expired — forfeit', disconnectedUid, { roomId });
    const other = otherPlayerUid(m, disconnectedUid);
    if (!other) return;
    void finalizeMatchEnd(roomId, {
      endReason: 'disconnect_forfeit',
      forfeitUid: disconnectedUid,
    });
  }

  function scheduleReconnectGrace(roomId, uid) {
    const k = graceKey(roomId, uid);
    clearReconnectGrace(roomId, uid);
    triviaLog('Player disconnected — reconnect grace', RECONNECT_GRACE_MS, {
      roomId,
      uid,
    });
    io.to(roomId).emit('trivia_reconnect_grace', {
      roomId,
      disconnectedUid: uid,
      ms: RECONNECT_GRACE_MS,
    });
    const tid = setTimeout(() => {
      reconnectGraceTimers.delete(k);
      forfeitMatchAfterGrace(roomId, uid);
    }, RECONNECT_GRACE_MS);
    reconnectGraceTimers.set(k, tid);
  }

  function clearQuestionTimer(roomId) {
    const id = questionTimers.get(roomId);
    if (id) {
      clearInterval(id);
      questionTimers.delete(roomId);
    }
  }

  function clearBotFallback(socketId) {
    const t = botFallbackTimers.get(socketId);
    if (t) {
      clearTimeout(t);
      botFallbackTimers.delete(socketId);
    }
  }

  function clearBotThink(roomId) {
    const t = botThinkTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      botThinkTimers.delete(roomId);
    }
  }

  function removeFromQueueBySocket(socketId) {
    const i = queue.findIndex((e) => e.socketId === socketId);
    if (i >= 0) queue.splice(i, 1);
  }

  function removeFromQueueByUid(uid) {
    const i = queue.findIndex((e) => e.uid === uid);
    if (i >= 0) queue.splice(i, 1);
  }

  function sameLobby(a, b) {
    return a.difficulty === b.difficulty && a.category === b.category;
  }

  function bucketFromXp(xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    return Math.floor(safeXp / 1000);
  }

  function findQueueMatch(entry) {
    const candidates = queue.filter((e) => e.uid !== entry.uid && sameLobby(e, entry));
    if (!candidates.length) return null;
    candidates.sort(
      (a, b) =>
        Math.abs((a.rankBucket ?? 0) - (entry.rankBucket ?? 0)) -
        Math.abs((b.rankBucket ?? 0) - (entry.rankBucket ?? 0))
    );
    const best = candidates[0];
    if (Math.abs((best.rankBucket ?? 0) - (entry.rankBucket ?? 0)) > 1) {
      return null;
    }
    return best;
  }

  async function tryDeduct(uid, category) {
    return tryDeductGameEntryFee(uid, GAME_KEYS.TRIVIA, {
      variantKey: normalizeTriviaCategory(category),
    });
  }

  async function refundFee(userId, entryFee) {
    await refundGameEntryFee(userId, entryFee, 'Trivia');
  }

  function otherPlayerUid(match, uid) {
    const other = match.players.find((p) => p.uid !== uid);
    return other?.uid || null;
  }

  function getCurrentBot(match) {
    const uid = match.gameState.currentTurnUid;
    return match.players.find((p) => p.uid === uid && p.isBot);
  }

  function saveEndedSnapshot(match, roomId) {
    if (!match || !roomId) return;
    const playerOrder = (match.players || []).map((p) => p.uid).filter(Boolean);
    endedSnapshots.set(roomId, {
      players: (match.players || []).map((p) => ({
        uid: p.uid,
        displayName: p.displayName || 'Player',
        photoURL: p.photoURL || '',
        isBot: Boolean(p.isBot),
      })),
      category: match.category,
      difficulty: match.difficulty,
      matchType: match.matchType,
      playerOrder,
      endedAt: Date.now(),
    });
    const prev = endedSnapshotTimers.get(roomId);
    if (prev) clearTimeout(prev);
    endedSnapshotTimers.set(
      roomId,
      setTimeout(() => {
        endedSnapshots.delete(roomId);
        endedSnapshotTimers.delete(roomId);
        const offer = rematchOffers.get(roomId);
        if (offer) clearRematchOffer(roomId, 'expired');
      }, ENDED_SNAPSHOT_TTL_MS)
    );
  }

  function emitRematchFailed(target, payload) {
    const msg = payload?.message || 'Rematch unavailable';
    if (typeof target === 'string') {
      io.to(target).emit('trivia_rematch_failed', { ...payload, message: msg });
      return;
    }
    target?.emit?.('trivia_rematch_failed', { ...payload, message: msg });
  }

  function clearRematchOffer(sourceRoomId, reason) {
    const offer = rematchOffers.get(sourceRoomId);
    if (!offer) return;
    if (offer.timeoutId) clearTimeout(offer.timeoutId);
    rematchOffers.delete(sourceRoomId);

    const failMsg =
      reason === 'opponent_declined'
        ? 'Opponent left — rematch cancelled'
        : reason === 'timeout'
          ? 'Rematch request timed out'
          : reason === 'disconnect'
            ? 'Opponent disconnected — rematch cancelled'
            : 'Rematch unavailable';

    for (const uid of offer.accepted) {
      const sid = offer.socketIds[uid];
      if (sid) {
        emitRematchFailed(sid, { reason: reason || 'cancelled', message: failMsg, sourceRoomId });
      }
    }
  }

  function isUidInActiveMatch(uid) {
    for (const [, match] of matches) {
      if (match.status === 'playing' && match.players.some((p) => p.uid === uid && !p.isBot)) {
        return true;
      }
    }
    return false;
  }

  function isUidInQueue(uid) {
    return queue.some((e) => e.uid === uid);
  }

  function rematchFirstTurnUid(snapshot) {
    const secondUid = snapshot.playerOrder?.[1];
    if (!secondUid) return snapshot.playerOrder?.[0] || null;
    const secondPlayer = snapshot.players.find((p) => p.uid === secondUid);
    if (secondPlayer?.isBot) return '__BOT__';
    return secondUid;
  }

  function scheduleRematchOfferExpiry(sourceRoomId) {
    const offer = rematchOffers.get(sourceRoomId);
    if (!offer) return;
    if (offer.timeoutId) clearTimeout(offer.timeoutId);
    offer.expiresAt = Date.now() + REMATCH_TIMEOUT_MS;
    offer.timeoutId = setTimeout(() => {
      clearRematchOffer(sourceRoomId, 'timeout');
    }, REMATCH_TIMEOUT_MS);
  }

  async function disposeWaitingRoom(roomId, reason) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'waiting') return;
    clearQuestionTimer(roomId);
    clearBotThink(roomId);
    const hostUid = match.players[0]?.uid;
    if (hostUid) clearReconnectGrace(roomId, hostUid);
    if (match.hostFeeUserId) await refundFee(match.hostFeeUserId, match.hostEntryFee);
    matches.delete(roomId);
    io.to(roomId).emit('trivia_private_cancelled', { roomId, reason: reason || 'cancelled' });
  }

  function broadcastUpdate(match) {
    io.to(match.roomId).emit('trivia_update_game', publicMatch(match));
  }

  /** @returns {boolean} true if this socket was bound to a trivia match */
  function reconnectTriviaPlayer(socket, reconnectUid) {
    if (!reconnectUid || typeof reconnectUid !== 'string') return false;
    for (const [, match] of matches) {
      const isPlayer = match.players.some((p) => p.uid === reconnectUid);
      if (isPlayer) {
        clearReconnectGrace(match.roomId, reconnectUid);
        io.to(match.roomId).emit('trivia_reconnect_cleared', {
          roomId: match.roomId,
          uid: reconnectUid,
        });
        socket.join(match.roomId);
        match.sockets[reconnectUid] = socket.id;
        triviaLog('Player reconnected', match.roomId, { uid: reconnectUid });
        debugRealtime('TRIVIA', 'reconnect_user', {
          roomId: match.roomId,
          uid: reconnectUid,
        });
        socket.emit('trivia_update_game', publicMatch(match));
        return true;
      }
    }
    return false;
  }

  function startQuestionTimer(roomId) {
    clearQuestionTimer(roomId);
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;

    match.gameState.questionStartedAt = Date.now();
    let left = QUESTION_SEC;
    triviaLog('Timer tick (question)', roomId, { secondsLeft: left });
    io.to(roomId).emit('trivia_timer_update', { roomId, secondsLeft: left });

    const interval = setInterval(() => {
      left -= 1;
      io.to(roomId).emit('trivia_timer_update', { roomId, secondsLeft: left });
      if (left <= 0) {
        clearInterval(interval);
        questionTimers.delete(roomId);
        onQuestionTimeout(roomId);
      }
    }, 1000);
    questionTimers.set(roomId, interval);
  }

  function onQuestionTimeout(roomId) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;
    clearBotThink(roomId);
    const turnUid = match.gameState.currentTurnUid;
    const p = match.players.find((x) => x.uid === turnUid);
    if (p) {
      recordTriviaAnswer(p.matchStats, { timedOut: true });
      p.currentStreak = 0;
      syncTriviaMaxStreak(p.matchStats, p.currentStreak);
    }
    advanceAfterResult(roomId, false);
  }

  function advanceAfterResult(roomId, hadCorrect) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;
    void hadCorrect;

    const idx = match.gameState.currentQuestionIndex;
    if (idx + 1 >= match._fullQuestions.length) {
      void endMatch(roomId);
      return;
    }

    match.gameState.currentQuestionIndex = idx + 1;
    const nextUid = otherPlayerUid(match, match.gameState.currentTurnUid);
    match.gameState.currentTurnUid = nextUid || match.players[0].uid;
    match.gameState.currentQuestion = publicQuestion(
      match._fullQuestions[match.gameState.currentQuestionIndex]
    );

    broadcastUpdate(match);
    startQuestionTimer(roomId);
    scheduleBotIfNeeded(roomId);
  }

  function processHumanAnswer(roomId, uid, selectedIndex) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;
    if (match.gameState.currentTurnUid !== uid) return;

    const qIdx = match.gameState.currentQuestionIndex;
    const q = match._fullQuestions[qIdx];
    if (!q) return;

    const correct = Number(selectedIndex) === Number(q.correctIndex);
    const p = match.players.find((x) => x.uid === uid);
    if (p) {
      const startedAt = Number(match.gameState.questionStartedAt) || Date.now();
      const answerMs = Math.max(0, Date.now() - startedAt);
      recordTriviaAnswer(p.matchStats, { correct, answerMs, timedOut: false });
      if (correct) {
        p.score += 10;
        p.correctCount += 1;
        p.currentStreak = Number(p.currentStreak || 0) + 1;
      } else {
        p.currentStreak = 0;
      }
      syncTriviaMaxStreak(p.matchStats, p.currentStreak);
    }

    clearQuestionTimer(roomId);
    clearBotThink(roomId);
    advanceAfterResult(roomId, correct);
  }

  function scheduleBotIfNeeded(roomId) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;
    const bot = getCurrentBot(match);
    if (!bot) return;

    clearBotThink(roomId);
    const delay =
      BOT_MIN_MS + Math.random() * (BOT_MAX_MS - BOT_MIN_MS);
    const tid = setTimeout(() => {
      botThinkTimers.delete(roomId);
      const m = matches.get(roomId);
      if (!m || m.status !== 'playing') return;
      const b = getCurrentBot(m);
      if (!b) return;

      const qIdx = m.gameState.currentQuestionIndex;
      const q = m._fullQuestions[qIdx];
      if (!q) return;

      const wantCorrect = Math.random() < botCorrectRate(m.difficulty);
      const idx = wantCorrect
        ? q.correctIndex
        : (q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;

      processHumanAnswer(roomId, b.uid, idx);
    }, delay);
    botThinkTimers.set(roomId, tid);
  }

  async function settleMatchWithProgression(match, { winner, forfeitUid, endReason }) {
    /** @type {Array<object>} */
    const progression = [];
    for (const p of match.players) {
      if (!p?.uid || p.isBot) continue;

      const draw = winner === 'draw';
      const won = !draw && winner === p.uid;
      const isForfeitLeaver =
        endReason === 'disconnect_forfeit' && String(forfeitUid || '') === String(p.uid);

      const rewards = computeTriviaMatchRewards({
        matchStats: p.matchStats,
        won,
        draw,
        isForfeitLeaver,
        allowBonuses: !isForfeitLeaver,
      });

      try {
        if (rewards.coinsGained > 0) {
          await userFirestoreAdmin.addCoins(p.uid, rewards.coinsGained);
        }
        if (rewards.xpGained > 0) {
          await userFirestoreAdmin.addXP(p.uid, rewards.xpGained);
        }
        if (!isForfeitLeaver) {
          await userFirestoreAdmin.recordGameOutcome({
            uid: p.uid,
            gameKey: 'trivia',
            won,
            matches: 1,
            wins: won ? 1 : 0,
            globalStats: {
              totalMatches: 1,
              wins: won ? 1 : 0,
              losses: !won && !draw ? 1 : 0,
            },
          });
        }
      } catch (e) {
        console.warn('[Trivia] settle rewards:', e?.message || e);
      }

      progression.push({
        uid: p.uid,
        xpGained: rewards.xpGained,
        coinsGained: rewards.coinsGained,
        baseXp: rewards.baseXp,
        baseCoins: rewards.baseCoins,
        bonusXp: rewards.bonusXp,
        bonusCoins: rewards.bonusCoins,
        performanceBreakdown: rewards.performanceBreakdown,
      });
    }
    return progression;
  }

  async function finalizeMatchEnd(roomId, { endReason = 'completed', forfeitUid = null } = {}) {
    const match = matches.get(roomId);
    if (!match) return;

    clearQuestionTimer(roomId);
    clearBotThink(roomId);
    for (const p of match.players) {
      if (!p.isBot) clearReconnectGrace(roomId, p.uid);
    }

    const [p1, p2] = match.players;
    let winner = 'draw';
    if (endReason === 'disconnect_forfeit' && forfeitUid) {
      winner = otherPlayerUid(match, forfeitUid) || 'draw';
    } else if (p1 && p2) {
      if (p1.score > p2.score) winner = p1.uid;
      else if (p2.score > p1.score) winner = p2.uid;
    }

    match.status = 'ended';
    match.gameState.winner = winner;
    match.gameState.finishedAt = Date.now();
    match.endReason = endReason;

    const progression = await settleMatchWithProgression(match, {
      winner,
      forfeitUid,
      endReason,
    });
    match.progression = progression;

    for (const p of match.players) {
      p.performance = summarizeTriviaPerformance(p.matchStats);
    }

    const qIds = (match._fullQuestions || []).map((q) => q?.id).filter(Boolean);
    const cat = match.category;
    const diff = match.difficulty;
    if (qIds.length) {
      for (const p of match.players) {
        if (!p?.isBot && p?.uid) {
          await recordPlayedQuestions({
            uid: p.uid,
            questionIds: qIds,
            category: cat,
            difficulty: diff,
          }).catch((e) => console.warn('[Trivia] recordPlayedQuestions:', e?.message || e));
        }
      }
    }

    triviaLog('Game ended', roomId, { winner, matchType: match.matchType, endReason });
    saveEndedSnapshot(match, roomId);
    io.to(roomId).emit('trivia_game_ended', publicMatch(match));
    matches.delete(roomId);
  }

  async function endMatch(roomId) {
    await finalizeMatchEnd(roomId, { endReason: 'completed' });
  }

  /**
   * @param {object} opts
   * @param {object} opts.p1 — queue entry { socketId, uid, displayName, photoURL, ... }
   * @param {object|null} opts.p2
   * @param {boolean} opts.p2IsBot
   * @param {string} opts.matchType
   * @param {string} opts.difficulty
   * @param {string} opts.category
   * @param {string|null} [opts.firstTurnUid] — uid or '__BOT__' for new bot
   */
  async function createAndLaunchMatch({
    p1,
    p2,
    p2IsBot,
    matchType,
    difficulty,
    category,
    firstTurnUid = null,
  }) {
    const roomId = uuidv4();
    const normCategory = normalizeTriviaCategory(category);
    const variantSettings = await getTriviaVariantSettings(normCategory);

    if (!variantSettings.enabled) {
      io.to(p1.socketId).emit('trivia_error', {
        message: 'This trivia category is temporarily unavailable.',
      });
      if (matchType === 'rematch') {
        emitRematchFailed(p1.socketId, {
          reason: 'category_disabled',
          message: 'This trivia category is temporarily unavailable.',
        });
      }
      return null;
    }

    const deduct1 = await tryDeduct(p1.uid, normCategory);
    if (!deduct1.ok) {
      io.to(p1.socketId).emit('trivia_error', { message: deduct1.error });
      if (matchType === 'rematch') {
        emitRematchFailed(p1.socketId, {
          reason: 'insufficient_coins',
          message: deduct1.error || 'Insufficient coins',
        });
      }
      return null;
    }

    let deduct2 = { ok: true, userId: null };
    if (!p2IsBot && p2) {
      deduct2 = await tryDeduct(p2.uid, normCategory);
      if (!deduct2.ok) {
        io.to(p2.socketId).emit('trivia_error', { message: deduct2.error });
        await refundFee(deduct1.userId, deduct1.entryFee);
        if (matchType === 'rematch') {
          emitRematchFailed(p1.socketId, {
            reason: 'opponent_insufficient_coins',
            message: 'Opponent does not have enough coins for a rematch',
          });
          emitRematchFailed(p2.socketId, {
            reason: 'insufficient_coins',
            message: deduct2.error || 'Insufficient coins',
          });
        }
        return null;
      }
    }

    const botUid = `trivia_bot_${uuidv4().slice(0, 8)}`;
    const player2 = p2IsBot
      ? newTriviaPlayer({
        uid: botUid,
        displayName: 'TriviaBot',
        photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=Trivia',
        isBot: true,
      })
      : newTriviaPlayer({
        uid: p2.uid,
        displayName: p2.displayName,
        photoURL: p2.photoURL,
        isBot: false,
      });

    const player1 = newTriviaPlayer({
      uid: p1.uid,
      displayName: p1.displayName,
      photoURL: p1.photoURL,
      isBot: false,
    });

    let fullQuestions = [];
    try {
      fullQuestions = await fetchQuestionsFromFirestore({
        uid: p1.uid,
        category: normCategory,
        difficulty,
        count: variantSettings.questionCount,
      });
    } catch (e) {
      const mappedMessage = mapFirestoreBankError(e);
      agentDebugLog(
        'triviaRealtime.js:createAndLaunchMatch:catch',
        'Question fetch failed in createAndLaunchMatch',
        {
          error: e?.message || String(e),
          mappedMessage,
          category: normCategory,
          difficulty,
          matchType,
          p2IsBot,
        },
        'H5'
      );
      await refundFee(deduct1.userId, deduct1.entryFee);
      if (deduct2.userId) await refundFee(deduct2.userId, deduct2.entryFee);
      io.to(p1.socketId).emit('trivia_error', { message: mappedMessage });
      if (!p2IsBot && p2?.socketId) {
        io.to(p2.socketId).emit('trivia_error', { message: mappedMessage });
      }
      if (matchType === 'rematch') {
        emitRematchFailed(p1.socketId, { reason: 'no_questions', message: mappedMessage });
        if (!p2IsBot && p2?.socketId) {
          emitRematchFailed(p2.socketId, { reason: 'no_questions', message: mappedMessage });
        }
      }
      console.error('[Trivia] question fetch failed:', e?.message || e);
      return null;
    }
    if (!fullQuestions.length) {
      await refundFee(deduct1.userId, deduct1.entryFee);
      if (deduct2.userId) await refundFee(deduct2.userId, deduct2.entryFee);
      const noQ = 'No questions available';
      io.to(p1.socketId).emit('trivia_error', { message: noQ });
      if (matchType === 'rematch') {
        emitRematchFailed(p1.socketId, { reason: 'no_questions', message: noQ });
        if (!p2IsBot && p2?.socketId) {
          emitRematchFailed(p2.socketId, { reason: 'no_questions', message: noQ });
        }
      }
      return null;
    }

    let firstTurn = firstTurnUid || player1.uid;
    if (firstTurn === '__BOT__' && p2IsBot) {
      firstTurn = player2.uid;
    }

    const match = {
      roomId,
      gameType: 'trivia',
      maxPlayers: 2,
      status: 'playing',
      matchType,
      difficulty,
      category: normCategory,
      players: [player1, player2],
      createdAt: Date.now(),
      _fullQuestions: fullQuestions,
      hostFeeUserId: deduct1.userId || null,
      hostEntryFee: deduct1.entryFee ?? 0,
      guestFeeUserId: deduct2.userId || null,
      guestEntryFee: deduct2.entryFee ?? 0,
      entryFee: Math.max(Number(deduct1.entryFee) || 0, Number(deduct2.entryFee) || 0),
      gameState: {
        currentQuestionIndex: 0,
        currentTurnUid: firstTurn,
        timePerQuestionSec: variantSettings.questionSeconds,
      },
      sockets: {
        [player1.uid]: p1.socketId,
        ...(!p2IsBot && p2 ? { [player2.uid]: p2.socketId } : {}),
      },
    };

    match.gameState.questions = stripQuestionsForClient(fullQuestions);
    match.gameState.currentQuestion = publicQuestion(fullQuestions[0]);

    matches.set(roomId, match);
    await persistGameDoc(roomId, match, fullQuestions);

    debugRealtime('TRIVIA', 'Game started', { roomId, matchType, p2IsBot });
    triviaLog('Game started', roomId, {
      matchType,
      p2IsBot,
      category: normCategory,
      difficulty,
    });
    triviaCheckpoint(
      'Two players same roomId',
      !p2IsBot && !!p2 && !!roomId,
      roomId
    );

    const s1 = io.sockets.sockets.get(p1.socketId);
    s1?.join(roomId);
    if (!p2IsBot && p2) {
      const s2 = io.sockets.sockets.get(p2.socketId);
      s2?.join(roomId);
    }

    io.to(roomId).emit('trivia_match_found', {
      roomId,
      opponent: p2IsBot ? 'TriviaBot' : player2.displayName,
    });

    io.to(roomId).emit('trivia_game_started', publicMatch(match));
    startQuestionTimer(roomId);
    scheduleBotIfNeeded(roomId);
    return roomId;
  }

  async function startMatch(p1, p2, p2IsBot, matchType) {
    return createAndLaunchMatch({
      p1,
      p2,
      p2IsBot,
      matchType,
      difficulty: p1.difficulty,
      category: p1.category,
      firstTurnUid: p1.uid,
    });
  }

  async function launchRematchFromOffer(sourceRoomId, offer) {
    const snapshot = endedSnapshots.get(sourceRoomId);
    if (!snapshot || snapshot.playerOrder.length < 2) {
      clearRematchOffer(sourceRoomId, 'invalid');
      return;
    }

    const [uid0, uid1] = snapshot.playerOrder;
    const p0Snap = snapshot.players.find((p) => p.uid === uid0);
    const p1Snap = snapshot.players.find((p) => p.uid === uid1);
    if (!p0Snap || !p1Snap) {
      clearRematchOffer(sourceRoomId, 'invalid');
      return;
    }

    const p2IsBot = Boolean(p1Snap.isBot);
    const sid0 = offer.socketIds[uid0];
    const sid1 = offer.socketIds[uid1];

    if (!sid0 || (!p2IsBot && !sid1)) {
      clearRematchOffer(sourceRoomId, 'disconnect');
      return;
    }

    if (offer.timeoutId) clearTimeout(offer.timeoutId);
    rematchOffers.delete(sourceRoomId);

    const entry0 = {
      socketId: sid0,
      uid: uid0,
      displayName: p0Snap.displayName,
      photoURL: p0Snap.photoURL,
      difficulty: snapshot.difficulty,
      category: snapshot.category,
    };
    const entry1 = p2IsBot
      ? null
      : {
        socketId: sid1,
        uid: uid1,
        displayName: p1Snap.displayName,
        photoURL: p1Snap.photoURL,
        difficulty: snapshot.difficulty,
        category: snapshot.category,
      };

    await createAndLaunchMatch({
      p1: entry0,
      p2: entry1,
      p2IsBot,
      matchType: 'rematch',
      difficulty: snapshot.difficulty,
      category: snapshot.category,
      firstTurnUid: rematchFirstTurnUid(snapshot),
    });
  }

  async function handleRematchRequest(socket, data) {
    const uid = String(socket.user?.uid || '').trim();
    if (!uid) return;

    const sourceRoomId = String(data?.sourceRoomId || '').trim();
    if (!sourceRoomId) {
      emitRematchFailed(socket, { reason: 'invalid', message: 'Invalid rematch request' });
      return;
    }

    const snapshot = endedSnapshots.get(sourceRoomId);
    if (!snapshot) {
      emitRematchFailed(socket, {
        reason: 'expired',
        message: 'Rematch window expired — return to lobby',
      });
      return;
    }

    const playerInMatch = snapshot.players.find((p) => p.uid === uid);
    if (!playerInMatch) {
      emitRematchFailed(socket, { reason: 'invalid', message: 'You were not in this match' });
      return;
    }

    if (isUidInQueue(uid) || isUidInActiveMatch(uid)) {
      emitRematchFailed(socket, {
        reason: 'busy',
        message: 'Finish or leave your current game before rematching',
      });
      return;
    }

    const opponent = snapshot.players.find((p) => p.uid !== uid);
    if (!opponent) {
      emitRematchFailed(socket, { reason: 'invalid', message: 'Opponent not found' });
      return;
    }

    const category = normalizeTriviaCategory(snapshot.category);
    const difficulty = snapshot.difficulty || 'easy';

    if (opponent.isBot) {
      if (isUidInQueue(uid) || isUidInActiveMatch(uid)) {
        emitRematchFailed(socket, { reason: 'busy', message: 'Cannot rematch right now' });
        return;
      }
      socket.emit('trivia_rematch_waiting', { sourceRoomId, expiresAt: Date.now() + 5000 });
      await createAndLaunchMatch({
        p1: {
          socketId: socket.id,
          uid,
          displayName: data.displayName || playerInMatch.displayName || 'Player',
          photoURL: data.photoURL || playerInMatch.photoURL || '',
          difficulty,
          category,
        },
        p2: null,
        p2IsBot: true,
        matchType: 'rematch',
        difficulty,
        category,
        firstTurnUid: rematchFirstTurnUid(snapshot),
      });
      return;
    }

    let offer = rematchOffers.get(sourceRoomId);
    if (!offer) {
      offer = {
        sourceRoomId,
        category,
        difficulty,
        matchType: snapshot.matchType,
        players: snapshot.players,
        playerOrder: snapshot.playerOrder,
        accepted: new Set(),
        socketIds: {},
        expiresAt: Date.now() + REMATCH_TIMEOUT_MS,
        timeoutId: null,
      };
      rematchOffers.set(sourceRoomId, offer);
      scheduleRematchOfferExpiry(sourceRoomId);
    }

    offer.socketIds[uid] = socket.id;
    offer.accepted.add(uid);

    const expiresAt = offer.expiresAt;

    if (offer.accepted.size < 2) {
      socket.emit('trivia_rematch_waiting', { sourceRoomId, expiresAt });
      const oppSid = offer.socketIds[opponent.uid];
      const targetSid = oppSid || sourceRoomId;
      io.to(targetSid).emit('trivia_rematch_pending', {
        sourceRoomId,
        fromUid: uid,
        fromDisplayName: data.displayName || playerInMatch.displayName || 'Player',
        expiresAt,
      });
      return;
    }

    if (offer.launching) return;
    offer.launching = true;
    await launchRematchFromOffer(sourceRoomId, offer);
  }

  function handleRematchDecline(socket, data) {
    const uid = String(socket.user?.uid || '').trim();
    const sourceRoomId = String(data?.sourceRoomId || '').trim();
    if (!uid || !sourceRoomId) return;

    const offer = rematchOffers.get(sourceRoomId);
    if (!offer || !offer.accepted.has(uid)) return;

    clearRematchOffer(sourceRoomId, 'opponent_declined');
  }

  function tryPairHumans(newEntry) {
    const other = findQueueMatch(newEntry);
    if (!other) return false;
    removeFromQueueByUid(newEntry.uid);
    removeFromQueueByUid(other.uid);
    clearBotFallback(newEntry.socketId);
    clearBotFallback(other.socketId);
    void startMatch(newEntry, other, false, 'queue').catch((e) =>
      console.error('[Trivia] startMatch:', e)
    );
    return true;
  }

  function scheduleMatchmakingTimeout(entry) {
    clearBotFallback(entry.socketId);
    triviaLog(
      'Matchmaking timeout scheduled',
      `in ${MATCHMAKING_TIMEOUT_MS}ms`,
      { uid: entry.uid }
    );
    const t = setTimeout(() => {
      botFallbackTimers.delete(entry.socketId);
      const still = queue.find((e) => e.socketId === entry.socketId);
      if (!still) return;
      removeFromQueueBySocket(entry.socketId);
      triviaLog('No player found after matchmaking timeout', still.uid);
      io.to(still.socketId).emit('trivia_match_not_found', {
        message: 'Player Not Found',
      });
    }, MATCHMAKING_TIMEOUT_MS);
    botFallbackTimers.set(entry.socketId, t);
  }

  async function startPrivateFromWaiting(match) {
    let fullQuestions = [];
    try {
      const hostUid = match.players[0]?.uid;
      if (!hostUid) {
        io.to(match.roomId).emit('trivia_error', { message: 'Match host missing' });
        return;
      }
      fullQuestions = await fetchQuestionsFromFirestore({
        uid: hostUid,
        category: normalizeTriviaCategory(match.category),
        difficulty: match.difficulty,
        count: QUESTION_COUNT,
      });
    } catch (e) {
      const mappedMessage = mapFirestoreBankError(e);
      agentDebugLog(
        'triviaRealtime.js:startPrivateFromWaiting:catch',
        'Question fetch failed in private start',
        {
          error: e?.message || String(e),
          mappedMessage,
          category: match.category,
          difficulty: match.difficulty,
        },
        'H5'
      );
      io.to(match.roomId).emit('trivia_error', { message: mappedMessage });
      console.error('[Trivia] private question fetch failed:', e?.message || e);
      return;
    }
    if (!fullQuestions.length) {
      io.to(match.roomId).emit('trivia_error', { message: 'No questions available' });
      return;
    }
    match._fullQuestions = fullQuestions;
    match.status = 'playing';
    match.gameState.currentQuestionIndex = 0;
    match.gameState.currentTurnUid = match.players[0].uid;
    match.gameState.questions = stripQuestionsForClient(fullQuestions);
    match.gameState.currentQuestion = publicQuestion(fullQuestions[0]);
    await persistGameDoc(match.roomId, match, fullQuestions);

    io.to(match.roomId).emit('trivia_game_started', publicMatch(match));
    startQuestionTimer(match.roomId);
    scheduleBotIfNeeded(match.roomId);
  }

  return function registerTrivia(socket) {
    function getVerifiedUid() {
      return String(socket.user?.uid || '').trim();
    }

    socket.on('trivia_join_queue', async (data) => {
      const uid = getVerifiedUid();
      if (!uid) return;
      triviaLog('Player joined queue', uid, {
        soloBot: !!data?.soloBot,
        category: data?.category,
        difficulty: data?.difficulty,
      });
      removeFromQueueByUid(uid);
      clearBotFallback(socket.id);

      const entry = {
        socketId: socket.id,
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || '',
        difficulty: data.difficulty || 'easy',
        category: normalizeTriviaCategory(data.category),
        rankBucket: bucketFromXp(data?.xp),
      };

      const variantSettings = await getTriviaVariantSettings(entry.category);
      if (!variantSettings.enabled) {
        socket.emit('trivia_error', { message: 'This trivia category is temporarily unavailable.' });
        return;
      }

      if (data.soloBot) {
        triviaLog('Solo vs bot (immediate)', uid);
        void startMatch(entry, null, true, 'queue').catch((e) =>
          console.error('[Trivia] solo bot:', e)
        );
        return;
      }

      queue.push(entry);
      socket.emit('trivia_waiting', { message: 'Searching for opponent…' });

      if (tryPairHumans(entry)) return;
      scheduleMatchmakingTimeout(entry);
    });

    socket.on('trivia_leave_queue', () => {
      removeFromQueueBySocket(socket.id);
      clearBotFallback(socket.id);
    });

    socket.on('trivia_create_private', async (data) => {
      const uid = getVerifiedUid();
      if (!uid) return;
      removeFromQueueByUid(uid);
      clearBotFallback(socket.id);

      const category = normalizeTriviaCategory(data.category);

      const deduct1 = await tryDeduct(uid, category);
      if (!deduct1.ok) {
        socket.emit('trivia_error', { message: deduct1.error });
        return;
      }

      const roomId = uuidv4();
      const difficulty = data.difficulty || 'easy';

      const player1 = {
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || '',
        score: 0,
        correctCount: 0,
        isBot: false,
      };

      const match = {
        roomId,
        gameType: 'trivia',
        maxPlayers: 2,
        status: 'waiting',
        matchType: 'private',
        difficulty,
        category,
        players: [player1],
        createdAt: Date.now(),
        hostFeeUserId: deduct1.userId || null,
        hostEntryFee: deduct1.entryFee ?? 0,
        guestFeeUserId: null,
        guestEntryFee: 0,
        entryFee: deduct1.entryFee ?? 0,
        gameState: {
          currentQuestionIndex: 0,
          currentTurnUid: null,
          questions: [],
          currentQuestion: null,
        },
        sockets: { [uid]: socket.id },
      };

      matches.set(roomId, match);
      socket.join(roomId);
      triviaLog('Private room created', roomId, { host: uid });
      socket.emit('trivia_private_created', {
        roomId,
        match: publicMatch(match),
      });
    });

    socket.on('trivia_join_private', async (data) => {
      const roomId = data?.roomId;
      const uid = getVerifiedUid();
      if (!roomId || !uid) return;

      const match = matches.get(roomId);
      if (!match) {
        socket.emit('trivia_error', { message: 'Room not found' });
        return;
      }

      if (match.status === 'playing') {
        const p = match.players.find((x) => x.uid === uid);
        if (p) {
          clearReconnectGrace(roomId, uid);
          io.to(roomId).emit('trivia_reconnect_cleared', { roomId, uid });
          socket.join(roomId);
          match.sockets[uid] = socket.id;
          triviaLog('Private room rejoin (playing)', roomId, { uid });
          socket.emit('trivia_update_game', publicMatch(match));
          return;
        }
        socket.emit('trivia_error', {
          message: 'Room is full',
          code: 'ROOM_FULL',
        });
        return;
      }

      if (match.status !== 'waiting') return;

      if (match.players[0]?.uid === uid) {
        clearReconnectGrace(roomId, uid);
        socket.join(roomId);
        match.sockets[uid] = socket.id;
        socket.emit('trivia_update_game', publicMatch(match));
        return;
      }

      if (match.players.length >= 2) {
        socket.emit('trivia_error', {
          message: 'Room is full',
          code: 'ROOM_FULL',
        });
        return;
      }

      const deduct2 = await tryDeduct(uid, match.category);
      if (!deduct2.ok) {
        socket.emit('trivia_error', { message: deduct2.error });
        return;
      }

      const guest = {
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || '',
        score: 0,
        correctCount: 0,
        isBot: false,
      };
      match.players.push(guest);
      match.guestFeeUserId = deduct2.userId || null;
      match.guestEntryFee = deduct2.entryFee ?? 0;
      match.entryFee = Math.max(Number(match.hostEntryFee) || 0, Number(deduct2.entryFee) || 0);
      match.sockets[uid] = socket.id;
      socket.join(roomId);

      triviaLog('Private room joined by guest', roomId, { uid });
      triviaCheckpoint('Private room — no bot', match.matchType === 'private', roomId);

      io.to(roomId).emit('trivia_match_found', {
        roomId,
        opponent: guest.displayName,
      });
      void startPrivateFromWaiting(match);
    });

    socket.on('trivia_cancel_private', async (data) => {
      const roomId = data?.roomId;
      const uid = getVerifiedUid();
      if (!roomId || !uid) return;
      const match = matches.get(roomId);
      if (!match || match.status !== 'waiting' || match.players[0]?.uid !== uid)
        return;
      await disposeWaitingRoom(roomId, 'host_cancelled');
    });

    socket.on('trivia_submit_answer', (payload) => {
      const rid = payload?.roomId;
      const answerUid = getVerifiedUid();
      const selectedIndex = payload?.selectedIndex;
      if (rid == null || !answerUid || selectedIndex == null) return;
      processHumanAnswer(rid, answerUid, selectedIndex);
    });

    socket.on('trivia_admin_delete_question', async (data) => {
      const email = String(socket.user?.email || '').toLowerCase().trim();
      if (email !== 'info@aljazeeragc.com') {
        socket.emit('trivia_admin_error', { message: 'Unauthorized: Admin email required' });
        return;
      }
      const { roomId, questionId } = data || {};
      if (!roomId || !questionId) return;

      const match = matches.get(roomId);
      if (!match) return;

      try {
        await deleteQuestion(questionId);
        socket.emit('trivia_admin_action_success', { action: 'delete', questionId });

        // Skip the current question if it matches the deleted one
        const currentQ = match._fullQuestions[match.gameState.currentQuestionIndex];
        if (currentQ && currentQ.id === questionId) {
          clearQuestionTimer(roomId);
          clearBotThink(roomId);
          advanceAfterResult(roomId, false);
        } else {
          match._fullQuestions = match._fullQuestions.filter(q => q.id !== questionId);
          match.gameState.questions = stripQuestionsForClient(match._fullQuestions);
          broadcastUpdate(match);
        }
      } catch (err) {
        socket.emit('trivia_admin_error', { message: err?.message || 'Failed to delete question' });
      }
    });

    socket.on('trivia_admin_edit_question', async (data) => {
      const email = String(socket.user?.email || '').toLowerCase().trim();
      const uid = getVerifiedUid();
      if (email !== 'info@aljazeeragc.com') {
        socket.emit('trivia_admin_error', { message: 'Unauthorized: Admin email required' });
        return;
      }
      const { roomId, questionId, updateFields } = data || {};
      if (!roomId || !questionId || !updateFields) return;

      const match = matches.get(roomId);
      if (!match) return;

      try {
        const updated = await updateQuestion(questionId, updateFields, uid);
        socket.emit('trivia_admin_action_success', { action: 'edit', questionId });

        const qIdx = match._fullQuestions.findIndex(q => q.id === questionId);
        if (qIdx !== -1) {
          const options = Array.isArray(updated.options)
            ? updated.options
            : [updated.option1, updated.option2, updated.option3, updated.option4];

          match._fullQuestions[qIdx] = {
            id: updated.id,
            category: updated.category,
            difficulty: updated.difficulty,
            text: updated.question,
            options,
            correctIndex: updated.correctIndex,
            imageUrl: updated.imageUrl || '',
            active: updated.active,
            type: updated.type,
            sequence: updated.sequence,
            patternKind: updated.patternKind,
            hint: updated.hint,
            explanation: updated.explanation,
          };

          match.gameState.questions = stripQuestionsForClient(match._fullQuestions);

          if (match.gameState.currentQuestionIndex === qIdx) {
            match.gameState.currentQuestion = publicQuestion(match._fullQuestions[qIdx]);
          }

          broadcastUpdate(match);
        }
      } catch (err) {
        socket.emit('trivia_admin_error', { message: err?.message || 'Failed to edit question' });
      }
    });

    socket.on('trivia_request_rematch', (data) => {
      void handleRematchRequest(socket, data).catch((e) =>
        console.error('[Trivia] rematch request:', e)
      );
    });

    socket.on('trivia_decline_rematch', (data) => {
      handleRematchDecline(socket, data);
    });

    socket.on('trivia_reconnect_user', () => {
      reconnectTriviaPlayer(socket, getVerifiedUid());
    });

    /** Unified name with Math Rush (`reconnect_user`); only affects trivia if uid is in a trivia match. */
    socket.on('reconnect_user', () => {
      reconnectTriviaPlayer(socket, getVerifiedUid());
    });

    socket.on('disconnect', () => {
      const disconnectedUid = String(socket.user?.uid || '').trim();
      removeFromQueueBySocket(socket.id);
      clearBotFallback(socket.id);

      if (disconnectedUid) {
        for (const [sourceRoomId, offer] of rematchOffers) {
          if (offer.accepted.has(disconnectedUid)) {
            clearRematchOffer(sourceRoomId, 'disconnect');
            break;
          }
        }
      }

      for (const [roomId, match] of matches) {
        if (match.status === 'waiting' && match.sockets) {
          const uid = Object.keys(match.sockets).find(
            (u) => match.sockets[u] === socket.id
          );
          if (uid === match.players[0]?.uid) {
            void disposeWaitingRoom(roomId, 'host_disconnected');
            return;
          }
        }
      }

      for (const [roomId, match] of matches) {
        if (!match.sockets) continue;
        const uid = Object.keys(match.sockets).find(
          (u) => match.sockets[u] === socket.id
        );
        if (uid) {
          const p = match.players.find((x) => x.uid === uid);
          if (p?.isBot) continue;
          if (match.status === 'playing') {
            delete match.sockets[uid];
            scheduleReconnectGrace(roomId, uid);
          }
          break;
        }
      }
    });
  };
}
