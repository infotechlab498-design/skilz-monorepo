import { v4 as uuidv4 } from 'uuid';
import { MoveValidator } from '../game-engine/services/MoveValidator.js';
import { RULES_CONFIG } from '../game-engine/rules/rulesConfig.js';
import { AIEngine } from '../game-engine/ai/aiEngine.js';
import { ludoLog } from './gameRealtimeDebug.js';
import { syncLudoMatchEnd } from './ludoFirestoreSync.js';
import { getBotProfile, botDelayMs } from './ludoBotProfiles.js';
import {
  saveLudoRoomSnapshot,
  deleteLudoRoomFirestore,
} from './ludo/roomManager.js';
import * as ludoWallet from './ludo/ludoFirestoreWallet.js';
import { KeyedLock } from './ludo/application/KeyedLock.js';
import { computeVoteSummary, resolveVoteOutcome } from './ludo/application/voteLogic.js';
import { incMetric } from './ludo/infrastructure/observability/ludoMetrics.js';
import { ludoQueueBucketKey } from './ludo/queue/ludoQueueBucketKey.js';
import { LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE } from './ludo/queue/ludoMatchVariants.js';
import { MemoryLudoQueueStore } from './ludo/queue/MemoryLudoQueueStore.js';
import {
  clearLudoRoomContext,
  refreshLudoRoomContexts,
  setLudoQueueState,
  setLudoRoomContext,
} from './presence/userStateRtdb.js';
import { createLudoInviteStore } from './ludo/invite/ludoInviteStore.js';
import { GAME_KEYS, resolveGameEntryFee } from './gameEntryFee.js';
import { isInviteValidForJoin } from './ludo/invite/ludoInviteValidate.js';

export { LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE } from './ludo/queue/ludoMatchVariants.js';

const ludoWireDebug =
  process.env.LUDO_SOCKET_DEBUG === '1'
    ? (...args) => console.log('[Ludo]', ...args)
    : () => {};

/** Local multi-seat ids look like `{firebaseUid}_seat_RED` — wallet APIs use the base uid. */
function walletUid(id) {
  if (id == null || typeof id !== 'string') return id;
  const idx = id.indexOf('_seat_');
  return idx >= 0 ? id.slice(0, idx) : id;
}

/** Firebase uids in lobby or seated humans (for `userState` / available-players). */
function humanWalletUidsFromState(st) {
  const out = new Set();
  if (!st) return [];
  if (st.lobby?.members) {
    for (const m of st.lobby.members) {
      const u = String(m.uid || '').trim();
      if (u) out.add(String(walletUid(u)));
    }
  }
  if (st.players && typeof st.players === 'object') {
    for (const p of Object.values(st.players)) {
      if (p && p.type === 'HUMAN' && p.id) {
        const w = String(walletUid(String(p.id))).trim();
        if (w) out.add(w);
      }
    }
  }
  return [...out];
}

const ALL_COLORS = ['RED', 'BLUE', 'YELLOW', 'GREEN'];
/** First N colors used for an N-player online match (RED/GREEN opposite for 2P). */
const COLOR_BY_SLOT = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
let ludoEventSeq = 0;

function nextEventMeta(state) {
  ludoEventSeq += 1;
  return {
    eventId: `ludo_${Date.now()}_${ludoEventSeq}`,
    serverRevision: Number(state?.revision || 0),
  };
}

export { loadLudoSnapshotsInto } from './ludo/roomManager.js';

function resetLudoTurnTimer(state) {
  const sec = state.turnTimerSec ?? 30;
  state.timeLeft = sec;
}

function initialTokens() {
  return {
    RED: [
      { id: 1, position: 0, color: 'RED' },
      { id: 2, position: 0, color: 'RED' },
      { id: 3, position: 0, color: 'RED' },
      { id: 4, position: 0, color: 'RED' },
    ],
    BLUE: [
      { id: 1, position: 0, color: 'BLUE' },
      { id: 2, position: 0, color: 'BLUE' },
      { id: 3, position: 0, color: 'BLUE' },
      { id: 4, position: 0, color: 'BLUE' },
    ],
    YELLOW: [
      { id: 1, position: 0, color: 'YELLOW' },
      { id: 2, position: 0, color: 'YELLOW' },
      { id: 3, position: 0, color: 'YELLOW' },
      { id: 4, position: 0, color: 'YELLOW' },
    ],
    GREEN: [
      { id: 1, position: 0, color: 'GREEN' },
      { id: 2, position: 0, color: 'GREEN' },
      { id: 3, position: 0, color: 'GREEN' },
      { id: 4, position: 0, color: 'GREEN' },
    ],
  };
}

function buildTurnSequence(players) {
  return ALL_COLORS.filter((c) => players[c] && players[c].type !== 'EMPTY');
}

function winnerColorSet(winners) {
  const set = new Set();
  if (!Array.isArray(winners)) return set;
  for (const entry of winners) {
    if (typeof entry === 'string') set.add(entry);
    else if (entry && entry.color) set.add(entry.color);
  }
  return set;
}

function pushRankedWinner(state, playerColor) {
  const pl = state.players[playerColor];
  const playerId = pl?.id || `bot_${playerColor}`;
  if (!Array.isArray(state.winners)) state.winners = [];
  const rank = state.winners.length + 1;
  state.winners.push({
    playerId,
    rank,
    color: playerColor,
    name: pl?.name,
  });
}

/**
 * Full podium: finish order + remaining active players as eliminated (last rank).
 */
function finalizeStandings(state) {
  const activeColors = ALL_COLORS.filter(
    (c) => state.players[c] && state.players[c].type !== 'EMPTY'
  );
  const finished = winnerColorSet(state.winners);
  const list = [];
  for (const entry of state.winners || []) {
    if (typeof entry === 'string') {
      const c = entry;
      list.push({
        color: c,
        playerId: state.players[c]?.id || `bot_${c}`,
        rank: list.length + 1,
        name: state.players[c]?.name,
      });
    } else if (entry && entry.color) {
      list.push({ ...entry });
    }
  }
  const maxR = list.reduce((m, e) => Math.max(m, e.rank ?? 0), 0);
  const nextRank = maxR > 0 ? maxR + 1 : list.length + 1;
  for (const c of activeColors) {
    if (!finished.has(c)) {
      const pl = state.players[c];
      list.push({
        playerId: pl?.id || `bot_${c}`,
        rank: nextRank,
        color: c,
        name: pl?.name,
        eliminated: true,
      });
    }
  }
  list.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  state.winners = list;
}

function ensureTurnMeta(state) {
  if (!state.turnSequence || state.turnSequence.length === 0) {
    state.turnSequence = buildTurnSequence(state.players);
  }
  let idx = state.turnSequence.indexOf(state.currentTurn);
  if (idx < 0) {
    state.turnSequence = buildTurnSequence(state.players);
    idx = state.turnSequence.indexOf(state.currentTurn);
  }
  state.currentPlayerIndex = idx >= 0 ? idx : 0;
  state.turnLocked = Boolean(state.isRolling || state.waitingForMove);
}

function emptyLobbyPlayers() {
  const o = {};
  for (const c of ALL_COLORS) {
    o[c] = { name: 'Empty', type: 'EMPTY', difficulty: 'MEDIUM' };
  }
  return o;
}

function buildLobbyState(roomId, lobby) {
  const matchVariant = lobby.matchVariant || 'DEFAULT';
  const autofillAggressiveBots = Boolean(lobby.autofillAggressiveBots);
  const lobbyMeta =
    lobby.meta && typeof lobby.meta === 'object' && !Array.isArray(lobby.meta) ? { ...lobby.meta } : {};
  return {
    gameId: roomId,
    status: 'LOBBY',
    gameType: 'ludo',
    matchType: 'private',
    meta: {
      ...lobbyMeta,
      roomId,
      gameType: 'ludo',
      maxPlayers: lobby.maxPlayers,
      hostUid: lobby.hostUid,
      createdAt: lobby.createdAt,
      fillBots: lobby.fillBots,
      entryFee: lobby.entryFee ?? 10,
      matchVariant,
      autofillAggressiveBots,
    },
    lobby: {
      hostUid: lobby.hostUid,
      maxPlayers: lobby.maxPlayers,
      members: [...lobby.members],
      fillBots: lobby.fillBots,
      entryFee: lobby.entryFee,
      turnTimerSec: lobby.turnTimerSec,
      settings: lobby.settings || {},
      matchVariant,
      autofillAggressiveBots,
      ...(Object.keys(lobbyMeta).length ? { meta: { ...lobbyMeta } } : {}),
      ...(lobby.vote && typeof lobby.vote === 'object' ? { vote: { ...lobby.vote } } : {}),
      ...(Array.isArray(lobby.prepaidMemberUids) ? { prepaidMemberUids: [...lobby.prepaidMemberUids] } : {}),
    },
    players: emptyLobbyPlayers(),
    currentTurn: 'RED',
    turnTimerSec: lobby.turnTimerSec || 30,
    timeLeft: lobby.turnTimerSec || 30,
    diceValue: null,
    isRolling: false,
    waitingForMove: false,
    tokens: initialTokens(),
    logs: [`Lobby created — share link to invite players (room ${roomId})`],
    lastUpdated: Date.now(),
    winners: [],
    sockets: {},
    turnSequence: [],
    currentPlayerIndex: 0,
    consecutiveSixes: 0,
    turnLocked: false,
    turnPhase: 'ROLL',
    actionLock: null,
    presence: {},
  };
}

/**
 * Transition lobby → PLAYING using same shape as legacy ludo:joinRoom.
 */
