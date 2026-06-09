import { v4 as uuidv4 } from 'uuid';
import { generateProblem, normalizeDifficulty } from './mathRushEngine.js';
import {
  mathRushLog,
  mathRushCheckpoint,
  debugRealtime,
} from './gameRealtimeDebug.js';
import { GAME_KEYS, refundGameEntryFee, tryDeductGameEntryFee } from './gameEntryFee.js';
const MAX_ROUNDS = 10;
const TURN_SECONDS = 15;
/** If no human opponent is found in this time, start a match vs MathBot. */
const BOT_MATCH_DELAY_MS = 10000;
const RECONNECT_GRACE_MS = 10000;
const BOT_THINK_MIN_MS = 1200;
const BOT_THINK_MAX_MS = 2800;

const BOT_AVATAR =
  'https://api.dicebear.com/7.x/bottts/svg?seed=MathRushBot';

function botWinRate(difficulty) {
  const d = normalizeDifficulty(difficulty);
  if (d === 'easy') return 0.85;
  if (d === 'medium') return 0.7;
  return 0.55;
}

function sameQueueDifficulty(a, b) {
  return normalizeDifficulty(a) === normalizeDifficulty(b);
}

/** Strip server-only fields before sending to clients. */
function publicMatch(m) {
  const o = JSON.parse(JSON.stringify(m));
  delete o._serverAnswer;
  delete o.hostFeeUserId;
  delete o.guestFeeUserId;
  if (o.currentProblem) delete o.currentProblem.answer;
  delete o.sockets;
  return o;
}

/**
 * Socket.IO handlers for Math Rush queue + realtime duel.
 * @param {import('socket.io').Server} io
 */
