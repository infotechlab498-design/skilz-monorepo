import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { auth } from '../../../firebase/config.js';
import { ensureGameUserFromAuth } from '../../../utils/gameAuthSync.js';
import { connectSocket, ensureSocketConnected, socket } from '../../mathRush/lib/socket.js';
import { EnigmaPulseEvents, ENIGMA_PULSE } from '../../../../../shared/enigmaPulse/constants.js';
import { isPatternRecognitionGameKey, isWordCipherGameKey } from '../../../../../shared/enigmaPulse/gameKeys.js';
import {
  EP_INSUFFICIENT_QUESTIONS,
  EP_SYLLOGISM_DECK_INCOMPLETE,
  EP_WORD_CIPHER_DECK_INCOMPLETE,
} from '../../../../../shared/enigmaPulse/errorCodes.js';
import { resolveEnigmaPulseErrorToast } from '../enigmaPulseClientErrors.js';

/**
 * Shared EnigmaPulse in-match socket session (bootstrap + core listeners).
 *
 * @param {{
 *   profile: 'sequenceIq' | 'wordCipher' | 'generic';
 *   routeRoomId?: string;
 *   prefetchMatch?: Record<string, unknown> | null;
 *   navigate: import('react-router-dom').NavigateFunction;
 *   acceptGameKey?: (gameKey: string) => boolean;
 *   defaultTotalQuestions?: number;
 *   onQuestionStart?: (payload: Record<string, unknown>) => void;
 *   onAnswerResult?: (payload: Record<string, unknown>) => void;
 *   onOpponentAnswered?: (payload: Record<string, unknown>) => void;
 *   onOpponentHint?: (payload: Record<string, unknown>) => void;
 *   onNextQuestion?: (payload: Record<string, unknown>) => void;
 *   onMatchEnd?: (payload: Record<string, unknown>) => void;
 * }} options
 */
