import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase/config.js';
import { getValidMoves } from '../engine/gameLogic.js';
import { ludoReducer, ActionTypes, initialGameState } from '../engine/reducer.js';
import { GameStatus, PlayerColor, PlayerType } from '../types.js';

const COLORS = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.YELLOW, PlayerColor.GREEN];
const FIRESTORE_GAMEPLAY_ENABLED =
  import.meta.env.VITE_ENABLE_FIRESTORE_LUDO === '1';

function isTimestampLike(v) {
  return v && typeof v === 'object' && typeof v.toMillis === 'function';
}

function uidMatchesSeat(playerId, actorUid) {
  if (!playerId || !actorUid) return false;
  return String(playerId) === String(actorUid);
}

function toPlayerArray(playersMap = {}) {
  return COLORS.map((color) => {
    const p = playersMap[color];
    if (!p || p.type === PlayerType.EMPTY) return null;
    return {
      id: p.id || '',
      name: p.name || color,
      color,
      type: p.type || PlayerType.HUMAN,
      difficulty: p.difficulty || null,
      positionData: [],
    };
  }).filter(Boolean);
}

function toParticipantMap(playersMap = {}) {
  const out = {};
  COLORS.forEach((color) => {
    const p = playersMap[color];
    const uid = String(p?.id || '').trim();
    if (p && p.type === PlayerType.HUMAN && uid) {
      out[uid] = true;
    }
  });
  return out;
}

function toBoardState(tokens = {}) {
  const out = {};
  COLORS.forEach((color) => {
    out[color] = Array.isArray(tokens[color]) ? tokens[color].map((t) => Number(t.position) || 0) : [0, 0, 0, 0];
  });
  return out;
}

function fromBoardState(boardState = {}) {
  const out = {};
  COLORS.forEach((color) => {
    const arr = Array.isArray(boardState[color]) ? boardState[color] : [0, 0, 0, 0];
    out[color] = arr.map((position, idx) => ({
      id: idx + 1,
      color,
      position: Number(position) || 0,
    }));
  });
  return out;
}

export function toFirestoreGameDoc(state, lastAction = 'hydrated') {
  return {
    gameId: state.gameId,
    players: toPlayerArray(state.players),
    playerSeats: state.players,
    playersMap: toParticipantMap(state.players),
    boardState: toBoardState(state.tokens),
    tokens: state.tokens,
    diceValue: state.diceValue ?? null,
    rollByColor: state.rollByColor || {},
    currentTurn: state.currentTurn || PlayerColor.RED,
    status: String(state.status || GameStatus.LOBBY).toLowerCase(),
    lastAction,
    revision: Number(state.revision || 0),
    winners: Array.isArray(state.winners) ? state.winners : [],
    settings: state.settings || initialGameState.settings,
    turnLocked: Boolean(state.turnLocked),
    waitingForMove: Boolean(state.waitingForMove),
    isRolling: Boolean(state.isRolling),
    consecutiveSixes: Number(state.consecutiveSixes || 0),
    logs: Array.isArray(state.logs) ? state.logs : [],
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  };
}

export function toReducerState(gameDoc) {
  const boardTokens = gameDoc?.tokens || fromBoardState(gameDoc?.boardState || {});
  const statusRaw = String(gameDoc?.status || 'waiting').toLowerCase();
  const status =
    statusRaw === 'playing'
      ? GameStatus.PLAYING
      : statusRaw === 'finished'
        ? GameStatus.FINISHED
        : GameStatus.LOBBY;
  return {
    ...initialGameState,
    ...gameDoc,
    status,
    tokens: boardTokens,
    players: gameDoc?.playerSeats || initialGameState.players,
    gameId: gameDoc?.gameId || initialGameState.gameId,
    revision: Number(gameDoc?.revision || 0),
    updatedAt: isTimestampLike(gameDoc?.updatedAt) ? gameDoc.updatedAt.toMillis() : gameDoc?.updatedAtMs || Date.now(),
  };
}

/**
 * Normalize Socket.IO `ludo:gameState` payloads from `ludoRealtime.js` for client reducer hydrate.
 * Strips server-only fields (e.g. `sockets`) and aligns enums with Firestore `toReducerState`.
 */
export function mapServerLudoStateToClient(serverState) {
  if (!serverState || typeof serverState !== 'object') return null;
  const { sockets: _ignoredSockets, ...rest } = serverState;
  const statusRaw = String(rest.status || 'lobby').toLowerCase();
  const status =
    statusRaw === 'playing'
      ? GameStatus.PLAYING
      : statusRaw === 'finished'
        ? GameStatus.FINISHED
        : GameStatus.LOBBY;
  const boardTokens = rest.tokens || fromBoardState(rest.boardState || {});
  const revision =
    Number(rest.revision) > 0
      ? Number(rest.revision)
      : Number(rest.lastUpdated) > 0
        ? Number(rest.lastUpdated)
        : 0;
  const gameId = rest.gameId || rest.meta?.roomId || initialGameState.gameId;
  return {
    ...initialGameState,
    ...rest,
    status,
    tokens: boardTokens,
    players: rest.players && typeof rest.players === 'object' ? rest.players : initialGameState.players,
    gameId,
    revision,
    settings: { ...initialGameState.settings, ...(rest.settings || {}) },
    rollByColor: rest.rollByColor && typeof rest.rollByColor === 'object' ? rest.rollByColor : {},
  };
}