export function createMathRushHandlers(io) {
  /** @type {Array<{ socketId: string, uid: string, displayName: string, photoURL: string, difficulty: string }>} */
  const queue = [];
  const matches = new Map();
  const turnTimers = new Map();
  /** pending bot match per searching socket */
  const botDelayTimers = new Map();
  /** bot "thinking" timer per room */
  const botTurnTimers = new Map();
  const reconnectGraceTimers = new Map();

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

  function forfeitAfterGrace(roomId, disconnectedUid) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;
    mathRushLog('Reconnect grace expired — forfeit', disconnectedUid, { roomId });
    endMatch(roomId, { forfeitUid: disconnectedUid });
  }

  function scheduleReconnectGrace(roomId, uid) {
    clearReconnectGrace(roomId, uid);
    mathRushLog('Player disconnected — reconnect grace', RECONNECT_GRACE_MS, {
      roomId,
      uid,
    });
    io.to(roomId).emit('mathrush_reconnect_grace', {
      roomId,
      disconnectedUid: uid,
      ms: RECONNECT_GRACE_MS,
    });
    const tid = setTimeout(() => {
      reconnectGraceTimers.delete(graceKey(roomId, uid));
      forfeitAfterGrace(roomId, uid);
    }, RECONNECT_GRACE_MS);
    reconnectGraceTimers.set(graceKey(roomId, uid), tid);
  }

  function clearTurnTimer(roomId) {
    const id = turnTimers.get(roomId);
    if (id) {
      clearInterval(id);
      turnTimers.delete(roomId);
    }
  }

  function clearBotDelay(socketId) {
    const t = botDelayTimers.get(socketId);
    if (t) {
      clearTimeout(t);
      botDelayTimers.delete(socketId);
    }
  }

  function clearBotTurn(roomId) {
    const t = botTurnTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      botTurnTimers.delete(roomId);
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

  function findQueueMatch(entry) {
    const other = queue.find(
      (e) => e.uid !== entry.uid && sameQueueDifficulty(e.difficulty, entry.difficulty)
    );
    return other || null;
  }

  async function tryDeduct(uid) {
    return tryDeductGameEntryFee(uid, GAME_KEYS.MATH_RUSH);
  }

  function getPlayer(match, uid) {
    if (match.player1?.uid === uid) return match.player1;
    if (match.player2 && match.player2.uid === uid) return match.player2;
    return null;
  }

  function otherUid(match, uid) {
    if (!match.player2) return null;
    return match.player1.uid === uid ? match.player2.uid : match.player1.uid;
  }

  async function refundFee(userId, entryFee) {
    await refundGameEntryFee(userId, entryFee, 'MathRush');
  }

  async function disposeWaitingRoom(roomId, reason) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'waiting') return;
    clearTurnTimer(roomId);
    clearBotTurn(roomId);
    if (match.player1?.uid) clearReconnectGrace(roomId, match.player1.uid);
    if (match.hostFeeUserId) await refundFee(match.hostFeeUserId, match.hostEntryFee);
    matches.delete(roomId);
    io.to(roomId).emit('mathrush_private_cancelled', { roomId, reason: reason || 'cancelled' });
  }

  function startTurnTimer(roomId) {
    clearTurnTimer(roomId);
    let left = TURN_SECONDS;
    mathRushLog('Timer tick (turn)', roomId, { secondsLeft: left });
    io.to(roomId).emit('timer_update', left);
    const interval = setInterval(() => {
      left -= 1;
      io.to(roomId).emit('timer_update', left);
      if (left <= 0) {
        clearInterval(interval);
        turnTimers.delete(roomId);
        processTimeout(roomId);
      }
    }, 1000);
    turnTimers.set(roomId, interval);
  }

  function endMatch(roomId, opts = {}) {
    const match = matches.get(roomId);
    if (!match) return;

    clearTurnTimer(roomId);
    clearBotTurn(roomId);
    if (match.player1 && !match.player1.isBot) clearReconnectGrace(roomId, match.player1.uid);
    if (match.player2 && !match.player2.isBot) clearReconnectGrace(roomId, match.player2.uid);

    const { forfeitUid } = opts;

    if (forfeitUid) {
      const other = otherUid(match, forfeitUid);
      match.winner = other || match.player1?.uid;
      match.endReason = 'forfeit';
    } else {
      const s1 = match.player1.score;
      const s2 = match.player2.score;
      if (s1 > s2) match.winner = match.player1.uid;
      else if (s2 > s1) match.winner = match.player2.uid;
      else match.winner = 'draw';
      match.endReason = 'score';
    }

    match.status = 'ended';
    mathRushLog('Game ended', roomId, { winner: match.winner });
    io.to(roomId).emit('game_ended', publicMatch(match));
    matches.delete(roomId);
  }

  function processTimeout(roomId) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;

    clearBotTurn(roomId);

    const uid = match.turn;
    const player = getPlayer(match, uid);
    if (!player) return;

    player.failureCount += 1;

    if (match.round >= match.maxRounds) {
      endMatch(roomId);
      return;
    }

    match.round += 1;
    match.turn = otherUid(match, uid);
    const prob = generateProblem(match.difficulty);
    match.currentProblem = prob;
    match._serverAnswer = prob.answer;

    io.to(roomId).emit('update_game', publicMatch(match));
    startTurnTimer(roomId);
    scheduleBotIfNeeded(roomId);
  }

  function processAnswer(roomId, uid, rawAnswer) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;
    if (match.turn !== uid) return;

    clearTurnTimer(roomId);
    clearBotTurn(roomId);

    const n = Number.parseInt(String(rawAnswer).trim(), 10);
    const correct = Number.isFinite(n) && n === match._serverAnswer;

    const player = getPlayer(match, uid);
    if (!player) return;

    if (correct) {
      player.score += 10;
      player.successCount += 1;
    } else {
      player.failureCount += 1;
    }

    if (match.round >= match.maxRounds) {
      endMatch(roomId);
      return;
    }

    match.round += 1;
    match.turn = otherUid(match, uid);
    const prob = generateProblem(match.difficulty);
    match.currentProblem = prob;
    match._serverAnswer = prob.answer;

    io.to(roomId).emit('update_game', publicMatch(match));
    startTurnTimer(roomId);
    scheduleBotIfNeeded(roomId);
  }

  function scheduleBotIfNeeded(roomId) {
    const match = matches.get(roomId);
    if (!match || match.status !== 'playing') return;

    const uid = match.turn;
    const botPlayer = match.player1.isBot
      ? match.player1
      : match.player2.isBot
        ? match.player2
        : null;
    if (!botPlayer || uid !== botPlayer.uid) return;

    clearBotTurn(roomId);
    const delay =
      BOT_THINK_MIN_MS +
      Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS);
    const tid = setTimeout(() => {
      botTurnTimers.delete(roomId);
      const m = matches.get(roomId);
      if (!m || m.status !== 'playing') return;

      const wantCorrect = Math.random() < botWinRate(m.difficulty);
      const ans = wantCorrect
        ? m._serverAnswer
        : m._serverAnswer + (Math.random() > 0.5 ? 1 : -1);
      processAnswer(roomId, botPlayer.uid, String(ans));
    }, delay);
    botTurnTimers.set(roomId, tid);
  }

  async function startMatch(p1, p2, p2IsBot) {
    const roomId = uuidv4();
    const difficulty = p1.difficulty;

    const deduct1 = await tryDeduct(p1.uid);
    if (!deduct1.ok) {
      io.to(p1.socketId).emit('math_rush:error', { message: deduct1.error });
      return;
    }
    if (!p2IsBot) {
      const deduct2 = await tryDeduct(p2.uid);
      if (!deduct2.ok) {
        io.to(p2.socketId).emit('math_rush:error', { message: deduct2.error });
        if (deduct1.userId) {
          await refundFee(deduct1.userId, deduct1.entryFee);
        }
        return;
      }
    }

    const botUid = `bot_${uuidv4().slice(0, 8)}`;
    const player2 = p2IsBot
      ? {
          uid: botUid,
          displayName: 'MathBot',
          photoURL: BOT_AVATAR,
          score: 0,
          successCount: 0,
          failureCount: 0,
          isBot: true,
        }
      : {
          uid: p2.uid,
          displayName: p2.displayName,
          photoURL: p2.photoURL,
          score: 0,
          successCount: 0,
          failureCount: 0,
          isBot: false,
        };

    const player1 = {
      uid: p1.uid,
      displayName: p1.displayName,
      photoURL: p1.photoURL,
      score: 0,
      successCount: 0,
      failureCount: 0,
      isBot: false,
    };

    const prob = generateProblem(difficulty);
    const first =
      Math.random() < 0.5 ? player1.uid : player2.uid;

    const match = {
      id: roomId,
      difficulty,
      round: 1,
      maxRounds: MAX_ROUNDS,
      turn: first,
      status: 'playing',
      player1,
      player2,
      currentProblem: prob,
      _serverAnswer: prob.answer,
      sockets: {
        [player1.uid]: p1.socketId,
        ...(p2IsBot ? {} : { [player2.uid]: p2.socketId }),
      },
    };

    matches.set(roomId, match);

    debugRealtime('MATH_RUSH', 'Game started', { roomId, p2IsBot });
    mathRushLog('Game started', roomId, { p2IsBot, difficulty });
    mathRushCheckpoint('Two players same roomId', !p2IsBot && !!p2, roomId);

    const s1 = io.sockets.sockets.get(p1.socketId);
    s1?.join(roomId);
    if (!p2IsBot) {
      const s2 = io.sockets.sockets.get(p2.socketId);
      s2?.join(roomId);
    }

    io.to(roomId).emit('game_started', publicMatch(match));
    startTurnTimer(roomId);
    scheduleBotIfNeeded(roomId);
  }

  function tryPairHumans(newEntry) {
    const other = findQueueMatch(newEntry);
    if (!other) return false;

    removeFromQueueByUid(newEntry.uid);
    removeFromQueueByUid(other.uid);
    clearBotDelay(newEntry.socketId);
    clearBotDelay(other.socketId);

    void startMatch(newEntry, other, false).catch((e) => {
      console.error('[MathRush] startMatch:', e);
    });
    return true;
  }

  function scheduleBotMatch(entry) {
    clearBotDelay(entry.socketId);
    mathRushLog(
      'Bot match scheduled (queue fallback)',
      `in ${BOT_MATCH_DELAY_MS}ms`,
      { uid: entry.uid }
    );
    const t = setTimeout(() => {
      botDelayTimers.delete(entry.socketId);
      const still = queue.find((e) => e.socketId === entry.socketId);
      if (!still) return;
      removeFromQueueBySocket(entry.socketId);
      mathRushLog('Bot match triggered after 10s', still.uid);
      mathRushCheckpoint('Bot fallback after 10s', true, still.uid);
      void startMatch(still, null, true).catch((e) => {
        console.error('[MathRush] bot match:', e);
      });
    }, BOT_MATCH_DELAY_MS);
    botDelayTimers.set(entry.socketId, t);
  }

  return function registerMathRush(socket) {
    function getVerifiedUid() {
      return String(socket.user?.uid || '').trim();
    }

    socket.on('join_queue', async (data) => {
      const uid = getVerifiedUid();
      if (!uid) return;

      debugRealtime('MATH_RUSH', 'Player joined queue', { uid });
      mathRushLog('Player joined queue', uid, { difficulty: data?.difficulty });
      removeFromQueueByUid(uid);
      clearBotDelay(socket.id);

      const entry = {
        socketId: socket.id,
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || '',
        difficulty: data.difficulty || 'easy',
      };

      queue.push(entry);
      socket.emit('waiting_in_queue');

      if (tryPairHumans(entry)) return;
      scheduleBotMatch(entry);
    });

    /** Private invite: host pays entry fee, room stays in `waiting` until guest joins (no bot). */
    socket.on('mathrush_create_private', async (data) => {
      const uid = getVerifiedUid();
      if (!uid) return;

      removeFromQueueByUid(uid);
      clearBotDelay(socket.id);

      const entry = {
        socketId: socket.id,
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || '',
        difficulty: data.difficulty || 'easy',
      };

      const deduct1 = await tryDeduct(entry.uid);
      if (!deduct1.ok) {
        socket.emit('math_rush:error', { message: deduct1.error });
        return;
      }

      const roomId = uuidv4();
      const difficulty = normalizeDifficulty(entry.difficulty);
      const player1 = {
        uid: entry.uid,
        displayName: entry.displayName,
        photoURL: entry.photoURL,
        score: 0,
        successCount: 0,
        failureCount: 0,
        isBot: false,
      };

      const match = {
        id: roomId,
        difficulty,
        round: 1,
        maxRounds: MAX_ROUNDS,
        turn: null,
        status: 'waiting',
        matchType: 'private',
        player1,
        player2: null,
        currentProblem: null,
        _serverAnswer: null,
        hostFeeUserId: deduct1.userId || null,
        hostEntryFee: deduct1.entryFee ?? 0,
        guestFeeUserId: null,
        guestEntryFee: 0,
        entryFee: deduct1.entryFee ?? 0,
        sockets: { [player1.uid]: socket.id },
      };

      matches.set(roomId, match);
      socket.join(roomId);
      mathRushLog('Private room created', roomId, { host: uid });
      socket.emit('mathrush_private_created', {
        roomId,
        match: publicMatch(match),
      });
    });

    socket.on('mathrush_join_private', async (data) => {
      const roomId = data?.roomId;
      const uid = getVerifiedUid();
      if (!roomId || !uid) return;

      const match = matches.get(roomId);
      if (!match) {
        socket.emit('math_rush:error', {
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND',
        });
        return;
      }

      if (match.status === 'playing') {
        if (match.player1?.uid === uid || match.player2?.uid === uid) {
          clearReconnectGrace(roomId, uid);
          io.to(roomId).emit('mathrush_reconnect_cleared', { roomId, uid });
          socket.join(roomId);
          if (match.sockets) match.sockets[uid] = socket.id;
          mathRushLog('Private room rejoin (playing)', roomId, { uid });
          socket.emit('update_game', publicMatch(match));
          return;
        }
        socket.emit('math_rush:error', {
          message: 'Room is full',
          code: 'ROOM_FULL',
        });
        return;
      }

      if (match.status !== 'waiting') return;

      if (match.player1?.uid === uid) {
        clearReconnectGrace(roomId, uid);
        socket.join(roomId);
        if (match.sockets) match.sockets[uid] = socket.id;
        socket.emit('update_game', publicMatch(match));
        return;
      }
      if (match.player2?.uid === uid) {
        clearReconnectGrace(roomId, uid);
        socket.join(roomId);
        if (match.sockets) match.sockets[uid] = socket.id;
        socket.emit('update_game', publicMatch(match));
        return;
      }
      if (match.player2) {
        socket.emit('math_rush:error', {
          message: 'Room is full',
          code: 'ROOM_FULL',
        });
        return;
      }

      const deduct2 = await tryDeduct(uid);
      if (!deduct2.ok) {
        socket.emit('math_rush:error', { message: deduct2.error });
        return;
      }

      match.player2 = {
        uid,
        displayName: data.displayName || 'Player',
        photoURL: data.photoURL || '',
        score: 0,
        successCount: 0,
        failureCount: 0,
        isBot: false,
      };
      match.guestFeeUserId = deduct2.userId || null;
      match.guestEntryFee = deduct2.entryFee ?? 0;
      match.entryFee = Math.max(Number(match.hostEntryFee) || 0, Number(deduct2.entryFee) || 0);
      match.sockets[uid] = socket.id;
      socket.join(roomId);

      const prob = generateProblem(match.difficulty);
      match.currentProblem = prob;
      match._serverAnswer = prob.answer;
      match.turn = Math.random() < 0.5 ? match.player1.uid : match.player2.uid;
      match.status = 'playing';

      mathRushLog('Private room joined by guest', roomId, { uid });
      mathRushCheckpoint('Private room — no bot', match.matchType === 'private', roomId);

      io.to(roomId).emit('game_started', publicMatch(match));
      startTurnTimer(roomId);
    });

    socket.on('mathrush_cancel_private', async (data) => {
      const roomId = data?.roomId;
      const uid = getVerifiedUid();
      if (!roomId || !uid) return;
      const match = matches.get(roomId);
      if (!match || match.status !== 'waiting' || match.player1?.uid !== uid) return;
      await disposeWaitingRoom(roomId, 'host_cancelled');
    });

    socket.on('leave_queue', () => {
      removeFromQueueBySocket(socket.id);
      clearBotDelay(socket.id);
    });

    socket.on('submit_answer', (payload) => {
      const roomId = payload?.roomId;
      const uid = getVerifiedUid();
      if (!roomId || !uid) return;
      processAnswer(roomId, uid, payload.answer);
    });

    socket.on('quit_game', (payload) => {
      const roomId = payload?.roomId;
      const uid = getVerifiedUid();
      if (!roomId || !uid) return;
      const match = matches.get(roomId);
      if (!match || match.status !== 'playing') return;
      if (!getPlayer(match, uid)) return;
      endMatch(roomId, { forfeitUid: uid });
    });

    socket.on('reconnect_user', () => {
      const uid = getVerifiedUid();
      if (!uid || typeof uid !== 'string') return;
      for (const [, match] of matches) {
        const inWaitingHost = match.status === 'waiting' && match.player1?.uid === uid;
        const inPlaying =
          match.player1?.uid === uid || (match.player2 && match.player2.uid === uid);
        if (inWaitingHost || inPlaying) {
          clearReconnectGrace(match.id, uid);
          io.to(match.id).emit('mathrush_reconnect_cleared', { roomId: match.id, uid });
          socket.join(match.id);
          if (match.sockets) match.sockets[uid] = socket.id;
          mathRushLog('Player reconnected', match.id, { uid });
          socket.emit('update_game', publicMatch(match));
          return;
        }
      }
    });

    socket.on('disconnect', () => {
      removeFromQueueBySocket(socket.id);
      clearBotDelay(socket.id);

      for (const [roomId, match] of matches) {
        if (match.status === 'waiting' && match.sockets && match.player1?.uid) {
          const uid = Object.keys(match.sockets).find(
            (u) => match.sockets[u] === socket.id
          );
          if (uid === match.player1.uid) {
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
          const p = getPlayer(match, uid);
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