function buildPlayingFromLobby(roomId, lobby) {
  const n = Math.min(4, Math.max(2, lobby.maxPlayers));
  const usedColors = COLOR_BY_SLOT.slice(0, n);
  const players = emptyLobbyPlayers();
  const playingMetaSource =
    lobby.meta && typeof lobby.meta === 'object' && !Array.isArray(lobby.meta) ? { ...lobby.meta } : {};

  lobby.members.slice(0, n).forEach((m, i) => {
    const c = usedColors[i];
    players[c] = {
      id: m.uid,
      name: m.displayName || m.uid,
      type: 'HUMAN',
      difficulty: 'MEDIUM',
    };
  });

  const autofillAggressive = Boolean(
    lobby.autofillAggressiveBots ?? lobby.meta?.autofillAggressiveBots
  );

  let botIdx = 0;
  if (lobby.fillBots) {
    for (const c of usedColors) {
      if (players[c].type === 'EMPTY') {
        const botDifficulty = autofillAggressive ? 'HARD' : 'MEDIUM';
        const profileId =
          botDifficulty === 'EASY'
            ? 'default_easy'
            : botDifficulty === 'HARD'
              ? 'default_hard'
              : 'default_medium';
        players[c] = {
          name: `CPU ${c}`,
          type: 'BOT',
          difficulty: botDifficulty,
          id: `bot_${c}_${botIdx++}`,
          botProfileId: profileId,
        };
      }
    }
  }

  const ts = buildTurnSequence(players);
  const firstTurn = ts[0] || 'RED';

  return {
    gameId: roomId,
    status: 'PLAYING',
    gameType: 'ludo',
    matchType: 'private',
    meta: {
      ...playingMetaSource,
      roomId,
      gameType: 'ludo',
      maxPlayers: n,
      hostUid: lobby.hostUid,
      createdAt: lobby.createdAt,
      fillBots: lobby.fillBots,
      entryFee: lobby.entryFee ?? 10,
      matchVariant: lobby.matchVariant || 'DEFAULT',
      autofillAggressiveBots: autofillAggressive,
    },
    lobby: null,
    players,
    currentTurn: firstTurn,
    turnTimerSec: lobby.turnTimerSec || 30,
    timeLeft: lobby.turnTimerSec || 30,
    diceValue: null,
    isRolling: false,
    waitingForMove: false,
    tokens: initialTokens(),
    logs: [`Game started in room ${roomId}`],
    lastUpdated: Date.now(),
    winners: [],
    sockets: {},
    turnSequence: ts,
    currentPlayerIndex: Math.max(0, ts.indexOf(firstTurn)),
    consecutiveSixes: 0,
    turnLocked: false,
    turnPhase: 'ROLL',
    actionLock: null,
    presence: {},
  };
}

function emitLudoState(io, roomId, state) {
  // runtime defaults for legacy snapshots
  if (state && !state.turnPhase) state.turnPhase = state.waitingForMove ? 'MOVE' : 'ROLL';
  if (state && state.actionLock === undefined) state.actionLock = null;
  if (state && (!state.presence || typeof state.presence !== 'object')) state.presence = {};
  ensureTurnMeta(state);
  io.to(roomId).emit('ludo:gameState', { ...state, ...nextEventMeta(state) });
  ludoWireDebug('ludo:gameState', roomId, state.status, state.currentTurn);
}

function emitDiceRolled(io, roomId, payload) {
  const enriched =
    payload && payload.eventId
      ? payload
      : {
          ...(payload || {}),
          eventId: `ludo_${Date.now()}_${++ludoEventSeq}`,
          serverRevision: Number(payload?.serverRevision || 0),
        };
  io.to(roomId).emit('ludo:diceRolled', enriched);
  ludoWireDebug('ludo:diceRolled', enriched);
}

/**
 * @param {import('socket.io').Server} io
 * @param {Map<string, object>} roomStates
 * @param {*} queueStore
 * @param {import('redis').RedisClientType | null} [inviteRedisClient] Optional Redis for cross-node invite records
 */