export function useEnigmaMatchSession({
  profile,
  routeRoomId = '',
  prefetchMatch = null,
  navigate,
  acceptGameKey,
  defaultTotalQuestions = ENIGMA_PULSE.QUESTION_COUNT,
  onQuestionStart,
  onAnswerResult,
  onOpponentAnswered,
  onOpponentHint,
  onNextQuestion,
  onMatchEnd,
}) {
  const isSequence = profile === 'sequenceIq';
  const isWordCipher = profile === 'wordCipher';
  const isAlternatingTurn = isSequence || isWordCipher;
  const gameKeyOk =
    acceptGameKey ||
    (isSequence
      ? (gk) => isPatternRecognitionGameKey(gk)
      : isWordCipher
        ? (gk) => isWordCipherGameKey(gk)
        : () => true);

  const [gameUser, setGameUser] = useState(null);
  const [phase, setPhase] = useState('connecting');
  const [sessionRoomId, setSessionRoomId] = useState(routeRoomId);
  const [room, setRoom] = useState(null);
  const [result, setResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(ENIGMA_PULSE.QUESTION_SECONDS);

  const lockedRoomRef = useRef(null);
  const phaseRef = useRef(phase);
  const whooshTimerRef = useRef(null);
  const didEntryWhooshRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const tryLockRoom = useCallback((rid) => {
    if (!rid) return false;
    if (!lockedRoomRef.current) {
      lockedRoomRef.current = rid;
      setSessionRoomId(rid);
      return true;
    }
    return lockedRoomRef.current === rid;
  }, []);

  const roomMatches = useCallback(
    (payloadRoomId) => {
      if (!payloadRoomId) return false;
      if (isAlternatingTurn) return tryLockRoom(payloadRoomId);
      return !routeRoomId || payloadRoomId === routeRoomId;
    },
    [isAlternatingTurn, routeRoomId, tryLockRoom]
  );

  const defaultRounds =
    profile === 'wordCipher'
      ? ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS
      : isSequence
        ? ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS
        : defaultTotalQuestions;

  const buildPrefetchRoom = useCallback(
    (match) => ({
      roomId: match.roomId,
      status: 'playing',
      gameKey:
        match.gameKey ??
        (isSequence ? 'pattern_recognition' : isWordCipher ? 'word_cipher' : 'riddle_classic'),
      category: match.category,
      difficulty: match.difficulty,
      players: match.players || [],
      questionIndex: 0,
      totalQuestions: isAlternatingTurn ? defaultRounds : defaultTotalQuestions,
      question: null,
      deadlineMs: null,
      currentTurnUid: null,
    }),
    [defaultRounds, defaultTotalQuestions, isAlternatingTurn, isSequence, isWordCipher]
  );

  useEffect(() => {
    if (!isAlternatingTurn) return;
    setSessionRoomId(routeRoomId);
    lockedRoomRef.current = null;
    didEntryWhooshRef.current = false;
  }, [isAlternatingTurn, routeRoomId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [u] = await Promise.all([
          ensureGameUserFromAuth(),
          (async () => {
            if (!auth.currentUser) return false;
            connectSocket();
            await ensureSocketConnected();
            return true;
          })(),
        ]);
        if (!active) return;
        if (!u) {
          navigate('/signin', { replace: true });
          return;
        }
        setGameUser(u);
        socket.emit(EnigmaPulseEvents.RECONNECT);

        if (prefetchMatch?.roomId) {
          const rid = String(prefetchMatch.roomId);
          if (isSequence) tryLockRoom(rid);
          if (isWordCipher) tryLockRoom(rid);
          setPhase(isAlternatingTurn ? 'deck_preparing' : 'preparing');
          setRoom(buildPrefetchRoom(prefetchMatch));
          socket.emit(EnigmaPulseEvents.REQUEST_SYNC_STATE, { roomId: rid });
        } else if (routeRoomId) {
          setPhase(isAlternatingTurn ? 'matchmaking' : 'connecting');
          socket.emit(EnigmaPulseEvents.JOIN_PRIVATE, {
            roomId: routeRoomId,
            displayName: u.displayName,
            photoURL: u.photoURL,
          });
        }
      } catch (e) {
        console.warn('[EnigmaPulse session] bootstrap failed:', e?.message || e);
        if (!active) return;
        navigate('/signin', { replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [buildPrefetchRoom, isAlternatingTurn, isSequence, isWordCipher, navigate, prefetchMatch, routeRoomId, tryLockRoom]);

  useEffect(() => {
    const onMatchPreparing = (payload) => {
      if (!gameKeyOk(payload?.gameKey)) return;
      const pRid = payload?.roomId;
      if (!pRid || !roomMatches(pRid)) return;
      setPhase(isAlternatingTurn ? 'deck_preparing' : 'preparing');
      setRoom({
        roomId: pRid,
        status: payload.status || 'preparing',
        gameKey: payload.gameKey,
        category: payload.category,
        difficulty: payload.difficulty,
        players: payload.players || [],
        questionIndex: 0,
        totalQuestions: isPatternRecognitionGameKey(payload.gameKey)
          ? ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS
          : isWordCipherGameKey(payload.gameKey)
            ? ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS
            : defaultTotalQuestions,
        question: null,
        deadlineMs: null,
        currentTurnUid: null,
      });
    };

    const onMatchFound = (payload) => {
      if (!gameKeyOk(payload?.gameKey)) return;
      const pRid = payload?.roomId;
      if (!pRid) return;
      if (isSequence || isWordCipher) {
        if (!roomMatches(pRid)) return;
        setRoom((prev) => {
          if (prev?.roomId === pRid) {
            return {
              ...prev,
              players: payload.players || prev.players,
              category: payload.category ?? prev.category,
              difficulty: payload.difficulty ?? prev.difficulty,
              gameKey: payload.gameKey ?? prev.gameKey,
            };
          }
          return buildPrefetchRoom(payload);
        });
        setPhase('deck_preparing');
        return;
      }
      if (pRid !== routeRoomId) {
        navigate(`/enigmaPulse/game/${pRid}`, { replace: true, state: { match: payload } });
      }
    };

    const onStart = (payload) => {
      if (!gameKeyOk(payload?.gameKey)) return;
      const pRid = payload?.roomId;
      if (!pRid || !roomMatches(pRid)) return;
      setRoom(payload);
      setSecondsLeft(Math.max(0, Number(ENIGMA_PULSE.QUESTION_SECONDS) || 15));
      onQuestionStart?.(payload);

      if (isSequence) {
        if (!didEntryWhooshRef.current) {
          didEntryWhooshRef.current = true;
          setPhase('starting');
          if (whooshTimerRef.current) window.clearTimeout(whooshTimerRef.current);
          whooshTimerRef.current = window.setTimeout(() => {
            setPhase('playing');
            whooshTimerRef.current = null;
          }, 460);
        } else {
          setPhase('playing');
        }
      } else {
        setPhase('playing');
      }
    };

    const onTimer = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      setSecondsLeft(Number(payload.secondsLeft || 0));
    };

    const onAnswer = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) => {
            const next = (payload.scores || []).find((x) => x.uid === p.uid);
            return next
              ? {
                  ...p,
                  score: next.score,
                  coinsEarned: next.coinsEarned,
                  streak: next.streak ?? p.streak,
                }
              : p;
          }),
        };
      });
      onAnswerResult?.(payload);
    };

    const onOpponentAnsweredEvt = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      onOpponentAnswered?.(payload);
    };

    const onHintEvt = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      onOpponentHint?.(payload);
    };

    const onNext = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      setRoom((prev) => (prev ? { ...prev, questionIndex: payload.questionIndex } : prev));
      onNextQuestion?.(payload);
    };

    const onEnd = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      setResult(payload);
      onMatchEnd?.(payload);
    };

    const onSync = (payload) => {
      if (!roomMatches(payload?.roomId)) return;
      if (!gameKeyOk(payload?.gameKey)) return;
      setRoom(payload);
      if (payload?.question) setPhase('playing');
    };

    const onErr = (payload) => {
      if (payload?.code === 'EP_NOT_YOUR_TURN') {
        onOpponentAnswered?.({ ...payload, uid: gameUser?.uid, notYourTurn: true });
        return;
      }
      const display = resolveEnigmaPulseErrorToast(payload);
      console.warn('[EnigmaPulse session]', payload?.code || display, payload);
      const currentPhase = phaseRef.current;
      const duringDeckBuild =
        currentPhase === 'matchmaking' ||
        currentPhase === 'deck_preparing' ||
        currentPhase === 'starting' ||
        currentPhase === 'preparing' ||
        currentPhase === 'connecting';
      const fatalToLobby =
        duringDeckBuild ||
        payload?.code === EP_INSUFFICIENT_QUESTIONS ||
        payload?.code === EP_SYLLOGISM_DECK_INCOMPLETE ||
        payload?.code === EP_WORD_CIPHER_DECK_INCOMPLETE;
      if (fatalToLobby) {
        toast.error(display);
        lockedRoomRef.current = null;
        navigate('/enigmaPulseLobby', { replace: true });
      } else {
        toast.error(display);
      }
    };

    socket.on(EnigmaPulseEvents.MATCH_PREPARING, onMatchPreparing);
    socket.on(EnigmaPulseEvents.MATCH_FOUND, onMatchFound);
    socket.on(EnigmaPulseEvents.QUESTION_START, onStart);
    socket.on(EnigmaPulseEvents.TIMER_SYNC, onTimer);
    socket.on(EnigmaPulseEvents.ANSWER_RESULT, onAnswer);
    socket.on(EnigmaPulseEvents.OPPONENT_ANSWERED, onOpponentAnsweredEvt);
    socket.on(EnigmaPulseEvents.OPPONENT_USED_HINT, onHintEvt);
    socket.on(EnigmaPulseEvents.NEXT_QUESTION, onNext);
    socket.on(EnigmaPulseEvents.MATCH_END, onEnd);
    socket.on(EnigmaPulseEvents.SYNC_STATE, onSync);
    socket.on(EnigmaPulseEvents.ERROR, onErr);

    return () => {
      socket.off(EnigmaPulseEvents.MATCH_PREPARING, onMatchPreparing);
      socket.off(EnigmaPulseEvents.MATCH_FOUND, onMatchFound);
      socket.off(EnigmaPulseEvents.QUESTION_START, onStart);
      socket.off(EnigmaPulseEvents.TIMER_SYNC, onTimer);
      socket.off(EnigmaPulseEvents.ANSWER_RESULT, onAnswer);
      socket.off(EnigmaPulseEvents.OPPONENT_ANSWERED, onOpponentAnsweredEvt);
      socket.off(EnigmaPulseEvents.OPPONENT_USED_HINT, onHintEvt);
      socket.off(EnigmaPulseEvents.NEXT_QUESTION, onNext);
      socket.off(EnigmaPulseEvents.MATCH_END, onEnd);
      socket.off(EnigmaPulseEvents.SYNC_STATE, onSync);
      socket.off(EnigmaPulseEvents.ERROR, onErr);
      if (whooshTimerRef.current) {
        window.clearTimeout(whooshTimerRef.current);
        whooshTimerRef.current = null;
      }
    };
  }, [
    buildPrefetchRoom,
    defaultTotalQuestions,
    gameKeyOk,
    gameUser?.uid,
    isAlternatingTurn,
    isSequence,
    isWordCipher,
    navigate,
    onAnswerResult,
    onMatchEnd,
    onNextQuestion,
    onOpponentAnswered,
    onOpponentHint,
    onQuestionStart,
    roomMatches,
    routeRoomId,
  ]);

  const activeRoomId = room?.roomId || sessionRoomId || routeRoomId;

  const emitSubmitAnswer = useCallback(
    (payload) => {
      socket.emit(EnigmaPulseEvents.SUBMIT_ANSWER, { roomId: activeRoomId, ...payload });
    },
    [activeRoomId]
  );

  const emitUseHint = useCallback(
    (questionIndex) => {
      socket.emit(EnigmaPulseEvents.USE_HINT, { roomId: activeRoomId, questionIndex });
    },
    [activeRoomId]
  );

  const emitRequestSync = useCallback(() => {
    socket.emit(EnigmaPulseEvents.REQUEST_SYNC_STATE, { roomId: activeRoomId });
  }, [activeRoomId]);

  const emitSkipQuestion = useCallback(
    (questionIndex) => {
      socket.emit(EnigmaPulseEvents.SKIP_QUESTION, { roomId: activeRoomId, questionIndex });
    },
    [activeRoomId]
  );

  return {
    gameUser,
    phase,
    setPhase,
    room,
    setRoom,
    result,
    setResult,
    secondsLeft,
    setSecondsLeft,
    activeRoomId,
    sessionRoomId,
    tryLockRoom,
    emitSubmitAnswer,
    emitUseHint,
    emitRequestSync,
    emitSkipQuestion,
  };
}

/**
 * Auth + socket bootstrap only (Syllogism invite/queue flows keep custom listeners).
 * @param {{ navigate: import('react-router-dom').NavigateFunction }} options
 */
export function useEnigmaSocketBootstrap({ navigate }) {
  const [gameUser, setGameUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const u = await ensureGameUserFromAuth();
        if (!active) return;
        if (!u) {
          navigate('/signin', { replace: true });
          return;
        }
        connectSocket();
        await ensureSocketConnected();
        if (!active) return;
        setGameUser(u);
        setReady(true);
      } catch (e) {
        console.warn('[EnigmaPulse] socket bootstrap failed:', e?.message || e);
        if (!active) return;
        navigate('/signin', { replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  return { gameUser, ready, setGameUser };
}
