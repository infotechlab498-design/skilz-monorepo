import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import Layout from '../../Components/Layout';
import { auth, db } from '../../firebase/config.js';
import {
  callCognitiveProcessBotTurn,
  callCognitiveResolveRoundIfStale,
  callCognitiveSubmitAnswer,
} from '../../api/cloudFunctionsApi.js';
import {
  COGNITIVE_BOT_UID,
  COGNITIVE_COLLECTIONS,
  COGNITIVE_MAX_ROUNDS,
  COGNITIVE_ROUND_MS,
} from '../../../../shared/cognitive/constants.js';
import './CognitiveGameRoom.css';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
  return Number(value) || 0;
}

function useNow(intervalMs = 250) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useCognitiveRoom(roomId, uid, roundId) {
  const [room, setRoom] = useState(null);
  const [round, setRound] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    if (!roomId) return undefined;
    setSyncing(true);
    const roomRef = doc(db, COGNITIVE_COLLECTIONS.ROOMS, roomId);
    return onSnapshot(
      roomRef,
      (snap) => {
        setRoom(snap.exists() ? { id: snap.id, ...snap.data() } : false);
        setSyncing(false);
      },
      () => {
        setRoom(false);
        setSyncing(false);
      }
    );
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !roundId) {
      setRound(null);
      return undefined;
    }
    const roundRef = doc(db, COGNITIVE_COLLECTIONS.ROOMS, roomId, 'rounds', roundId);
    return onSnapshot(roundRef, (snap) => {
      setRound(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [roomId, roundId]);

  useEffect(() => {
    if (!roomId || !roundId || !uid) {
      setAnswer(null);
      return undefined;
    }
    const answerRef = doc(db, COGNITIVE_COLLECTIONS.ROOMS, roomId, 'answers', `${roundId}_${uid}`);
    return onSnapshot(answerRef, (snap) => {
      setAnswer(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [roomId, roundId, uid]);

  return { room, round, answer, syncing };
}

function ResultPanel({ room, myUid, onBack }) {
  const players = room.players || [];
  const scores = room.scores || {};
  const sorted = [...players].sort((a, b) => (scores[b.uid] || 0) - (scores[a.uid] || 0));
  return (
    <div className="cg-result">
      <p className="cg-result__eyebrow">Match Complete</p>
      <h1>{room.winnerUid === myUid ? 'You won the duel' : room.winnerUid ? 'Opponent won' : 'Draw match'}</h1>
      <div className="cg-result__list">
        {sorted.map((player, index) => (
          <div key={player.uid} className={player.uid === myUid ? 'cg-result__row cg-result__row--me' : 'cg-result__row'}>
            <span>#{index + 1}</span>
            <strong>{player.uid === COGNITIVE_BOT_UID ? 'Bot' : player.displayName || 'Player'}</strong>
            <b>{scores[player.uid] || 0}</b>
          </div>
        ))}
      </div>
      <button type="button" className="cg-primary-btn" onClick={onBack}>
        Back to Lobby
      </button>
    </div>
  );
}

function TimerBar({ round, now, onExpire }) {
  const startsAt = toMillis(round?.startsAt);
  const endsAt = toMillis(round?.endsAt);
  const duration = Math.max(1, endsAt - startsAt || COGNITIVE_ROUND_MS);
  const remaining = Math.max(0, endsAt - now);
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
  const seconds = Math.ceil(remaining / 1000);

  useEffect(() => {
    if (!round?.id || !endsAt || remaining > 0 || round.status !== 'open') return;
    onExpire();
  }, [endsAt, onExpire, remaining, round?.id, round?.status]);

  return (
    <div className="cg-timer-wrap" aria-label={`${seconds} seconds remaining`}>
      <motion.div className="cg-timer-bar" animate={{ width: `${pct}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
    </div>
  );
}

function TopBar({ room, round, now, onExpire, myUid }) {
  const streak = room?.streaks?.[myUid] || 0;
  return (
    <header className="cg-topbar">
      <div className="cg-streak-pill">🔥 {streak}x Streak</div>
      <div className="cg-round-pill">
        Round {room?.roundNumber || round?.roundNumber || 1}/{room?.maxRounds || COGNITIVE_MAX_ROUNDS}
      </div>
      <TimerBar round={round} now={now} onExpire={onExpire} />
    </header>
  );
}

function OptionButton({ option, index, disabled, selected, resolved, correct, wrong, onPick }) {
  const className = [
    'cg-option',
    selected ? 'cg-option--selected' : '',
    resolved && correct ? 'cg-option--correct' : '',
    resolved && wrong ? 'cg-option--wrong' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => onPick(index)}
      whileHover={!disabled ? { y: -3, scale: 1.01 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      animate={wrong ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: wrong ? 0.35 : 0.18 }}
    >
      <span className="cg-option__badge">{OPTION_LABELS[index]}</span>
      <span>{option}</span>
    </motion.button>
  );
}

export default function CognitiveGameRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const now = useNow();
  const [myUid, setMyUid] = useState(() => auth.currentUser?.uid || '');
  const [busy, setBusy] = useState(false);
  const [localSelected, setLocalSelected] = useState(null);
  const expireRef = useRef('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setMyUid(user?.uid || ''));
    return () => unsub();
  }, []);

  const { room, round, answer, syncing } = useCognitiveRoom(roomId, myUid, null);
  const currentRoundId = room && room.currentRoundId ? room.currentRoundId : '';
  const live = useCognitiveRoom(roomId, myUid, currentRoundId);
  const activeRound = live.round || round;
  const myAnswer = live.answer || answer;

  useEffect(() => {
    setLocalSelected(null);
    expireRef.current = '';
  }, [currentRoundId]);

  const submit = useCallback(
    async (selectedIndex) => {
      if (!roomId || !currentRoundId || busy || myAnswer || room?.status !== 'active') return;
      setBusy(true);
      setLocalSelected(selectedIndex);
      try {
        await callCognitiveSubmitAnswer({ roomId, roundId: currentRoundId, selectedIndex });
        void callCognitiveResolveRoundIfStale({ roomId }).catch(() => {});
      } catch (err) {
        console.error(err);
      } finally {
        setBusy(false);
      }
    },
    [busy, currentRoundId, myAnswer, room?.status, roomId]
  );

  const onExpire = useCallback(() => {
    if (!currentRoundId || expireRef.current === currentRoundId || myAnswer || room?.status !== 'active') return;
    expireRef.current = currentRoundId;
    void submit(-1);
    void callCognitiveResolveRoundIfStale({ roomId }).catch(() => {});
  }, [currentRoundId, myAnswer, room?.status, roomId, submit]);

  useEffect(() => {
    if (!roomId || !room || room.status !== 'active' || !myAnswer || !room.botReadyAt) return undefined;
    let cancelled = false;
    let retryDelayMs = 450;
    const tick = async () => {
      if (cancelled) return;
      try {
        await callCognitiveProcessBotTurn({ roomId });
        await callCognitiveResolveRoundIfStale({ roomId });
        retryDelayMs = 450;
      } catch {
        if (!cancelled) {
          window.setTimeout(tick, retryDelayMs);
          retryDelayMs = Math.min(5000, Math.floor(retryDelayMs * 1.6));
        }
      }
    };
    const delay = Math.max(0, toMillis(room.botReadyAt) - Date.now());
    const timer = window.setTimeout(tick, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [myAnswer, room, roomId]);

  useEffect(() => {
    if (!roomId || !activeRound || activeRound.status !== 'open') return undefined;
    const delay = Math.max(0, toMillis(activeRound.endsAt) + 2800 - Date.now());
    const timer = window.setTimeout(() => {
      void callCognitiveResolveRoundIfStale({ roomId }).catch(() => {});
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeRound, roomId]);

  const selectedIndex = myAnswer?.selectedIndex ?? localSelected;
  const resolved = activeRound?.status === 'resolved';
  const waiting = Boolean(myAnswer && !resolved && room?.status === 'active');
  const previousReveal = room?.lastResolvedRound;
  const players = room?.players || [];
  const opponent = players.find((p) => p.uid !== myUid);
  const scores = room?.scores || {};

  if (syncing || room === null) {
    return (
      <Layout>
        <div className="cg-shell"><p className="cg-muted">Syncing cognitive arena...</p></div>
      </Layout>
    );
  }

  if (!room || room === false) {
    return (
      <Layout>
        <div className="cg-shell">
          <p className="cg-muted">Game room not found.</p>
          <button type="button" className="cg-primary-btn" onClick={() => navigate('/enigmaPulseLobby')}>Back to Lobby</button>
        </div>
      </Layout>
    );
  }

  if (room.status === 'finished') {
    return (
      <Layout>
        <main className="cg-shell">
          <ResultPanel room={room} myUid={myUid} onBack={() => navigate('/enigmaPulseLobby')} />
        </main>
      </Layout>
    );
  }

  const disabled = busy || Boolean(myAnswer) || activeRound?.status !== 'open' || now < toMillis(activeRound?.startsAt);

  return (
    <Layout>
      <main className="cg-shell">
        <TopBar room={room} round={activeRound} now={now} onExpire={onExpire} myUid={myUid} />

        <section className="cg-score-row">
          <span>You <strong>{scores[myUid] || 0}</strong></span>
          <span>{opponent?.isBot ? 'Bot' : opponent?.displayName || 'Opponent'} <strong>{scores[opponent?.uid] || 0}</strong></span>
        </section>

        <AnimatePresence mode="wait">
          <motion.section
            key={activeRound?.id || 'empty'}
            className="cg-question-stage"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.28 }}
          >
            <span className="cg-category">{activeRound?.category || 'logic'}</span>
            <h1>{activeRound?.question || 'Loading question...'}</h1>
          </motion.section>
        </AnimatePresence>

        <section className="cg-options" aria-label="Answer options">
          {(activeRound?.options || []).map((option, index) => {
            const isSelected = selectedIndex === index;
            const isCorrect = resolved && activeRound.correctIndex === index;
            const isWrong = resolved && isSelected && activeRound.correctIndex !== index;
            return (
              <OptionButton
                key={`${activeRound?.id}_${option}`}
                option={option}
                index={index}
                disabled={disabled}
                selected={isSelected}
                resolved={resolved}
                correct={isCorrect}
                wrong={isWrong}
                onPick={submit}
              />
            );
          })}
        </section>

        <footer className="cg-feedback">
          {waiting ? <span>Locked in. Waiting for opponent...</span> : null}
          {resolved ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cg-explanation">
              <strong>{myAnswer?.isCorrect ? 'Correct' : 'Review'}</strong>
              <p>{activeRound?.explanation || 'Round resolved.'}</p>
              <small>Score +{myAnswer?.scoreDelta || 0}</small>
            </motion.div>
          ) : null}
          {!resolved && !waiting && previousReveal?.explanation ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cg-explanation cg-explanation--previous">
              <strong>Previous round</strong>
              <p>{previousReveal.explanation}</p>
            </motion.div>
          ) : null}
        </footer>
      </main>
    </Layout>
  );
}