export function createLudoHandlers(
  io,
  roomStates,
  queueStore = new MemoryLudoQueueStore(),
  inviteRedisClient = null
) {
  let timerStarted = false;
  let queueSweepStarted = false;
  const DISCONNECT_GRACE_MS = Number(process.env.LUDO_DISCONNECT_GRACE_MS || 45000);
  const joinLock = new KeyedLock();
  /** @type {Map<string, Set<string>>} */
  const joinChargeReceiptByRoom = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const matchmadeAutostartTimers = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const voteTimeoutTimers = new Map();
  /** Uid → socket.id (friend invites + delivery). */
  const socketByUid = new Map();
  const inviteStore = createLudoInviteStore(inviteRedisClient);

  function cancelMatchmadeAutostart(roomId) {
    const tid = matchmadeAutostartTimers.get(roomId);
    if (tid) {
      clearTimeout(tid);
      matchmadeAutostartTimers.delete(roomId);
    }
  }

  function cancelVoteTimer(roomId) {
    const tid = voteTimeoutTimers.get(roomId);
    if (tid) {
      clearTimeout(tid);
      voteTimeoutTimers.delete(roomId);
    }
  }

  function ensureRuntimeState(state) {
    if (!state || typeof state !== 'object') return;
    if (!state.turnPhase) {
      state.turnPhase = state.waitingForMove ? 'MOVE' : 'ROLL';
    }
    if (state.actionLock === undefined) state.actionLock = null;
    if (!state.presence || typeof state.presence !== 'object') state.presence = {};
  }

  function markPresenceConnected(state, uid) {
    ensureRuntimeState(state);
    if (!uid) return;
    state.presence[uid] = {
      connected: true,
      disconnectedAt: null,
      graceUntil: null,
    };
  }

  function markPresenceDisconnected(state, uid) {
    ensureRuntimeState(state);
    if (!uid) return;
    const now = Date.now();
    state.presence[uid] = {
      connected: false,
      disconnectedAt: now,
      graceUntil: now + DISCONNECT_GRACE_MS,
    };
  }

  function isPresenceExpired(state, uid) {
    const p = state?.presence?.[uid];
    if (!p || p.connected !== false) return false;
    return Number(p.graceUntil || 0) > 0 && Date.now() >= Number(p.graceUntil);
  }

  function seatColorByUid(state, uid) {
    return Object.keys(state?.players || {}).find((c) => state.players[c]?.id === uid) || null;
  }

  function makeReceiptKey(kind, ...parts) {
    return [kind, ...parts.map((x) => String(x || '').trim()).filter(Boolean)].join(':');
  }

  async function refundTickets(tickets, reason) {
    for (const ticket of Array.isArray(tickets) ? tickets : []) {
      const uid = String(ticket?.uid || '').trim();
      const receiptKey = String(ticket?.chargeReceiptKey || '').trim();
      const entryFee = Number(ticket?.criteria?.entryFee) || 0;
      if (!uid || !receiptKey || entryFee <= 0) continue;
      await ludoWallet.refundEntryFee(uid, entryFee, {
        receiptKey,
        reason,
        meta: {
          socketId: ticket.socketId || null,
          bucketKey: ludoQueueBucketKey(ticket.criteria || {}),
        },
      });
    }
  }

  async function settleLobbyReceipts(state, reason = 'match_started') {
    const byUid = state?.lobby?.chargeReceiptKeysByUid || {};
    for (const [uid, receiptKey] of Object.entries(byUid)) {
      if (!uid || !receiptKey) continue;
      await ludoWallet.settleEntryReceipt(receiptKey, {
        uid,
        roomId: state?.gameId || null,
        reason,
      });
    }
  }

  async function refundLobbyReceipts(state, uids, reason) {
    const byUid = state?.lobby?.chargeReceiptKeysByUid || {};
    const entryFee = Number(state?.lobby?.entryFee || 0);
    if (entryFee <= 0) return;
    for (const uidRaw of Array.isArray(uids) ? uids : []) {
      const uid = String(uidRaw || '').trim();
      const receiptKey = String(byUid[uid] || '').trim();
      if (!uid || !receiptKey) continue;
      await ludoWallet.refundEntryFee(uid, entryFee, {
        receiptKey,
        reason,
        meta: { roomId: state?.gameId || null },
      });
      delete byUid[uid];
    }
  }

  async function withRoomJoinLock(roomId, fn) {
    return joinLock.run(String(roomId || ''), fn);
  }

  async function withRoomActionLock(roomId, socket, actionName, fn) {
    const st = roomStates.get(roomId);
    if (!st) {
      socket?.emit?.('ludo:error', { message: 'Room not found or match expired.', code: 'NO_ROOM' });
      return false;
    }
    ensureRuntimeState(st);
    if (st.actionLock) {
      socket?.emit?.('ludo:error', {
        message: 'Another action is already being processed.',
        code: 'ACTION_IN_PROGRESS',
      });
      return false;
    }
    st.actionLock = actionName;
    try {
      await fn(st);
      return true;
    } finally {
      const latest = roomStates.get(roomId);
      if (latest) {
        ensureRuntimeState(latest);
        if (latest.actionLock === actionName) latest.actionLock = null;
      }
    }
  }

  function emitTurnComplete(roomId, state, extra = {}) {
    ensureTurnMeta(state);
    io.to(roomId).emit('ludo:turnComplete', {
      roomId,
      currentTurn: state.currentTurn,
      currentPlayerIndex: state.currentPlayerIndex,
      turnLocked: state.turnLocked,
      consecutiveSixes: state.consecutiveSixes ?? 0,
      ...nextEventMeta(state),
      ...extra,
    });
  }

  function advanceLudoTurn(state) {
    const order =
      state.turnSequence?.length > 0 ? state.turnSequence : buildTurnSequence(state.players);
    const finished = winnerColorSet(state.winners);
    let idx = order.indexOf(state.currentTurn);
    if (idx < 0) idx = 0;
    for (let iter = 0; iter < order.length; iter++) {
      idx = (idx + 1) % order.length;
      const nextColor = order[idx];
      const p = state.players[nextColor];
      if (p && p.type !== 'EMPTY' && !finished.has(nextColor)) {
        state.currentTurn = nextColor;
        state.currentPlayerIndex = idx;
        state.consecutiveSixes = 0;
        ensureTurnMeta(state);
        return;
      }
    }
  }

  function isLudoGameOver(state) {
    const active = Object.values(state.players).filter(
      (p) => p && p.type !== 'EMPTY'
    ).length;
    return winnerColorSet(state.winners).size >= Math.max(1, active - 1);
  }

  async function endLudoGame(roomId, state) {
    finalizeStandings(state);
    ensureTurnMeta(state);
    if (!state.rewardsDistributed) {
      try {
        const payouts = await ludoWallet.distributeMatchRewards(state);
        state.rewardsDistributed = true;
        if (payouts.length) {
          state.logs.push(
            `Rewards distributed: ${payouts.map((p) => `${p.uid}:${p.prize}`).join(', ')}`
          );
        }
      } catch (e) {
        state.logs.push(`Reward distribution failed: ${e?.message || e}`);
      }
    }
    ludoLog('Game ended', { roomId, winners: state.winners });
    try {
      await syncLudoMatchEnd({
        matchId: roomId,
        state,
        entryFee: state.meta?.entryFee ?? state.lobby?.entryFee ?? 10,
      });
    } catch (e) {
      console.warn('[Ludo] Firestore sync:', e?.message || e);
    }
    io.to(roomId).emit('ludo:gameEnded', {
      roomId,
      winners: state.winners,
      state,
    });
    ludoWireDebug('ludo:gameEnded', roomId);
    await saveLudoRoomSnapshot(roomId, state);
    const endedUids = humanWalletUidsFromState(state);
    roomStates.delete(roomId);
    void (async () => {
      await Promise.all(endedUids.map((u) => clearLudoRoomContext(u)));
      await refreshLudoRoomContexts(io, endedUids);
    })();
  }

  function checkBotTurn(roomId) {
    const state = roomStates.get(roomId);
    if (!state || state.status !== 'PLAYING') return;
    if (state.players[state.currentTurn]?.type !== 'BOT') return;
    void (async () => {
      const turn = state.currentTurn;
      const pid = state.players[turn]?.botProfileId;
      const prof = await getBotProfile(pid);
      const delay = botDelayMs(prof);
      const humanize = 200 + Math.floor(Math.random() * 700);
      setTimeout(() => {
        const s = roomStates.get(roomId);
        if (!s || s.status !== 'PLAYING') return;
        if (!s.isRolling && s.diceValue === null) {
          handleBotRoll(roomId);
        } else if (s.waitingForMove) {
          handleBotMove(roomId);
        }
      }, delay + humanize);
    })();
  }

  function handleBotRoll(roomId) {
    const state = roomStates.get(roomId);
    if (!state) return;
    ensureRuntimeState(state);
    if (state.actionLock) {
      return;
    }
    state.actionLock = `bot-roll:${Date.now()}`;

    state.isRolling = true;
    state.turnPhase = 'ROLL';
    ensureTurnMeta(state);
    emitLudoState(io, roomId, state);
    emitDiceRolled(io, roomId, {
      roomId,
      phase: 'start',
      rolledBy: `bot:${state.currentTurn}`,
      currentTurn: state.currentTurn,
    });

    setTimeout(() => {
      const s = roomStates.get(roomId);
      if (!s || s.status !== 'PLAYING') return;
      ensureRuntimeState(s);

      const roll = Math.floor(Math.random() * 6) + 1;
      const prevSix = s.consecutiveSixes || 0;
      const consec = roll === 6 ? prevSix + 1 : 0;

      if (RULES_CONFIG.MOVEMENTS.TRIPLE_SIX_PENALTY && consec >= 3) {
        s.consecutiveSixes = 0;
        s.diceValue = null;
        s.isRolling = false;
        s.waitingForMove = false;
        s.turnPhase = 'END';
        s.logs.push(`${s.currentTurn} (BOT) rolled three 6s in a row — turn forfeited.`);
        advanceLudoTurn(s);
        s.turnPhase = 'ROLL';
        resetLudoTurnTimer(s);
        s.logs.push(`Turn passed to ${s.currentTurn}`);
        s.lastUpdated = Date.now();
        ensureTurnMeta(s);
        emitLudoState(io, roomId, s);
        void saveLudoRoomSnapshot(roomId, s);
        s.actionLock = null;
        emitTurnComplete(roomId, s, { reason: 'triple_six' });
        setTimeout(() => checkBotTurn(roomId), 500);
        return;
      }

      s.consecutiveSixes = consec;
      s.diceValue = roll;
      s.isRolling = false;
      s.waitingForMove = true;
      s.turnPhase = 'MOVE';
      s.logs.push(`${s.currentTurn} (BOT) rolled ${roll}`);
      emitDiceRolled(io, roomId, {
        roomId,
        phase: 'resolved',
        diceValue: roll,
        rolledBy: `bot:${s.currentTurn}`,
        currentTurn: s.currentTurn,
      });

      const validMoves = [];
      s.tokens[s.currentTurn].forEach((t) => {
        const m = MoveValidator.validateMove(s.currentTurn, t.id, roll, s);
        if (m) validMoves.push(m);
      });

      if (validMoves.length === 0) {
        s.logs.push(`${s.currentTurn} (BOT) cannot move — passing turn.`);
        s.diceValue = null;
        s.waitingForMove = false;
        s.turnPhase = 'END';
        advanceLudoTurn(s);
        s.turnPhase = 'ROLL';
        resetLudoTurnTimer(s);
        s.logs.push(`Turn passed to ${s.currentTurn}`);
      } else {
        resetLudoTurnTimer(s);
      }

      s.lastUpdated = Date.now();
      ensureTurnMeta(s);
      emitLudoState(io, roomId, s);
      void saveLudoRoomSnapshot(roomId, s);
      s.actionLock = null;
      if (validMoves.length === 0) {
        emitTurnComplete(roomId, s, { reason: 'no_valid_moves' });
      }
      setTimeout(() => checkBotTurn(roomId), 500);
    }, 700);
  }

  function handleBotMove(roomId) {
    const state = roomStates.get(roomId);
    if (!state) return;
    ensureRuntimeState(state);
    if (state.actionLock) {
      return;
    }
    state.actionLock = `bot-move:${Date.now()}`;

    const roll = state.diceValue;
    const validMoves = [];
    state.tokens[state.currentTurn].forEach((t) => {
      const m = MoveValidator.validateMove(state.currentTurn, t.id, roll, state);
      if (m) validMoves.push(m);
    });

    if (validMoves.length === 0) {
      // #region agent log
      // #endregion
      state.logs.push(`${state.currentTurn} (BOT) no valid moves — passing turn.`);
      state.diceValue = null;
      state.waitingForMove = false;
      state.turnPhase = 'END';
      advanceLudoTurn(state);
      state.turnPhase = 'ROLL';
      resetLudoTurnTimer(state);
      state.lastUpdated = Date.now();
      ensureTurnMeta(state);
      emitLudoState(io, roomId, state);
      void saveLudoRoomSnapshot(roomId, state);
      state.actionLock = null;
      emitTurnComplete(roomId, state, { reason: 'no_valid_moves' });
      setTimeout(() => checkBotTurn(roomId), 400);
      return;
    }

    const pl = state.players[state.currentTurn];
    void (async () => {
      try {
        const st = roomStates.get(roomId);
        if (!st || st.status !== 'PLAYING' || !st.waitingForMove) {
          state.actionLock = null;
          return;
        }

        const prof = await getBotProfile(pl?.botProfileId);
        const diff = prof?.difficulty || pl?.difficulty || 'MEDIUM';
        const mistake =
          typeof prof?.mistakeProbability === 'number' ? prof.mistakeProbability : 0.12;
        const w =
          prof?.weights && typeof prof.weights === 'object' && !Array.isArray(prof.weights)
            ? prof.weights
            : null;

        const rollAsync = st.diceValue;
        const validAsync = [];
        st.tokens[st.currentTurn].forEach((t) => {
          const m = MoveValidator.validateMove(st.currentTurn, t.id, rollAsync, st);
          if (m) validAsync.push(m);
        });
        if (validAsync.length === 0) {
          // #region agent log
          // #endregion
          st.actionLock = null;
          return;
        }

        let bestMove = null;
        if (String(diff).toUpperCase() === 'EASY') {
          const idx = Math.floor(Math.random() * validAsync.length);
          bestMove = validAsync[idx] || validAsync[0];
        } else if (String(diff).toUpperCase() === 'MEDIUM') {
          const score = (m) => {
            if (m.type === 'CAPTURE') return 1000 + Number(m.to || 0);
            if (m.type === 'FINISH') return 800 + Number(m.to || 0);
            if (m.type === 'ENTER') return 600 + Number(m.to || 0);
            return Number(m.to || 0);
          };
          bestMove = [...validAsync].sort((a, b) => score(b) - score(a))[0];
        } else {
          bestMove = AIEngine.getBestMove(validAsync, st, diff, {
            mistakeProbability: mistake,
            weightsOverride: w,
          });
        }
        applyBotChosenMove(roomId, st, bestMove);
      } catch (e) {
        const st = roomStates.get(roomId);
        if (st) st.actionLock = null;
        console.warn('[Ludo] bot move failed:', e?.message || e);
      }
    })();
    return;
  }

  function applyBotChosenMove(roomId, state, bestMove) {
    if (!bestMove) {
      state.logs.push(`${state.currentTurn} (BOT) AI returned no move — passing turn.`);
      state.diceValue = null;
      state.waitingForMove = false;
      state.turnPhase = 'END';
      advanceLudoTurn(state);
      state.turnPhase = 'ROLL';
      resetLudoTurnTimer(state);
      state.lastUpdated = Date.now();
      ensureTurnMeta(state);
      emitLudoState(io, roomId, state);
      void saveLudoRoomSnapshot(roomId, state);
      state.actionLock = null;
      emitTurnComplete(roomId, state, { reason: 'ai_no_move' });
      setTimeout(() => checkBotTurn(roomId), 400);
      return;
    }

    const diceRoll = state.diceValue;
    const playerColor = state.currentTurn;
    const tokenId = bestMove.tokenId;
    const tokens = state.tokens[playerColor];
    const token = tokens.find((t) => t.id === tokenId);

    token.position = bestMove.to ?? bestMove.targetPosition;
    state.logs.push(`${playerColor} (BOT) moved ${tokenId} to ${bestMove.to ?? bestMove.targetPosition}`);

    if (bestMove.type === 'CAPTURE') {
      const captureResult = MoveValidator.checkCapture(
        playerColor,
        bestMove.to,
        state.tokens
      );
      if (captureResult) {
        const victimTokens = state.tokens[captureResult.color];
        const victim = victimTokens.find((t) => t.id === captureResult.id);
        victim.position = 0;
        state.logs.push(`${playerColor} (BOT) captured ${captureResult.color}!`);
      }
    }

    if (bestMove.type === 'FINISH') {
      if (
        state.tokens[playerColor].every(
          (t) => t.position === RULES_CONFIG.BOARD.HOME_POSITION
        )
      ) {
        pushRankedWinner(state, playerColor);
        if (isLudoGameOver(state)) state.status = 'FINISHED';
      }
    }

    const shouldSwitchTurn =
      diceRoll !== 6 && bestMove.type !== 'CAPTURE' && bestMove.type !== 'FINISH';
    state.diceValue = null;
    state.waitingForMove = false;
    state.turnPhase = 'END';

    if (shouldSwitchTurn) {
      advanceLudoTurn(state);
      resetLudoTurnTimer(state);
    } else {
      state.logs.push(`${playerColor} (BOT) gets an extra turn!`);
      resetLudoTurnTimer(state);
    }
    state.turnPhase = 'ROLL';

    state.lastUpdated = Date.now();
    ensureTurnMeta(state);
    emitLudoState(io, roomId, state);
    void saveLudoRoomSnapshot(roomId, state);
    state.actionLock = null;
    emitTurnComplete(roomId, state, {
      reason: shouldSwitchTurn ? 'move_complete' : 'extra_turn',
    });
    if (state.status === 'FINISHED') {
      void endLudoGame(roomId, state);
      return;
    }
    checkBotTurn(roomId);
  }

  async function tryDeductForUser(uid, entryFee, _identity = {}, source = 'unknown') {
    const result = await ludoWallet.tryDeductEntryFee(uid, entryFee);
    return result;
  }

  function socketUidOrError(socket) {
    const uid = String(socket.user?.uid || '').trim();
    if (!uid) {
      socket.emit('ludo:error', {
        message: 'Socket user not authenticated.',
        code: 'UNAUTHENTICATED_SOCKET',
      });
      return null;
    }
    return uid;
  }

  function emitInviteExpiredToHost(fromUid, body) {
    const sid = socketByUid.get(String(fromUid || '').trim());
    if (sid) io.sockets.sockets.get(sid)?.emit('ludo:inviteExpired', body);
  }

  async function deliverLudoInvite(socket, payload = {}) {
    const uid = socketUidOrError(socket);
    if (!uid) return;
    const targetUid = String(payload.toUserId || payload.targetUid || '').trim();
    const roomId = String(payload.roomId || '').trim();
    if (!targetUid || !roomId) {
      socket.emit('ludo:error', { message: 'toUserId and roomId required', code: 'BAD_INVITE' });
      return;
    }
    const st = roomStates.get(roomId);
    if (!st || st.status !== 'LOBBY' || !st.lobby) {
      socket.emit('ludo:error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
      return;
    }
    if (String(st.lobby.hostUid) !== String(uid)) {
      socket.emit('ludo:error', { message: 'Only the host can invite', code: 'NOT_HOST' });
      return;
    }
    const ttlMs = Math.min(120000, Math.max(15000, Number(payload.ttlMs) || 60000));
    const inviteId = uuidv4();
    const expiresAt = Date.now() + ttlMs;
    const fromDisplayName = String(payload.fromDisplayName || payload.displayName || '').trim();
    const record = {
      inviteId,
      fromUid: uid,
      targetUid,
      roomId,
      expiresAt,
      status: 'pending',
      fromDisplayName: fromDisplayName || undefined,
    };
    const ttlSec = Math.ceil(ttlMs / 1000);
    await inviteStore.put(record, ttlSec);
    inviteStore.scheduleExpiry(inviteId, ttlMs, async (id) => {
      const cur = await inviteStore.get(id);
      if (!cur || cur.status !== 'pending') return;
      await inviteStore.del(id);
      emitInviteExpiredToHost(cur.fromUid, {
        inviteId: id,
        roomId: cur.roomId,
        targetUid: cur.targetUid,
      });
    });
    const targetSid = socketByUid.get(targetUid);
    if (!targetSid) {
      inviteStore.cancelExpiry(inviteId);
      await inviteStore.del(inviteId);
      socket.emit('ludo:error', { message: 'Friend is offline', code: 'TARGET_OFFLINE' });
      return;
    }
    io.sockets.sockets.get(targetSid)?.emit('ludo:inviteReceived', {
      inviteId,
      fromUid: uid,
      fromDisplayName: fromDisplayName || undefined,
      roomId,
      expiresAt,
    });
  }

  async function handleInviteReject(socket, payload = {}) {
    const uid = socketUidOrError(socket);
    if (!uid) return;
    const inviteId = String(payload.inviteId || '').trim();
    if (payload.accept === true) {
      socket.emit('ludo:error', {
        message: 'Accept by joining the room (ludo:joinRoom with inviteId).',
        code: 'USE_JOIN_ROOM',
      });
      return;
    }
    const inv = await inviteStore.get(inviteId);
    if (!inv || String(inv.targetUid) !== String(uid)) {
      socket.emit('ludo:error', { message: 'Invalid or expired invite', code: 'INVITE_GONE' });
      return;
    }
    inviteStore.cancelExpiry(inviteId);
    await inviteStore.del(inviteId);
    const fromSid = socketByUid.get(inv.fromUid);
    if (fromSid) {
      io.sockets.sockets.get(fromSid)?.emit('ludo:inviteResult', {
        inviteId,
        accepted: false,
        targetUid: uid,
        roomId: inv.roomId,
      });
    }
  }

  function assertLegacyHumanSeatMatchesSocket(players, uid) {
    return Object.values(players || {}).some(
      (p) => p && p.type === 'HUMAN' && String(p.id) === String(uid)
    );
  }

  async function handleLegacyLudoJoin(socket, roomId, config) {
    const userId = socketUidOrError(socket);
    if (!userId || !config?.players) return;
    // #region agent log
    // #endregion
    socket.join(roomId);

    if (roomStates.has(roomId)) {
      const existing = roomStates.get(roomId);
      const seated = Object.values(existing.players || {}).some((p) => p && p.id === userId);
      if (seated) {
        socket.emit('ludo:gameState', existing);
        checkBotTurn(roomId);
        return;
      }
      return socket.emit('ludo:error', {
        message: 'Room is full',
        code: 'ROOM_FULL',
      });
    }

    if (!assertLegacyHumanSeatMatchesSocket(config.players, userId)) {
      return socket.emit('ludo:error', {
        message:
          'Your Firebase account must be listed as a human player (seat id) in this match.',
        code: 'SEAT_MISMATCH',
      });
    }

    const entryFee = await resolveGameEntryFee(GAME_KEYS.LUDO);
    const turnTimerSec = config.settings?.turnTimerSec || 30;
    const d = await tryDeductForUser(userId, entryFee, socket.user || {}, 'legacy_join');
    if (!d.ok) {
      return socket.emit('ludo:error', { message: d.error });
    }

    const order = ['RED', 'BLUE', 'YELLOW', 'GREEN'];
    const firstTurn =
      order.find((c) => config.players[c] && config.players[c].type !== 'EMPTY') || 'RED';

    const legacyTurnSeq = buildTurnSequence(config.players);
    const seq = legacyTurnSeq.length ? legacyTurnSeq : buildTurnSequence(config.players);
    const initialState = {
      gameId: roomId,
      status: 'PLAYING',
      players: config.players,
      currentTurn: firstTurn,
      turnTimerSec,
      timeLeft: turnTimerSec,
      diceValue: null,
      isRolling: false,
      waitingForMove: false,
      tokens: initialTokens(),
      logs: [`Game started in room ${roomId}`],
      lastUpdated: Date.now(),
      winners: [],
      meta: { roomId, gameType: 'ludo', matchType: 'local', source: 'legacy_join' },
      turnSequence: seq,
      currentPlayerIndex: Math.max(0, seq.indexOf(firstTurn)),
      consecutiveSixes: 0,
      turnLocked: false,
      turnPhase: 'ROLL',
      actionLock: null,
      presence: { [userId]: { connected: true, disconnectedAt: null, graceUntil: null } },
    };

    roomStates.set(roomId, initialState);
    // #region agent log
    // #endregion
    await saveLudoRoomSnapshot(roomId, initialState);

    emitLudoState(io, roomId, initialState);
    checkBotTurn(roomId);
  }

  function registerRollDice(socket, roomId) {
    const userId = socketUidOrError(socket);
    if (!userId) return;
    ludoWireDebug('ludo:rollDice ←', { roomId, uid: userId });
    void withRoomActionLock(roomId, socket, `roll:${userId}:${Date.now()}`, async (state) => {
      // #region agent log
      fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H4',location:'backend/src/services/ludoRealtime.js:registerRollDice:entry',message:'Server handling rollDice',data:{roomId:String(roomId||''),currentTurn:String(state.currentTurn||''),currentPlayerIndex:Number(state.currentPlayerIndex||0),waitingForMove:Boolean(state.waitingForMove),isRolling:Boolean(state.isRolling),turnPhase:String(state.turnPhase||'')},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (state.status !== 'PLAYING') {
        socket.emit('ludo:error', {
          message: 'Match is not in progress yet.',
          code: 'NOT_PLAYING',
        });
        return;
      }
      ensureRuntimeState(state);
      ensureTurnMeta(state);
      if (state.turnPhase !== 'ROLL') {
        socket.emit('ludo:error', { message: 'Not in roll phase.', code: 'BAD_PHASE' });
        return;
      }
      if (state.turnLocked) {
        socket.emit('ludo:error', {
          message: 'Turn is resolving — wait for dice/move to complete.',
          code: 'TURN_LOCKED',
        });
        return;
      }

      const playerColor = seatColorByUid(state, userId);
      if (!playerColor) {
        socket.emit('ludo:error', {
          message: 'You are not seated in this room.',
          code: 'NOT_SEATED',
        });
        return;
      }
      if (state.currentTurn !== playerColor) {
        // #region agent log
        fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H5',location:'backend/src/services/ludoRealtime.js:registerRollDice:notYourTurn:colorMismatch',message:'Rejected rollDice with NOT_YOUR_TURN (currentTurn mismatch)',data:{roomId:String(roomId||''),currentTurn:String(state.currentTurn||''),playerColor:String(playerColor||''),currentPlayerIndex:Number(state.currentPlayerIndex||0)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        socket.emit('ludo:error', { message: 'Not your turn!', code: 'NOT_YOUR_TURN' });
        return;
      }
      const seqIdx = state.turnSequence.indexOf(playerColor);
      if (seqIdx >= 0 && seqIdx !== state.currentPlayerIndex) {
        // #region agent log
        fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H5',location:'backend/src/services/ludoRealtime.js:registerRollDice:notYourTurn:seqMismatch',message:'Rejected rollDice with NOT_YOUR_TURN (sequence mismatch)',data:{roomId:String(roomId||''),playerColor:String(playerColor||''),seqIdx:Number(seqIdx),currentPlayerIndex:Number(state.currentPlayerIndex||0),currentTurn:String(state.currentTurn||'')},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        socket.emit('ludo:error', { message: 'Not your turn!', code: 'NOT_YOUR_TURN' });
        return;
      }

      if (state.isRolling) {
        socket.emit('ludo:error', {
          message: 'Dice roll already in progress.',
          code: 'ALREADY_ROLLING',
        });
        return;
      }
      const pendingDie =
        Number.isFinite(state.diceValue) && state.diceValue >= 1 && state.diceValue <= 6;
      if (pendingDie || state.waitingForMove) {
        socket.emit('ludo:error', {
          message: 'Move your token before rolling again.',
          code: 'DICE_PENDING',
        });
        return;
      }

      markPresenceConnected(state, userId);
      state.isRolling = true;
      state.turnPhase = 'ROLL';
      ensureTurnMeta(state);
      emitLudoState(io, roomId, state);
      emitDiceRolled(io, roomId, {
        roomId,
        phase: 'start',
        rolledBy: userId,
        currentTurn: state.currentTurn,
      });
      ludoLog('Dice roll', { roomId, userId });
    });

    setTimeout(() => {
      const st = roomStates.get(roomId);
      if (!st || st.status !== 'PLAYING') return;
      void withRoomActionLock(roomId, null, `roll-resolve:${Date.now()}`, async (st2) => {
        if (!st2.isRolling) return;
        const roll = Math.floor(Math.random() * 6) + 1;
        const prevSix = st2.consecutiveSixes || 0;
        const consec = roll === 6 ? prevSix + 1 : 0;

        if (RULES_CONFIG.MOVEMENTS.TRIPLE_SIX_PENALTY && consec >= 3) {
          st2.consecutiveSixes = 0;
          st2.diceValue = null;
          st2.isRolling = false;
          st2.waitingForMove = false;
          st2.turnPhase = 'END';
          st2.logs.push(`${st2.currentTurn} rolled three 6s in a row — turn forfeited.`);
          advanceLudoTurn(st2);
          st2.turnPhase = 'ROLL';
          resetLudoTurnTimer(st2);
          st2.logs.push(`Turn passed to ${st2.currentTurn}`);
          st2.lastUpdated = Date.now();
          ensureTurnMeta(st2);
          emitLudoState(io, roomId, st2);
          await saveLudoRoomSnapshot(roomId, st2);
          emitTurnComplete(roomId, st2, { reason: 'triple_six' });
          checkBotTurn(roomId);
          return;
        }

        st2.consecutiveSixes = consec;
        st2.diceValue = roll;
        st2.isRolling = false;
        st2.waitingForMove = true;
        st2.turnPhase = 'MOVE';
        st2.lastUpdated = Date.now();
        resetLudoTurnTimer(st2);
        emitDiceRolled(io, roomId, {
          roomId,
          phase: 'resolved',
          diceValue: roll,
          rolledBy: userId,
          currentTurn: st2.currentTurn,
        });

        const validMoves = [];
        st2.tokens[st2.currentTurn].forEach((t) => {
          if (MoveValidator.validateMove(st2.currentTurn, t.id, roll, st2)) {
            validMoves.push(t.id);
          }
        });

        if (validMoves.length === 0) {
          st2.logs.push(`${st2.currentTurn} rolled ${roll} but has no valid moves.`);
          st2.diceValue = null;
          st2.waitingForMove = false;
          st2.turnPhase = 'END';
          advanceLudoTurn(st2);
          st2.turnPhase = 'ROLL';
          resetLudoTurnTimer(st2);
          st2.logs.push(`Turn passed to ${st2.currentTurn}`);
        } else {
          st2.logs.push(`${st2.currentTurn} rolled ${roll}`);
        }

        ensureTurnMeta(st2);
        emitLudoState(io, roomId, st2);
        await saveLudoRoomSnapshot(roomId, st2);
        if (validMoves.length === 0) {
          emitTurnComplete(roomId, st2, { reason: 'no_valid_moves' });
        }
        checkBotTurn(roomId);
      });
    }, 800);
  }

  async function registerMoveToken(socket, roomId, tokenId) {
    const userId = socketUidOrError(socket);
    if (!userId) return;
    await withRoomActionLock(roomId, socket, `move:${userId}:${Date.now()}`, async (state) => {
      if (state.status !== 'PLAYING') {
        socket.emit('ludo:error', {
          message: 'Match is not in progress.',
          code: 'NOT_PLAYING',
        });
        return;
      }
      ensureRuntimeState(state);
      if (state.turnPhase !== 'MOVE' || !state.waitingForMove) {
        socket.emit('ludo:error', {
          message: 'Roll the dice before moving.',
          code: 'NOT_WAITING_MOVE',
        });
        return;
      }

      const playerColor = seatColorByUid(state, userId);
      if (!playerColor) {
        socket.emit('ludo:error', {
          message: 'You are not seated in this room.',
          code: 'NOT_SEATED',
        });
        return;
      }
      if (state.currentTurn !== playerColor) {
        socket.emit('ludo:error', { message: 'Not your turn!', code: 'NOT_YOUR_TURN' });
        return;
      }

      const roll = state.diceValue;
      const validation = MoveValidator.validateMove(playerColor, tokenId, roll, state);

      if (!validation) {
        socket.emit('ludo:error', {
          message: 'Invalid move!',
          code: 'INVALID_MOVE',
        });
        return;
      }

      const tokens = state.tokens[playerColor];
      const token = tokens.find((t) => t.id === tokenId);
      const oldPos = token.position;
      token.position = validation.to;
      state.logs.push(`${playerColor} moved ${tokenId} from ${oldPos} to ${validation.to}`);

      if (validation.type === 'CAPTURE') {
        const captureResult = MoveValidator.checkCapture(
          playerColor,
          validation.to,
          state.tokens
        );
        if (captureResult) {
          const victimTokens = state.tokens[captureResult.color];
          const victim = victimTokens.find((t) => t.id === captureResult.id);
          victim.position = 0;
          state.logs.push(`${playerColor} captured ${captureResult.color}'s token! Extra turn awarded.`);
        }
      }

      if (validation.type === 'FINISH') {
        state.logs.push(`${playerColor} finished a token!`);
        if (state.players[playerColor].id) {
          const currentXP = state.players[playerColor].xp || 0;
          state.players[playerColor].xp = currentXP + 50;
        }
        if (
          state.tokens[playerColor].every(
            (t) => t.position === RULES_CONFIG.BOARD.HOME_POSITION
          )
        ) {
          pushRankedWinner(state, playerColor);
          const rank = state.winners.length;
          const winnerUserId = walletUid(state.players[playerColor].id);
          if (winnerUserId) {
            await ludoWallet.awardLudoXp(winnerUserId, 100);
            state.logs.push(`${playerColor} ranked ${rank}. Reward will be settled at match end.`);
          }
          if (isLudoGameOver(state)) state.status = 'FINISHED';
        }
      }

      const shouldSwitchTurn =
        roll !== 6 && validation.type !== 'CAPTURE' && validation.type !== 'FINISH';
      state.diceValue = null;
      state.waitingForMove = false;
      state.turnPhase = 'END';

      if (shouldSwitchTurn) {
        advanceLudoTurn(state);
        resetLudoTurnTimer(state);
      } else {
        state.logs.push(`${playerColor} gets an extra turn!`);
        resetLudoTurnTimer(state);
      }
      state.turnPhase = 'ROLL';

      state.lastUpdated = Date.now();
      ludoLog('Move token', { roomId, userId, tokenId });
      // #region agent log
      fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H3',location:'backend/src/services/ludoRealtime.js:registerMoveToken:beforeEmit',message:'Move resolved before turnComplete emit',data:{roomId:String(roomId||''),nextTurn:String(state.currentTurn||''),currentPlayerIndex:Number(state.currentPlayerIndex||0),shouldSwitchTurn:Boolean(shouldSwitchTurn),turnPhase:String(state.turnPhase||'')},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      ensureTurnMeta(state);
      emitLudoState(io, roomId, state);
      await saveLudoRoomSnapshot(roomId, state);
      emitTurnComplete(roomId, state, {
        reason: shouldSwitchTurn ? 'move_complete' : 'extra_turn',
      });

      if (state.status === 'FINISHED') {
        void endLudoGame(roomId, state);
        return;
      }
      checkBotTurn(roomId);
    });
  }

  function startGlobalTimer() {
    if (timerStarted) return;
    timerStarted = true;
    setInterval(() => {
      for (const [roomId, state] of roomStates.entries()) {
        ensureRuntimeState(state);
        if (state.status === 'LOBBY' && state.lobby?.members?.length) {
          const before = state.lobby.members.length;
          state.lobby.members = state.lobby.members.filter((m) => !isPresenceExpired(state, m.uid));
          if (state.lobby.members.length !== before) {
            state.logs.push('Disconnected players removed after reconnect grace timeout.');
            state.lastUpdated = Date.now();
            emitLudoState(io, roomId, state);
            void saveLudoRoomSnapshot(roomId, state);
          }
        }
        if (state.status !== 'PLAYING' || state.isRolling) continue;
        if (state.actionLock) {
          incMetric('timerActionLockSkips');
          continue;
        }
        const turnUid = String(state.players?.[state.currentTurn]?.id || '');
        if (turnUid && isPresenceExpired(state, turnUid)) {
          void withRoomActionLock(
            roomId,
            null,
            `disconnect-timeout:${Date.now()}`,
            async (locked) => {
              const lockedTurnUid = String(locked.players?.[locked.currentTurn]?.id || '');
              if (!lockedTurnUid || !isPresenceExpired(locked, lockedTurnUid) || locked.isRolling) {
                return;
              }
              locked.logs.push(`${locked.currentTurn} disconnected too long. Turn auto-passed.`);
              advanceLudoTurn(locked);
              locked.diceValue = null;
              locked.waitingForMove = false;
              locked.isRolling = false;
              locked.turnPhase = 'ROLL';
              locked.consecutiveSixes = 0;
              resetLudoTurnTimer(locked);
              locked.lastUpdated = Date.now();
              ensureTurnMeta(locked);
              emitLudoState(io, roomId, locked);
              await saveLudoRoomSnapshot(roomId, locked);
              emitTurnComplete(roomId, locked, { reason: 'disconnect_timeout' });
              checkBotTurn(roomId);
            }
          );
          continue;
        }
        if (state.timeLeft === undefined) state.timeLeft = 30;
        state.timeLeft -= 1;
        if (state.timeLeft <= 0) {
          void withRoomActionLock(roomId, null, `timeout:${Date.now()}`, async (locked) => {
            if (locked.isRolling || Number(locked.timeLeft || 0) > 0) return;
            locked.logs.push(`${locked.currentTurn} timed out! Turn passed.`);
            locked.turnPhase = 'END';
            advanceLudoTurn(locked);
            locked.diceValue = null;
            locked.waitingForMove = false;
            locked.isRolling = false;
            locked.turnPhase = 'ROLL';
            locked.consecutiveSixes = 0;
            resetLudoTurnTimer(locked);
            locked.lastUpdated = Date.now();
            ensureTurnMeta(locked);
            emitLudoState(io, roomId, locked);
            await saveLudoRoomSnapshot(roomId, locked);
            emitTurnComplete(roomId, locked, { reason: 'timeout' });
            checkBotTurn(roomId);
          });
        }
      }
    }, 1000);
  }

  startGlobalTimer();
  startQueueSweep();

  /** Public matchmaking — queue backend: memory (default) or Redis (`LUDO_QUEUE_BACKEND=redis` + `REDIS_URL`). */

  async function executeLudoStartGame(roomId, requestingUid) {
    const st = roomStates.get(roomId);
    if (!st || st.status !== 'LOBBY' || !st.lobby) {
      return { ok: false, code: 'BAD_STATE', message: 'Cannot start' };
    }
    if (String(st.lobby.hostUid) !== String(requestingUid)) {
      return { ok: false, code: 'NOT_HOST', message: 'Only host can start' };
    }
    if (st.lobby.vote?.open) {
      return { ok: false, code: 'VOTE_PENDING', message: 'Vote must finish before starting' };
    }
    if (!st.lobby.fillBots && st.lobby.members.length < 2) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        message: 'Need at least 2 human players (or enable bot fill)',
      };
    }
    if (st.lobby.fillBots && st.lobby.members.length < 1) {
      return { ok: false, code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least one player' };
    }
    cancelMatchmadeAutostart(roomId);
    cancelVoteTimer(roomId);
    await settleLobbyReceipts(st, 'match_started');
    const playing = buildPlayingFromLobby(roomId, st.lobby);
    playing.sockets = { ...st.sockets };
    playing.presence = { ...(st.presence || {}) };
    roomStates.set(roomId, playing);
    await saveLudoRoomSnapshot(roomId, playing);
    ludoLog('Game started', { roomId, memberCount: st.lobby.members.length });
    emitLudoState(io, roomId, playing);
    checkBotTurn(roomId);
    const startedUids = humanWalletUidsFromState(playing);
    void (async () => {
      await Promise.all(
        startedUids.map((u) => setLudoRoomContext(u, roomId, { playing: true }))
      );
      await refreshLudoRoomContexts(io, startedUids);
    })();
    return { ok: true };
  }

  async function resolveClassicVote(roomId, reason = 'all_votes_received') {
    cancelVoteTimer(roomId);
    const st = roomStates.get(roomId);
    if (!st || st.status !== 'LOBBY' || !st.lobby?.vote?.open) return;
    const memberUids = (st.lobby.members || []).map((m) => String(m.uid));
    const { addBotsCount, humanOnlyCount, outcome } = resolveVoteOutcome(
      st.lobby.vote.votesByUid || {},
      memberUids
    );
    st.lobby.vote = {
      ...st.lobby.vote,
      open: false,
      addBotsCount,
      humanOnlyCount,
      resolvedAt: Date.now(),
      resolvedBy: reason,
      outcome,
    };
    if (outcome === 'ADD_BOTS') {
      st.lobby.fillBots = true;
      st.lobby.maxPlayers = 4;
      st.lobby.autofillAggressiveBots = true;
    } else {
      st.lobby.fillBots = false;
      st.lobby.maxPlayers = Math.max(2, Math.min(4, st.lobby.members.length));
      st.lobby.autofillAggressiveBots = false;
    }
    st.lastUpdated = Date.now();
    io.to(roomId).emit('ludo:voteClosed', {
      roomId,
      vote: st.lobby.vote,
      members: st.lobby.members,
      ...nextEventMeta(st),
    });
    emitLudoState(io, roomId, st);
    await saveLudoRoomSnapshot(roomId, st);
    await executeLudoStartGame(roomId, st.lobby.hostUid);
  }

  function openClassicVote(roomId, state) {
    cancelVoteTimer(roomId);
    const memberUids = (state.lobby?.members || []).map((m) => String(m.uid));
    const vote = {
      open: true,
      options: ['ADD_BOTS', 'HUMANS_ONLY'],
      votesByUid: {},
      addBotsCount: 0,
      humanOnlyCount: 0,
      createdAt: Date.now(),
      deadlineAt: Date.now() + 15000,
      missingSeats: Math.max(0, 4 - memberUids.length),
    };
    state.lobby.vote = vote;
    io.to(roomId).emit('ludo:voteRequested', {
      roomId,
      vote,
      members: state.lobby.members,
      ...nextEventMeta(state),
    });
    const tid = setTimeout(() => {
      voteTimeoutTimers.delete(roomId);
      void resolveClassicVote(roomId, 'timeout');
    }, 15000);
    voteTimeoutTimers.set(roomId, tid);
  }

  function scheduleMatchmadeAutostart(roomId, crit) {
    if (String(crit?.matchVariant || '') !== LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE) return;
    const raw = process.env.LUDO_MATCHMADE_AUTOSTART_MS;
    const ms = raw === undefined || raw === '' ? 2500 : Math.max(0, Number(raw));
    if (!Number.isFinite(ms) || ms <= 0) return;
    cancelMatchmadeAutostart(roomId);
    const tid = setTimeout(() => {
      matchmadeAutostartTimers.delete(roomId);
      const st = roomStates.get(roomId);
      if (!st || st.status !== 'LOBBY' || !st.lobby) return;
      const hostUid = st.lobby.hostUid;
      void executeLudoStartGame(roomId, hostUid).then((r) => {
        if (!r.ok) {
          ludoWireDebug('matchmade autostart skipped', roomId, r.code);
        }
      });
    }, ms);
    matchmadeAutostartTimers.set(roomId, tid);
  }

  async function tryFlushLudoQueueBucket(bucketKey) {
    for (;;) {
      const consumed = await queueStore.tryConsumeOneReadyBatch(bucketKey);
      if (!consumed) return;
      const { batch, plan } = consumed;
      const crit = plan.crit;
      const isClassic = crit.matchVariant === LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE;

      if (isClassic) {
        const needsVote = plan.classic.needsVote;
        const soloFallback1v1 = plan.classic.soloFallback1v1;

        const roomId = uuidv4();
        const hostUid = batch[0].uid;
        const lobby = soloFallback1v1
          ? {
              hostUid,
              maxPlayers: 2,
              members: batch.map((t) => ({ uid: t.uid, displayName: t.displayName || 'Player' })),
              fillBots: true,
              entryFee: crit.entryFee,
              turnTimerSec: crit.turnTimerSec,
              settings: crit.settings || {},
              createdAt: Date.now(),
              prepaidMemberUids: batch.map((t) => String(t.uid)),
              chargeReceiptKeysByUid: Object.fromEntries(
                batch
                  .filter((t) => t.uid && t.chargeReceiptKey)
                  .map((t) => [String(t.uid), String(t.chargeReceiptKey)])
              ),
              matchVariant: LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE,
              autofillAggressiveBots: false,
              meta: { soloFallback: true },
            }
          : {
              hostUid,
              maxPlayers: 4,
              members: batch.map((t) => ({ uid: t.uid, displayName: t.displayName || 'Player' })),
              fillBots: false,
              entryFee: crit.entryFee,
              turnTimerSec: crit.turnTimerSec,
              settings: crit.settings || {},
              createdAt: Date.now(),
              prepaidMemberUids: batch.map((t) => String(t.uid)),
              chargeReceiptKeysByUid: Object.fromEntries(
                batch
                  .filter((t) => t.uid && t.chargeReceiptKey)
                  .map((t) => [String(t.uid), String(t.chargeReceiptKey)])
              ),
              matchVariant: LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE,
              autofillAggressiveBots: false,
            };
        const st = buildLobbyState(roomId, lobby);
        if (!st.sockets) st.sockets = {};
        for (const t of batch) {
          const s = io.sockets.sockets.get(t.socketId);
          if (s) {
            s.join(roomId);
            st.sockets[t.uid] = s.id;
            markPresenceConnected(st, t.uid);
          }
        }
        roomStates.set(roomId, st);
        await saveLudoRoomSnapshot(roomId, st);
        emitLudoState(io, roomId, st);
        for (const t of batch) {
          io.sockets.sockets.get(t.socketId)?.emit('ludo:matchFound', {
            roomId,
            maxPlayers: soloFallback1v1 ? 2 : 4,
            fillBots: soloFallback1v1 ? true : false,
            fallbackToBot: soloFallback1v1 ? true : false,
            voteRequired: needsVote,
            isHost: String(t.uid) === String(hostUid),
            matchVariant: LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE,
            ...(soloFallback1v1 ? { soloFallback: true } : {}),
          });
        }
        if (needsVote) {
          openClassicVote(roomId, st);
          await saveLudoRoomSnapshot(roomId, st);
          emitLudoState(io, roomId, st);
        } else {
          scheduleMatchmadeAutostart(roomId, crit);
        }
        incMetric('queueMatchesCreated');
        if (soloFallback1v1) incMetric('queueSoloFallbackMatches');
        void (async () => {
          const uids = batch.map((t) => String(t.uid || '').trim()).filter(Boolean);
          await Promise.all(uids.map((u) => setLudoQueueState(u, false)));
          await Promise.all(uids.map((u) => setLudoRoomContext(u, roomId, { playing: false })));
          await refreshLudoRoomContexts(io, uids);
        })();
        continue;
      }

      const fallbackToBot = plan.default.fallbackToBot;
      const roomId = uuidv4();
      const hostUid = batch[0].uid;
      const lobby = {
        hostUid,
        maxPlayers: crit.maxPlayers,
        members: batch.map((t) => ({ uid: t.uid, displayName: t.displayName || 'Player' })),
        fillBots: crit.fillBots || fallbackToBot,
        entryFee: crit.entryFee,
        turnTimerSec: crit.turnTimerSec,
        settings: crit.settings || {},
        createdAt: Date.now(),
        matchVariant: crit.matchVariant || 'DEFAULT',
        autofillAggressiveBots: false,
        prepaidMemberUids: batch.map((t) => String(t.uid)),
        chargeReceiptKeysByUid: Object.fromEntries(
          batch
            .filter((t) => t.uid && t.chargeReceiptKey)
            .map((t) => [String(t.uid), String(t.chargeReceiptKey)])
        ),
      };
      const st = buildLobbyState(roomId, lobby);
      if (!st.sockets) st.sockets = {};
      for (const t of batch) {
        const s = io.sockets.sockets.get(t.socketId);
        if (s) {
          s.join(roomId);
          st.sockets[t.uid] = s.id;
          markPresenceConnected(st, t.uid);
        }
      }
      roomStates.set(roomId, st);
      await saveLudoRoomSnapshot(roomId, st);
      emitLudoState(io, roomId, st);
      for (const t of batch) {
        io.sockets.sockets.get(t.socketId)?.emit('ludo:matchFound', {
          roomId,
          maxPlayers: crit.maxPlayers,
          fillBots: crit.fillBots || fallbackToBot,
          fallbackToBot,
          isHost: String(t.uid) === String(hostUid),
          matchVariant: crit.matchVariant || 'DEFAULT',
        });
      }
      incMetric('queueMatchesCreated');
      void (async () => {
        const uids = batch.map((t) => String(t.uid || '').trim()).filter(Boolean);
        await Promise.all(uids.map((u) => setLudoQueueState(u, false)));
        await Promise.all(uids.map((u) => setLudoRoomContext(u, roomId, { playing: false })));
        await refreshLudoRoomContexts(io, uids);
      })();
    }
  }

  function startQueueSweep() {
    if (queueSweepStarted) return;
    queueSweepStarted = true;
    setInterval(() => {
      void (async () => {
        const keys = await queueStore.activeBucketKeys();
        for (const bk of keys) {
          await tryFlushLudoQueueBucket(bk);
        }
      })();
    }, 1000);
  }

  return function ludoSocketHandler(socket) {
    const connUid = String(socket.user?.uid || '').trim();
    if (connUid) socketByUid.set(connUid, socket.id);

    socket.on('disconnect', async () => {
      if (connUid) socketByUid.delete(connUid);
      const removedQueueTickets = await queueStore.removeSocketFromLudoQueue(socket.id);
      await refundTickets(removedQueueTickets, 'queue_disconnect');
      const uid = String(socket.user?.uid || '').trim();
      if (uid) {
        void (async () => {
          await setLudoQueueState(uid, false);
          await refreshLudoRoomContexts(io, [uid]);
        })();
      }
      if (!uid) return;
      for (const [roomId, st] of roomStates.entries()) {
        if (!st?.sockets || String(st.sockets[uid] || '') !== String(socket.id)) continue;
        delete st.sockets[uid];
        markPresenceDisconnected(st, uid);
        st.lastUpdated = Date.now();
        st.logs.push(`${uid} disconnected. Rejoin within ${Math.floor(DISCONNECT_GRACE_MS / 1000)}s.`);
        io.to(roomId).emit('ludo:reconnectState', {
          roomId,
          uid,
          connected: false,
          graceUntil: Date.now() + DISCONNECT_GRACE_MS,
          ...nextEventMeta(st),
        });
        emitLudoState(io, roomId, st);
        void saveLudoRoomSnapshot(roomId, st);
      }
    });

    socket.on('ludo:queueJoin', async (payload = {}) => {
      const uid = socketUidOrError(socket);
      if (!uid) return;
      const entryFee = await resolveGameEntryFee(GAME_KEYS.LUDO);
      let maxPlayers = Math.min(4, Math.max(2, Number(payload.maxPlayers) || 4));
      const fillBots = Boolean(payload.fillBots);
      const turnTimerSec = Number(payload.turnTimerSec) || 30;
      const botFallbackMs = Math.max(0, Number(payload.botFallbackMs) || 0);
      const matchVariantRaw = String(payload.matchVariant || '').trim();
      const matchVariant =
        matchVariantRaw === LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE
          ? LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE
          : matchVariantRaw || 'DEFAULT';
      const waitWindowMs =
        matchVariant === LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE
          ? Math.min(120000, Math.max(1000, Number(payload.waitWindowMs) || 12000))
          : Math.max(0, Number(payload.waitWindowMs) || 0);
      if (matchVariant === LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE) {
        maxPlayers = 4;
      }
      const settings =
        payload.settings && typeof payload.settings === 'object' && !Array.isArray(payload.settings)
          ? payload.settings
          : {};
      const displayName = payload.displayName || 'Player';
      const criteria = {
        maxPlayers,
        fillBots,
        entryFee,
        turnTimerSec,
        botFallbackMs,
        settings,
        matchVariant,
        waitWindowMs,
      };
      const bucketKey = ludoQueueBucketKey(criteria);

      const removedByUid = await queueStore.removeUidFromAllLudoQueues(uid);
      const removedBySocket = await queueStore.removeSocketFromLudoQueue(socket.id);
      await refundTickets([...removedByUid, ...removedBySocket], 'queue_replaced');

      const chargeReceiptKey = makeReceiptKey('queue', uid, socket.id, Date.now());
      const d = await ludoWallet.tryDeductEntryFee(uid, entryFee, {
        receiptKey: chargeReceiptKey,
        source: 'queue_join',
        meta: { entryFee, socketId: socket.id, matchVariant },
      });
      if (!d.ok) {
        return socket.emit('ludo:error', { message: d.error, code: 'WALLET' });
      }

      const ticket = {
        socketId: socket.id,
        uid,
        displayName,
        criteria,
        joinedAt: Date.now(),
        chargeReceiptKey,
      };
      await queueStore.enqueueTicket(bucketKey, ticket);
      await tryFlushLudoQueueBucket(bucketKey);
      void (async () => {
        await setLudoQueueState(uid, true);
        await refreshLudoRoomContexts(io, [uid]);
      })();
    });

    socket.on('ludo:queueCancel', async () => {
      const quid = socketUidOrError(socket);
      const removed = await queueStore.removeSocketFromLudoQueue(socket.id);
      await refundTickets(removed, 'queue_cancelled');
      if (quid) {
        void (async () => {
          await setLudoQueueState(quid, false);
          await refreshLudoRoomContexts(io, [quid]);
        })();
      }
    });

    socket.on('ludo:inviteFriend', (payload) => void deliverLudoInvite(socket, payload));
    socket.on('ludo:sendInvite', (payload) => void deliverLudoInvite(socket, payload));
    socket.on('ludo:rejectInvite', (payload) => void handleInviteReject(socket, payload));
    socket.on('ludo:inviteRespond', (payload) => void handleInviteReject(socket, payload));

    socket.on('ludo:submitVote', async (payload = {}) => {
      const roomId = String(payload.roomId || '').trim();
      const uid = socketUidOrError(socket);
      const choice = String(payload.choice || '').trim();
      if (!roomId || !uid) return;
      if (!['ADD_BOTS', 'HUMANS_ONLY'].includes(choice)) {
        socket.emit('ludo:error', { message: 'Invalid vote option', code: 'BAD_VOTE' });
        return;
      }
      await withRoomJoinLock(roomId, async () => {
        const st = roomStates.get(roomId);
        if (!st || st.status !== 'LOBBY' || !st.lobby?.vote?.open) {
          socket.emit('ludo:error', { message: 'Vote is not open', code: 'VOTE_CLOSED' });
          return;
        }
        if (!st.lobby.members.some((m) => String(m.uid) === String(uid))) {
          socket.emit('ludo:error', { message: 'Not part of this vote', code: 'NOT_IN_VOTE' });
          return;
        }
        st.lobby.vote.votesByUid = {
          ...(st.lobby.vote.votesByUid || {}),
          [uid]: choice,
        };
        const memberUids = st.lobby.members.map((m) => String(m.uid));
        const { addBotsCount, humanOnlyCount } = computeVoteSummary(
          st.lobby.vote.votesByUid,
          memberUids
        );
        st.lobby.vote.addBotsCount = addBotsCount;
        st.lobby.vote.humanOnlyCount = humanOnlyCount;
        st.lastUpdated = Date.now();
        io.to(roomId).emit('ludo:voteUpdated', {
          roomId,
          vote: st.lobby.vote,
          members: st.lobby.members,
          ...nextEventMeta(st),
        });
        emitLudoState(io, roomId, st);
        await saveLudoRoomSnapshot(roomId, st);
        if (Object.keys(st.lobby.vote.votesByUid || {}).length >= memberUids.length) {
          await resolveClassicVote(roomId, 'all_votes_received');
        }
      });
    });

    socket.on('ludo:rejoinRoom', async (payload = {}) => {
      await handleLudoJoinOrReconnect(payload);
    });

    socket.on('ludo:createRoom', async (payload) => {
      const uid = socketUidOrError(socket);
      if (!uid) return;
      ludoWireDebug('ludo:createRoom ←', { uid, maxPlayers: payload?.maxPlayers });
      const maxPlayers = Math.min(4, Math.max(2, Number(payload.maxPlayers) || 4));
      const entryFee = await resolveGameEntryFee(GAME_KEYS.LUDO);
      const turnTimerSec = Number(payload.turnTimerSec) || 30;
      const fillBots = Boolean(payload.fillBots);
      const displayName = payload.displayName || 'Player';
      const roomId = uuidv4();
      const hostReceiptKey = makeReceiptKey('room_host', roomId, uid);
      const inviteOnly = Boolean(payload.inviteOnly ?? payload.isPrivate);

      const d = await ludoWallet.tryDeductEntryFee(uid, entryFee, {
        receiptKey: hostReceiptKey,
        source: 'create_room_host',
        meta: { roomId, entryFee },
      });
      if (!d.ok) {
        return socket.emit('ludo:error', { message: d.error, code: 'WALLET' });
      }

      const lobby = {
        hostUid: uid,
        maxPlayers,
        members: [{ uid, displayName }],
        fillBots,
        entryFee,
        turnTimerSec,
        settings: payload.settings || {},
        createdAt: Date.now(),
        chargeReceiptKeysByUid: { [uid]: hostReceiptKey },
        ...(inviteOnly ? { meta: { inviteOnly: true } } : {}),
      };

      const st = buildLobbyState(roomId, lobby);
      if (!st.sockets) st.sockets = {};
      st.sockets[uid] = socket.id;
      markPresenceConnected(st, uid);
      roomStates.set(roomId, st);
      socket.join(roomId);
      await saveLudoRoomSnapshot(roomId, st);

      ludoLog('Room created', { roomId, hostUid: uid, maxPlayers });
      socket.emit('ludo:roomCreated', { roomId, state: st });
      emitLudoState(io, roomId, st);
      void (async () => {
        await setLudoQueueState(uid, false);
        await setLudoRoomContext(uid, roomId, { playing: false });
        await refreshLudoRoomContexts(io, [uid]);
      })();
    });

    const handleLudoJoinOrReconnect = async (payload) => {
      const roomId = payload?.roomId;
      const uid = socketUidOrError(socket);
      if (!roomId || !uid) return;
      await withRoomJoinLock(roomId, async () => {
        const st = roomStates.get(roomId);
        ludoWireDebug('ludo:joinRoom (lobby/reconnect) ←', { uid, roomId, exists: Boolean(st) });
        if (!st) {
          socket.emit('ludo:error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
          return;
        }
        if (st.status === 'PLAYING') {
          const color = Object.keys(st.players).find((c) => st.players[c]?.id === uid);
          if (color) {
            socket.join(roomId);
            if (!st.sockets) st.sockets = {};
            st.sockets[uid] = socket.id;
            markPresenceConnected(st, uid);
            st.lastUpdated = Date.now();
            ludoLog('Player reconnected / re-seated (PLAYING)', { roomId, uid });
            socket.emit('ludo:reconnectState', {
              roomId,
              uid,
              connected: true,
              graceUntil: null,
              ...nextEventMeta(st),
            });
            emitLudoState(io, roomId, st);
            await saveLudoRoomSnapshot(roomId, st);
            checkBotTurn(roomId);
            void (async () => {
              await setLudoQueueState(uid, false);
              await setLudoRoomContext(uid, roomId, { playing: true });
              await refreshLudoRoomContexts(io, [uid]);
            })();
            return;
          }
          socket.emit('ludo:error', { message: 'Room is full', code: 'ROOM_FULL' });
          return;
        }

        if (st.status !== 'LOBBY' || !st.lobby) {
          socket.emit('ludo:error', { message: 'Room not available', code: 'ROOM_CLOSED' });
          return;
        }

        if (st.lobby.members.some((m) => m.uid === uid)) {
          socket.join(roomId);
          if (!st.sockets) st.sockets = {};
          st.sockets[uid] = socket.id;
          markPresenceConnected(st, uid);
          st.lastUpdated = Date.now();
          ludoLog('Player reconnected (LOBBY)', { roomId, uid });
          socket.emit('ludo:reconnectState', {
            roomId,
            uid,
            connected: true,
            graceUntil: null,
            ...nextEventMeta(st),
          });
          emitLudoState(io, roomId, st);
          await saveLudoRoomSnapshot(roomId, st);
          void (async () => {
            await setLudoQueueState(uid, false);
            await setLudoRoomContext(uid, roomId, { playing: false });
            await refreshLudoRoomContexts(io, [uid]);
          })();
          return;
        }

        if (st.lobby.members.length >= st.lobby.maxPlayers) {
          socket.emit('ludo:error', { message: 'Room is full', code: 'ROOM_FULL' });
          return;
        }

        const inviteOnly = Boolean(st.lobby.meta?.inviteOnly);
        const inviteIdJoin = String(payload?.inviteId || '').trim();
        if (inviteOnly && String(st.lobby.hostUid) !== String(uid)) {
          const inv = inviteIdJoin ? await inviteStore.get(inviteIdJoin) : null;
          if (!isInviteValidForJoin(inv, roomId, uid, st.lobby.hostUid)) {
            socket.emit('ludo:error', {
              message: 'You need a valid invite to join this room.',
              code: 'INVITE_REQUIRED',
            });
            return;
          }
        }

        if (!joinChargeReceiptByRoom.has(roomId)) {
          joinChargeReceiptByRoom.set(roomId, new Set());
        }
        const chargeReceipt = joinChargeReceiptByRoom.get(roomId);
        const chargeKey = `${roomId}:${uid}`;
        const prepaid =
          Array.isArray(st.lobby.prepaidMemberUids) &&
          st.lobby.prepaidMemberUids.some((id) => String(id) === String(uid));
        const needsCharge = uid !== st.lobby.hostUid && !prepaid && !chargeReceipt.has(chargeKey);
        if (needsCharge) {
          const guestReceiptKey = makeReceiptKey('room_guest', roomId, uid);
          const d = await ludoWallet.tryDeductEntryFee(uid, st.lobby.entryFee, {
            receiptKey: guestReceiptKey,
            source: 'join_lobby_guest',
            meta: { roomId, entryFee: st.lobby.entryFee },
          });
          if (!d.ok) {
            incMetric('walletJoinChargeFailures');
            socket.emit('ludo:error', { message: d.error, code: 'WALLET' });
            return;
          }
          chargeReceipt.add(chargeKey);
          if (!st.lobby.chargeReceiptKeysByUid) st.lobby.chargeReceiptKeysByUid = {};
          st.lobby.chargeReceiptKeysByUid[uid] = guestReceiptKey;
        }

        st.lobby.members.push({
          uid,
          displayName: payload.displayName || 'Player',
        });
        st.logs.push(`${payload.displayName || uid} joined the lobby`);
        if (!st.sockets) st.sockets = {};
        st.sockets[uid] = socket.id;
        markPresenceConnected(st, uid);
        socket.join(roomId);
        st.lastUpdated = Date.now();
        if (inviteIdJoin) {
          inviteStore.cancelExpiry(inviteIdJoin);
          await inviteStore.del(inviteIdJoin);
        }
        await saveLudoRoomSnapshot(roomId, st);

        io.to(roomId).emit('ludo:playerJoined', {
          roomId,
          members: st.lobby.members,
        });
        ludoLog('Player joined lobby', { roomId, uid });
        emitLudoState(io, roomId, st);
        void (async () => {
          await setLudoQueueState(uid, false);
          await setLudoRoomContext(uid, roomId, { playing: false });
          await refreshLudoRoomContexts(io, [uid]);
        })();
        const fromSid = socketByUid.get(String(st.lobby.hostUid));
        if (inviteOnly && inviteIdJoin && fromSid) {
          io.sockets.sockets.get(fromSid)?.emit('ludo:inviteResult', {
            inviteId: inviteIdJoin,
            accepted: true,
            roomId,
            targetUid: uid,
          });
        }
      });
    };

    socket.on('ludo:leaveRoom', async (payload) => {
      const roomId = payload?.roomId;
      const uid = socketUidOrError(socket);
      if (!roomId || !uid) return;
      const st = roomStates.get(roomId);
      if (!st) return;

      if (st.status === 'LOBBY' && st.lobby) {
        if (st.lobby.hostUid === uid) {
          const memberUids = (st.lobby.members || [])
            .map((m) => String(m.uid || '').trim())
            .filter(Boolean);
          cancelMatchmadeAutostart(roomId);
          await refundLobbyReceipts(
            st,
            (st.lobby.members || []).map((m) => String(m.uid)),
            'lobby_closed_by_host'
          );
          joinChargeReceiptByRoom.delete(roomId);
          roomStates.delete(roomId);
          void deleteLudoRoomFirestore(roomId);
          void inviteStore.delAllForRoom(roomId);
          void (async () => {
            await Promise.all(memberUids.map((u) => clearLudoRoomContext(u)));
            await refreshLudoRoomContexts(io, memberUids);
          })();
          io.to(roomId).emit('ludo:error', {
            message: 'Host closed the room',
            code: 'HOST_LEFT',
          });
          socket.leave(roomId);
          return;
        }
        await refundLobbyReceipts(st, [uid], 'left_lobby_before_start');
        joinChargeReceiptByRoom.get(roomId)?.delete(`${roomId}:${uid}`);
        st.lobby.members = st.lobby.members.filter((m) => m.uid !== uid);
        if (st.sockets) delete st.sockets[uid];
        st.lastUpdated = Date.now();
        emitLudoState(io, roomId, st);
        await saveLudoRoomSnapshot(roomId, st);
        void (async () => {
          await clearLudoRoomContext(uid);
          await refreshLudoRoomContexts(io, [uid]);
        })();
      }
      socket.leave(roomId);
    });

    socket.on('ludo:startGame', async (payload) => {
      const roomId = payload?.roomId;
      const uid = socketUidOrError(socket);
      if (!roomId || !uid) return;
      const r = await executeLudoStartGame(roomId, uid);
      if (!r.ok) {
        socket.emit('ludo:error', { message: r.message, code: r.code });
      }
    });

    socket.on('ludo:joinRoom', async (payload = {}) => {
      const { roomId, config } = payload;
      const uid = socketUidOrError(socket);
      if (!uid || !roomId) return;

      const isLegacyConfig =
        config &&
        typeof config === 'object' &&
        config.players &&
        typeof config.players === 'object' &&
        !Array.isArray(config.players);

      let legacyCreate = isLegacyConfig;
      if (roomStates.has(roomId) && isLegacyConfig) {
        const existing = roomStates.get(roomId);
        if (existing.status === 'LOBBY') {
          return socket.emit('ludo:error', {
            message: 'This id is an online lobby — join with display name only (no config).',
            code: 'USE_ONLINE_JOIN',
          });
        }
        legacyCreate = false;
      }

      ludoWireDebug('ludo:joinRoom ←', { roomId, uid, legacyCreate });

      if (legacyCreate) {
        await handleLegacyLudoJoin(socket, roomId, config);
        return;
      }

      await handleLudoJoinOrReconnect(payload);
    });

    socket.on('ludo:rollDice', (data) => {
      registerRollDice(socket, data?.roomId);
    });

    socket.on('ludo:moveToken', async (data) => {
      await registerMoveToken(socket, data?.roomId, data?.tokenId);
    });
  };
}