function assertCanAct(state, actorUid) {
  const p = state.players?.[state.currentTurn];
  if (!p || p.type === PlayerType.EMPTY) return false;
  if (p.type === PlayerType.BOT) return true;
  return uidMatchesSeat(p.id, actorUid);
}

export async function createOrJoinGame({ gameId, state, actorUid }) {
  if (!FIRESTORE_GAMEPLAY_ENABLED) {
    throw new Error('FIRESTORE_GAMEPLAY_DISABLED');
  }
  if (!gameId || !state) return;
  if (!actorUid) throw new Error('AUTH_REQUIRED');
  const gameRef = doc(db, 'games', String(gameId));
  try {
    const snap = await getDoc(gameRef);
    if (snap.exists()) return;
    const docData = toFirestoreGameDoc(
      {
        ...state,
        revision: 1,
        gameId,
        lastActorUid: actorUid || '',
      },
      'gameStarted'
    );
    await setDoc(gameRef, docData, { merge: false });
  } catch (e) {
    throw e;
  }
}

export function subscribeGame(gameId, onState, onError) {
  if (!FIRESTORE_GAMEPLAY_ENABLED) return () => {};
  const gameRef = doc(db, 'games', String(gameId));
  return onSnapshot(
    gameRef,
    (snap) => {
      if (!snap.exists()) return;
      const state = toReducerState(snap.data());
      onState?.(state);
    },
    (err) => onError?.(err)
  );
}

export async function rollDiceTx({ gameId, actorUid }) {
  if (!FIRESTORE_GAMEPLAY_ENABLED) {
    throw new Error('FIRESTORE_GAMEPLAY_DISABLED');
  }
  const gameRef = doc(db, 'games', String(gameId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('GAME_NOT_FOUND');
    const current = toReducerState(snap.data());
    if (current.status !== GameStatus.PLAYING) throw new Error('NOT_PLAYING');
    if (!assertCanAct(current, actorUid)) throw new Error('NOT_YOUR_TURN');
    if (current.isRolling || current.waitingForMove) throw new Error('ROLL_BLOCKED');

    const roll = Math.floor(Math.random() * 6) + 1;
    let next = ludoReducer(current, { type: ActionTypes.START_ROLL });
    next = ludoReducer(next, { type: ActionTypes.SET_ROLL, payload: { roll } });
    next = {
      ...next,
      rollByColor: {
        ...(current.rollByColor || {}),
        [current.currentTurn]: roll,
      },
    };

    if (!next.waitingForMove) {
      next = ludoReducer(next, { type: ActionTypes.PASS_TURN });
    }

    const revision = Number(current.revision || 0) + 1;
    tx.set(
      gameRef,
      toFirestoreGameDoc(
        {
          ...next,
          gameId,
          revision,
        },
        'diceRolled'
      ),
      { merge: true }
    );

  });
}

export async function moveTokenTx({ gameId, tokenId, actorUid }) {
  if (!FIRESTORE_GAMEPLAY_ENABLED) {
    throw new Error('FIRESTORE_GAMEPLAY_DISABLED');
  }
  const gameRef = doc(db, 'games', String(gameId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('GAME_NOT_FOUND');
    const current = toReducerState(snap.data());
    if (current.status !== GameStatus.PLAYING) throw new Error('NOT_PLAYING');
    if (!assertCanAct(current, actorUid)) throw new Error('NOT_YOUR_TURN');
    if (!current.waitingForMove) throw new Error('NO_PENDING_MOVE');

    const validMoves = getValidMoves(current);
    const chosen = validMoves.find((m) => Number(m.tokenId) === Number(tokenId));
    if (!chosen) throw new Error('INVALID_MOVE');
    const getsBonusTurn = Number(current.diceValue) === 6 || chosen.type === 'CAPTURE';

    let next = ludoReducer(current, {
      type: ActionTypes.MOVE_TOKEN,
      payload: { tokenId: Number(tokenId), validMoves },
    });
    if (next.status !== GameStatus.FINISHED && !getsBonusTurn) {
      next = ludoReducer(next, { type: ActionTypes.PASS_TURN });
    } else {
      next = { ...next, timeLeft: next.settings?.turnTimerSec || 30 };
    }

    const revision = Number(current.revision || 0) + 1;
    tx.set(
      gameRef,
      toFirestoreGameDoc(
        {
          ...next,
          gameId,
          revision,
        },
        next.status === GameStatus.FINISHED ? 'gameEnded' : 'tokenMoved'
      ),
      { merge: true }
    );

  });
}

export async function finishGameTx({ gameId, actorUid }) {
  if (!FIRESTORE_GAMEPLAY_ENABLED) return;
  const gameRef = doc(db, 'games', String(gameId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error('GAME_NOT_FOUND');
    const current = toReducerState(snap.data());
    const revision = Number(current.revision || 0) + 1;
    tx.set(
      gameRef,
      toFirestoreGameDoc(
        {
          ...current,
          status: GameStatus.FINISHED,
          revision,
          lastActorUid: actorUid || '',
        },
        'gameEnded'
      ),
      { merge: true }
    );
  });
}
