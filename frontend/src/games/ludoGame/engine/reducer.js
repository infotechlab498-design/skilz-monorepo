import { GameStatus, PlayerType, PlayerColor, Difficulty } from '../types';
import { getValidMoves, getNextTurn, checkWinner, checkCapture } from './gameLogic';
import { evaluateSkill, calculateNewDifficulty } from './adaptiveEngine';

/** Hydrated server state may use `{ color, rank, playerId }[]` or legacy `PlayerColor[]`. */
export function isWinnerColor(winners, color) {
  if (!Array.isArray(winners) || !color) return false;
  return winners.some((w) => w === color || (w && w.color === color));
}

export const ActionTypes = {
  START_GAME: 'START_GAME',
  START_ROLL: 'START_ROLL',
  SET_ROLL: 'SET_ROLL',
  MOVE_TOKEN: 'MOVE_TOKEN',
  PASS_TURN: 'PASS_TURN',
  RESET_GAME: 'RESET_GAME',
  RESET_TO_INITIAL: 'RESET_TO_INITIAL',
  ADD_LOG: 'ADD_LOG',
  TICK_TIMER: 'TICK_TIMER',
  HYDRATE_GAME: 'HYDRATE_GAME',
  /** Server `ludo:diceRolled` — keeps UI in sync before/after full `ludo:gameState`. */
  LUDO_DICE_ROLLED: 'LUDO_DICE_ROLLED',
};

const INITIAL_TOKENS = (color) => [
  { id: 1, color, position: 0 },
  { id: 2, color, position: 0 },
  { id: 3, color, position: 0 },
  { id: 4, color, position: 0 },
];

export const initialGameState = {
  gameId: 'local-game-' + Date.now(),
  status: GameStatus.LOBBY,
  mode: null,
  players: {
    [PlayerColor.RED]: null,
    [PlayerColor.BLUE]: null,
    [PlayerColor.YELLOW]: null,
    [PlayerColor.GREEN]: null,
  },
  tokens: {
    [PlayerColor.RED]: INITIAL_TOKENS(PlayerColor.RED),
    [PlayerColor.BLUE]: INITIAL_TOKENS(PlayerColor.BLUE),
    [PlayerColor.YELLOW]: INITIAL_TOKENS(PlayerColor.YELLOW),
    [PlayerColor.GREEN]: INITIAL_TOKENS(PlayerColor.GREEN),
  },
  currentTurn: PlayerColor.RED,
  diceValue: null,
  rollByColor: {},
  consecutiveSixes: 0,
  turnSequence: [],
  currentPlayerIndex: 0,
  turnLocked: false,
  winners: [],
  logs: [{ id: Date.now(), msg: 'Welcome to Ludo Master!' }],
  isRolling: false,
  waitingForMove: false,
  timeLeft: 30,
  settings: {
    turnTimerSec: 30,
    exactRollToHome: true,
    safeStars: true
  },
  memory: {}, // For AI context
  playerPerformanceHistory: [], // Rolling list of performance scores (0 to 1) 
  botDifficulties: {} // Dynamic skill levels for bots
};

const getTurnTimerSec = (state) =>
  state?.settings?.turnTimerSec ?? initialGameState.settings.turnTimerSec;

/** Server/Firebase payloads may omit settings or use string logs — normalize for UI + reducer safety */
const normalizeHydratedLogs = (logs) => {
  if (!Array.isArray(logs)) return initialGameState.logs;
  return logs.map((entry, i) => {
    if (typeof entry === 'string') return { id: `log-str-${i}-${entry.slice(0, 12)}`, msg: entry };
    if (entry && typeof entry === 'object' && entry.msg != null) {
      return { ...entry, id: entry.id ?? `log-${i}-${String(entry.msg).slice(0, 8)}` };
    }
    return { id: `log-${i}`, msg: String(entry) };
  });
};

/** Wire uses 1–6 or null; 0/-1/local leftovers would block rolls — treat as no active die. */
function normalizeHydratedDiceValue(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 6) return null;
  return n;
}

