import { useReducer, useEffect, useCallback, useMemo, useRef } from 'react';
import { GameStatus } from '../types';
import { getValidMoves } from '../engine/gameLogic';
import { ludoReducer, initialGameState, ActionTypes } from '../engine/reducer';
import { sessionService } from '../../../services/sessionService';
import { auth } from '../../../firebase/config.js';
import { mapServerLudoStateToClient } from '../services/gameService.js';
import { socketService } from '../../../services/socketService';

function hasPendingDieFace(diceValue) {
  return Number.isFinite(diceValue) && diceValue >= 1 && diceValue <= 6;
}

/**
 * @param {{ socketRoomId?: string | null }} [options]
 */
export const useLudoGame = (options = {}) => {
  const socketRoomId = options.socketRoomId ?? null;

  const [state, dispatch] = useReducer(ludoReducer, initialGameState);
  const stateRef = useRef(state);
  const actorUidRef = useRef(null);
  const socketRoomIdRef = useRef(socketRoomId);
  const lastServerRevisionRef = useRef(0);
  const seenEventIdsRef = useRef(new Set());

  useEffect(() => {
    stateRef.current = state;
    socketRoomIdRef.current = socketRoomId;
    lastServerRevisionRef.current = Math.max(
      lastServerRevisionRef.current,
      Number(state.revision || 0)
    );
  }, [state, socketRoomId]);

  useEffect(() => {
    actorUidRef.current = auth.currentUser?.uid || sessionService.getUserId() || null;
    const unsub = auth.onAuthStateChanged((u) => {
      actorUidRef.current = u?.uid || sessionService.getUserId() || null;
    });
    return () => unsub();
  }, []);

  const validMoves = useMemo(() => getValidMoves(state), [state]);

  useEffect(() => {
    if (!socketRoomId) return;
    let cancelled = false;
    const rid = String(socketRoomId);
    seenEventIdsRef.current.clear();

    const shouldDropEvent = (payload = {}) => {
      const eventId = String(payload.eventId || '');
      if (eventId) {
        if (seenEventIdsRef.current.has(eventId)) return true;
        seenEventIdsRef.current.add(eventId);
      }
      const rev = Number(payload.serverRevision || payload.revision || 0);
      if (rev > 0 && rev < lastServerRevisionRef.current) return true;
      if (rev > 0) lastServerRevisionRef.current = Math.max(lastServerRevisionRef.current, rev);
      return false;
    };

    const onGameState = (payload) => {
      if (cancelled || !payload || typeof payload !== 'object') return;
      if (shouldDropEvent(payload)) return;
      const gid = String(payload.gameId || payload.meta?.roomId || '');
      if (gid !== rid) return;
      const mapped = mapServerLudoStateToClient(payload);
      if (mapped) {
        // #region agent log
        fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H2',location:'frontend/src/games/ludoGame/hooks/useLudoGame.js:onGameState',message:'Hydrating gameState from server',data:{currentTurn:String(mapped.currentTurn||''),currentPlayerIndex:Number(mapped.currentPlayerIndex||0),waitingForMove:Boolean(mapped.waitingForMove),isRolling:Boolean(mapped.isRolling),serverRevision:Number(payload.serverRevision||payload.revision||0)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        dispatch({ type: ActionTypes.HYDRATE_GAME, payload: { state: mapped } });
        sessionService.saveGameProgress(rid, mapped);
      }
    };

    const onPlayerJoined = (payload) => {
      if (cancelled || !payload || String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      const cur = stateRef.current;
      if (cur.status !== GameStatus.LOBBY || !cur.lobby) return;
      const members = payload.members;
      if (!Array.isArray(members)) return;
      dispatch({
        type: ActionTypes.HYDRATE_GAME,
        payload: {
          state: {
            ...cur,
            lobby: { ...cur.lobby, members },
          },
        },
      });
    };

    const onGameEnded = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      const mapped = mapServerLudoStateToClient(payload.state);
      if (mapped) dispatch({ type: ActionTypes.HYDRATE_GAME, payload: { state: mapped } });
    };
    const onDiceRolled = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      dispatch({ type: ActionTypes.LUDO_DICE_ROLLED, payload });
    };
    const onTurnComplete = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      // #region agent log
      fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H3',location:'frontend/src/games/ludoGame/hooks/useLudoGame.js:onTurnComplete',message:'Received turnComplete event',data:{currentTurn:String(payload.currentTurn||''),reason:String(payload.reason||''),serverRevision:Number(payload.serverRevision||payload.revision||0)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const reason = payload.reason ? `Turn complete: ${payload.reason}` : 'Turn complete';
      dispatch({ type: ActionTypes.ADD_LOG, payload: { msg: reason } });
    };
    const onReconnectState = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      const msg = payload.connected
        ? 'Reconnected to match.'
        : `Connection lost. Rejoin within grace period.`;
      dispatch({ type: ActionTypes.ADD_LOG, payload: { msg } });
    };
    const hydrateLobbyVote = (payload) => {
      const cur = stateRef.current;
      if (cur.status !== GameStatus.LOBBY || !cur.lobby) return;
      const nextState = {
        ...cur,
        lobby: {
          ...cur.lobby,
          ...(Array.isArray(payload?.members) ? { members: payload.members } : {}),
          ...(payload?.vote ? { vote: payload.vote } : {}),
        },
      };
      dispatch({ type: ActionTypes.HYDRATE_GAME, payload: { state: nextState } });
    };
    const onVoteRequested = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      hydrateLobbyVote(payload);
    };
    const onVoteUpdated = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      hydrateLobbyVote(payload);
    };
    const onVoteClosed = (payload) => {
      if (cancelled || !payload) return;
      if (String(payload.roomId || '') !== rid) return;
      if (shouldDropEvent(payload)) return;
      hydrateLobbyVote(payload);
    };
    const onError = (payload) => {
      // #region agent log
      fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H5',location:'frontend/src/games/ludoGame/hooks/useLudoGame.js:onError',message:'Received ludo:error event',data:{errorCode:String(payload?.code||''),errorMessage:String(payload?.message||'')},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    };

    let socket = null;
    void socketService.ensureConnected({ forceRefresh: false }).then((s) => {
      if (cancelled || !s) return;
      socket = s;
      s.on('ludo:gameState', onGameState);
      s.on('ludo:playerJoined', onPlayerJoined);
      s.on('ludo:gameEnded', onGameEnded);
      s.on('ludo:diceRolled', onDiceRolled);
      s.on('ludo:turnComplete', onTurnComplete);
      s.on('ludo:reconnectState', onReconnectState);
      s.on('ludo:voteRequested', onVoteRequested);
      s.on('ludo:voteUpdated', onVoteUpdated);
      s.on('ludo:voteClosed', onVoteClosed);
      s.on('ludo:error', onError);
    });

    return () => {
      cancelled = true;
      if (socket) {
        socket.off('ludo:gameState', onGameState);
        socket.off('ludo:playerJoined', onPlayerJoined);
        socket.off('ludo:gameEnded', onGameEnded);
        socket.off('ludo:diceRolled', onDiceRolled);
        socket.off('ludo:turnComplete', onTurnComplete);
        socket.off('ludo:reconnectState', onReconnectState);
        socket.off('ludo:voteRequested', onVoteRequested);
        socket.off('ludo:voteUpdated', onVoteUpdated);
        socket.off('ludo:voteClosed', onVoteClosed);
        socket.off('ludo:error', onError);
      }
    };
  }, [socketRoomId]);

  const rollDice = useCallback(() => {
    const s = stateRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H1',location:'frontend/src/games/ludoGame/hooks/useLudoGame.js:rollDice',message:'Roll button invoked on client',data:{status:String(s.status||''),currentTurn:String(s.currentTurn||''),currentPlayerIndex:Number(s.currentPlayerIndex||0),waitingForMove:Boolean(s.waitingForMove),isRolling:Boolean(s.isRolling),diceValue:Number(s.diceValue||0)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (s.status !== GameStatus.PLAYING || s.isRolling || s.waitingForMove) {
      return;
    }
    if (hasPendingDieFace(s.diceValue)) {
      return;
    }
    const gid = socketRoomIdRef.current || s.gameId;
    if (!gid) return;
    socketService.emit('ludo:rollDice', { roomId: gid });
  }, []);

  const moveToken = useCallback((tokenId) => {
    const s = stateRef.current;
    const gid = socketRoomIdRef.current || s.gameId;
    if (!gid) return;
    socketService.emit('ludo:moveToken', { roomId: gid, tokenId });
  }, []);

  const resetGame = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_GAME });
  }, []);

  const quitMatch = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_TO_INITIAL });
  }, []);

  const hydrateGame = useCallback((restoredState) => {
    dispatch({ type: ActionTypes.HYDRATE_GAME, payload: { state: restoredState } });
  }, []);

  useEffect(() => {
    if (state.status !== GameStatus.PLAYING || state.isRolling) return;

    if (state.timeLeft <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      dispatch({ type: ActionTypes.TICK_TIMER });
    }, 1000);

    return () => clearTimeout(timer);
  }, [state.status, state.isRolling, state.timeLeft]);

  return { state, rollDice, moveToken, resetGame, quitMatch, hydrateGame, validMoves };
};