/** Ensures each token has `color` so client MoveValidator matches server paths after hydrate. */
function normalizeHydratedTokens(tokens) {
  if (!tokens || typeof tokens !== 'object') return tokens;
  const out = { ...tokens };
  for (const color of Object.keys(out)) {
    const arr = out[color];
    if (!Array.isArray(arr)) continue;
    out[color] = arr.map((t) =>
      t && typeof t === 'object' ? { ...t, color: t.color || color } : t
    );
  }
  return out;
}

const addLog = (state, msg) => {
  const newLog = { id: Date.now() + Math.random(), msg };
  const prev = Array.isArray(state.logs) ? state.logs : [];
  return { ...state, logs: [newLog, ...prev.slice(0, 9)] };
};

export const ludoReducer = (state, action) => {
  switch (action.type) {
    case ActionTypes.START_GAME: {
      const { config } = action.payload;
      const colors = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.YELLOW, PlayerColor.GREEN];
      const firstColor = colors.find(c => config.players[c].type !== PlayerType.EMPTY) || PlayerColor.RED;
      
      const newState = {
        ...state,
        status: GameStatus.PLAYING,
        mode: config.mode,
        players: Object.keys(config.players).reduce((acc, color) => {
          const p = config.players[color];
          if (p.type !== PlayerType.EMPTY) {
            acc[color] = {
              ...p,
              xp: 0,
              coins: p.coins || 100 // Default or from config
            };
          } else {
            acc[color] = p;
          }
          return acc;
        }, {}),
        settings: config.settings || state.settings,
        currentTurn: firstColor,
        gameId: config.gameId || ('local-game-' + Date.now()),
        tokens: initialGameState.tokens, 
        winners: [],
        diceValue: null,
        rollByColor: {},
        isRolling: false,
        waitingForMove: false,
        consecutiveSixes: 0,
        timeLeft: config.settings?.turnTimerSec || 30,
        memory: {},
        playerPerformanceHistory: [],
        botDifficulties: Object.keys(config.players).reduce((acc, color) => {
           if (config.players[color].type === PlayerType.BOT) {
             acc[color] = config.players[color].difficulty || Difficulty.MEDIUM;
           }
           return acc;
        }, {})
      };

      return addLog(newState, 'Match Started! Entry fee deducted.');
    }

    case ActionTypes.START_ROLL:
      if (state.isRolling || state.waitingForMove || state.status !== GameStatus.PLAYING) return state;
      return { ...state, isRolling: true };

    case ActionTypes.SET_ROLL: {
      const roll = action.payload.roll;
      const newConsecutive = roll === 6 ? state.consecutiveSixes + 1 : 0;
      
      let nextState = { ...state };
      
      if (newConsecutive === 3) {
        nextState = addLog(nextState, `${state.currentTurn} rolled three 6s! Turn passed.`);
        return { ...nextState, isRolling: false, diceValue: 0, consecutiveSixes: 0, waitingForMove: false };
      }

      nextState = { ...nextState, diceValue: roll, consecutiveSixes: newConsecutive };
      const possibleMoves = getValidMoves(nextState);

      if (possibleMoves.length === 0) {
        nextState = addLog(nextState, `${state.currentTurn} rolled a ${roll}. No moves.`);
        return { ...nextState, isRolling: false, diceValue: -1, waitingForMove: false };
      }

      return { ...nextState, isRolling: false, waitingForMove: true };
    }

    case ActionTypes.MOVE_TOKEN: {
      const { tokenId, validMoves } = action.payload;
      const move = validMoves.find(m => m.tokenId === tokenId);
      if (!move) return state;

      const currentPlayerTokens = [...state.tokens[state.currentTurn]];
      const tokenIdx = currentPlayerTokens.findIndex(t => t.id === tokenId);
      currentPlayerTokens[tokenIdx] = { ...currentPlayerTokens[tokenIdx], position: move.targetPosition };

      const newTokensMap = { ...state.tokens, [state.currentTurn]: currentPlayerTokens };
      let nextState = addLog(state, `${state.currentTurn} moved token ${tokenId} to ${move.targetPosition}`);
      let bonusTurn = state.diceValue === 6;
      let newMemory = { ...state.memory };

      const victim = checkCapture(state.currentTurn, move.targetPosition, state.tokens);
      if (victim) {
        const victimTokens = [...state.tokens[victim.color]];
        const victimIdx = victimTokens.findIndex(t => t.id === victim.id);
        victimTokens[victimIdx] = { ...victimTokens[victimIdx], position: 0 }; // Send back to yard
        newTokensMap[victim.color] = victimTokens;
        nextState = addLog(nextState, `${state.currentTurn} captured ${victim.color}!`);
        bonusTurn = true;
        
        // AI Memory: Record who captured this victim
        newMemory[victim.color] = { lastCapturedBy: state.currentTurn, timestamp: Date.now() };
      }

      let newWinners = [...state.winners];
      let newStatus = state.status;
      const updatedPlayers = { ...state.players };
      
      if (checkWinner(currentPlayerTokens)) {
        if (!isWinnerColor(newWinners, state.currentTurn)) {
          newWinners.push(state.currentTurn);
          nextState = addLog(nextState, `${state.currentTurn} has finished!`);

          // Award Fixed Coin Prizes based on rank
          const rank = newWinners.length;
          let prize = 0;
          if (rank === 1) prize = 20;
          else if (rank === 2) prize = 15;
          else if (rank === 3) prize = 10;
          else if (rank === 4) prize = 5;

          if (updatedPlayers[state.currentTurn]) {
            updatedPlayers[state.currentTurn] = {
              ...updatedPlayers[state.currentTurn],
              coins: (updatedPlayers[state.currentTurn].coins || 0) + prize
            };
          }

          const activePlayersCount = Object.values(state.players).filter(p => p && p.type !== PlayerType.EMPTY).length;
          if (newWinners.length >= activePlayersCount - 1) {
            newStatus = GameStatus.FINISHED;
          }
        }
      }

      // XP Calculation based on best turns
      let xpEarned = 2; // Base turn XP
      if (move.type === 'CAPTURE') xpEarned = 15;
      else if (move.type === 'ENTER') xpEarned = 5;
      else if (move.type === 'FINISH') xpEarned = 20;

      if (updatedPlayers[state.currentTurn]) {
        updatedPlayers[state.currentTurn] = {
          ...updatedPlayers[state.currentTurn],
          xp: (updatedPlayers[state.currentTurn].xp || 0) + xpEarned
        };
      }

      // --- AI ADAPTATION LOGIC ---
      let nextPerfHistory = [...state.playerPerformanceHistory];
      let nextBotDifficulties = { ...state.botDifficulties };

      if (state.players[state.currentTurn]?.type === PlayerType.HUMAN) {
        const perfScore = evaluateSkill(tokenId, validMoves, state);
        nextPerfHistory.push(perfScore);
        if (nextPerfHistory.length > 5) nextPerfHistory.shift(); // Keep last 5 turns

        // Update each bot's difficulty to match player skill
        Object.keys(nextBotDifficulties).forEach(botColor => {
          nextBotDifficulties[botColor] = calculateNewDifficulty(nextBotDifficulties[botColor], nextPerfHistory);
        });
      }

      return {
        ...nextState,
        tokens: newTokensMap,
        memory: newMemory,
        playerPerformanceHistory: nextPerfHistory,
        botDifficulties: nextBotDifficulties,
        winners: newWinners,
        players: updatedPlayers,
        status: newStatus,
        waitingForMove: false,
        // Always clear consumed die so bonus turns can roll again.
        diceValue: null,
        timeLeft: getTurnTimerSec(state)
      };
    }

    case ActionTypes.TICK_TIMER:
      return { ...state, timeLeft: Math.max(0, state.timeLeft - 1) };

    case ActionTypes.PASS_TURN: {
      let nextColor = getNextTurn(state.currentTurn);
      let count = 0;
      while (
        count < 4 &&
        (!state.players[nextColor] ||
          state.players[nextColor]?.type === PlayerType.EMPTY ||
          isWinnerColor(state.winners, nextColor))
      ) {
        nextColor = getNextTurn(nextColor);
        count++;
      }
      return {
        ...state,
        currentTurn: nextColor,
        diceValue: null,
        consecutiveSixes: 0,
        waitingForMove: false,
        timeLeft: getTurnTimerSec(state)
      };
    }

    case ActionTypes.RESET_GAME:
      return {
        ...state,
        status: GameStatus.LOBBY,
        winners: [],
        diceValue: null,
        waitingForMove: false,
        memory: {},
        timeLeft: getTurnTimerSec(state),
        settings: { ...initialGameState.settings, ...(state.settings || {}) }
      };

    case ActionTypes.RESET_TO_INITIAL: {
      const next = structuredClone(initialGameState);
      next.gameId = 'local-game-' + Date.now();
      return next;
    }

    case ActionTypes.ADD_LOG:
      return addLog(state, action.payload.msg);

    case ActionTypes.LUDO_DICE_ROLLED: {
      const { phase, diceValue, currentTurn } = action.payload || {};
      if (phase === 'start') {
        return { ...state, isRolling: true };
      }
      if (phase === 'resolved') {
        const v = Number(diceValue);
        const next = {
          ...state,
          isRolling: false,
          waitingForMove: Number.isFinite(v) && v >= 1 && v <= 6,
          diceValue: Number.isFinite(v) && v >= 1 && v <= 6 ? v : state.diceValue,
        };
        if (currentTurn && state.currentTurn !== currentTurn) {
          next.currentTurn = currentTurn;
        }
        return next;
      }
      return state;
    }

    case ActionTypes.HYDRATE_GAME: {
      const incomingRaw = action.payload?.state;
      if (!incomingRaw || typeof incomingRaw !== 'object') return state;
      const { sockets: _omitSockets, ...incoming } = incomingRaw;
      const incomingRev = Number(incoming.revision) || 0;
      const currentRev = Number(state.revision) || 0;
      if (
        incoming.gameId &&
        state.gameId &&
        String(incoming.gameId) === String(state.gameId) &&
        incomingRev > 0 &&
        currentRev > 0 &&
        incomingRev < currentRev
      ) {
        return state;
      }
      const diceValue = normalizeHydratedDiceValue(incoming.diceValue);
      const tokens = normalizeHydratedTokens(incoming.tokens) ?? incoming.tokens;
      const stRaw = String(incoming.status || '').toLowerCase();
      const statusNorm =
        incoming.status === GameStatus.PLAYING ||
        incoming.status === GameStatus.FINISHED ||
        incoming.status === GameStatus.LOBBY
          ? incoming.status
          : stRaw === 'playing'
            ? GameStatus.PLAYING
            : stRaw === 'finished'
              ? GameStatus.FINISHED
              : GameStatus.LOBBY;
      return {
        ...incoming,
        tokens: tokens ?? state.tokens,
        diceValue,
        rollByColor:
          incoming.rollByColor && typeof incoming.rollByColor === 'object'
            ? incoming.rollByColor
            : state.rollByColor || {},
        status: statusNorm,
        settings: { ...initialGameState.settings, ...(incoming.settings || {}) },
        logs: normalizeHydratedLogs(incoming.logs),
        isRolling: Boolean(incoming.isRolling),
        waitingForMove: Boolean(incoming.waitingForMove),
        consecutiveSixes: Number(incoming.consecutiveSixes) || 0,
        turnSequence: Array.isArray(incoming.turnSequence) ? incoming.turnSequence : [],
        currentPlayerIndex:
          incoming.currentPlayerIndex !== undefined ? incoming.currentPlayerIndex : 0,
        turnLocked: Boolean(incoming.turnLocked),
        revision: incomingRev,
      };
    }

    default:
      return state;
  }
};
