/**
 * Sequence IQ — loading / matchmaking route after lobby "Select Mode" (Practice or 1 vs 1).
 * Lobby modal stays the single place for mode choice; this screen shows only bootstrap + animated wait until MATCH_FOUND.
 * Direct visits without `queueMode` still get a fallback mode picker.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '../../Components/Layout.jsx';
import { ensureGameUserFromAuth } from '../../utils/gameAuthSync.js';
import { connectSocket, ensureSocketConnected, socket } from '../mathRush/lib/socket.js';
import { EnigmaPulseEvents } from '../../../../shared/enigmaPulse/constants.js';
import { isPatternRecognitionGameKey } from '../../../../shared/enigmaPulse/gameKeys.js';
import { resolveEnigmaPulseErrorToast } from './enigmaPulseClientErrors.js';
import { auth } from '../../firebase/config.js';
import { buildPracticeQueuePayload } from './modes/practiceMode.js';
import { buildOneVsOneQueuePayload } from './modes/oneVsOneMode.js';
import { ENIGMA_PLAY_MODES } from './modes/modeRegistry.js';
import { SequenceIqBootView } from './EnigmaPulseBootView.jsx';
import { SEQUENCE_IQ_GAMEPLAY_TIPS } from './PatternRecognition.jsx';
import './PatternRecognitionStartup.css';

function enigmaSequenceRoomUrl(roomId) {
  return `/enigmaPulse/sequence/${roomId}`;
}

export default function PatternRecognitionJoining() {
  const navigate = useNavigate();
  const location = useLocation();
  const matchedRef = useRef(false);

  const passed = location.state || {};
  const category = passed.category ?? 'General Knowledge';
  const difficulty = passed.difficulty ?? 'medium';
  const gameKey = passed.gameKey ?? 'pattern_recognition';
  /** When set from lobby after Select Mode — skip duplicate mode UI and join queue immediately. */
  const queueModeFromNav = passed.queueMode;

  /** @type {'choose_mode' | 'connecting' | 'searching' | 'deck_preparing'} */
  const [step, setStep] = useState('connecting');
  const [gameUser, setGameUser] = useState(null);
  const [preparingRoom, setPreparingRoom] = useState(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [msgPulse, setMsgPulse] = useState(false);
  const [waitingNotice, setWaitingNotice] = useState(false);

  useEffect(() => {
    if (!isPatternRecognitionGameKey(gameKey)) {
      navigate('/enigmaPulseLobby', { replace: true });
    }
  }, [gameKey, navigate]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % SEQUENCE_IQ_GAMEPLAY_TIPS.length);
      setMsgPulse(true);
      window.setTimeout(() => setMsgPulse(false), 280);
    }, 3200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (step !== 'connecting') return;
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
        if (!active) return;

        const userPayload = { ...u, xp: Number(u.xp ?? 0) };
        if (queueModeFromNav === 'practice' || queueModeFromNav === 'one_vs_one') {
          socket.emit(EnigmaPulseEvents.RECONNECT);
          if (queueModeFromNav === 'practice') {
            socket.emit(
              EnigmaPulseEvents.JOIN_QUEUE,
              buildPracticeQueuePayload({
                user: userPayload,
                category,
                difficulty,
                gameKey,
              })
            );
          } else {
            socket.emit(
              EnigmaPulseEvents.JOIN_QUEUE,
              buildOneVsOneQueuePayload({
                user: userPayload,
                category,
                difficulty,
                gameKey,
              })
            );
          }
          setWaitingNotice(false);
          setStep('searching');
        } else {
          setStep('choose_mode');
        }
      } catch (e) {
        console.warn('[SequenceIQ joining] bootstrap failed:', e?.message || e);
        if (!active) return;
        navigate('/signin', { replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [step, navigate, queueModeFromNav, category, difficulty, gameKey]);

  useEffect(() => {
    if (step !== 'searching' && step !== 'deck_preparing') return undefined;

    const onPreparing = (payload) => {
      if (!isPatternRecognitionGameKey(payload?.gameKey)) return;
      setStep('deck_preparing');
      setPreparingRoom({
        roomId: payload.roomId,
        players: payload.players || [],
        gameKey: payload.gameKey,
        category: payload.category,
        difficulty: payload.difficulty,
      });
    };

    const onFound = (payload) => {
      if (!payload?.roomId) return;
      const resolvedKey = payload.gameKey ?? gameKey;
      if (!isPatternRecognitionGameKey(resolvedKey)) return;
      matchedRef.current = true;
      navigate(enigmaSequenceRoomUrl(payload.roomId), { replace: true, state: { match: payload } });
    };

    const onWaiting = () => {
      setWaitingNotice(true);
      toast.info('Searching for an opponent…');
    };

    const onErr = (p) => {
      matchedRef.current = true;
      socket.emit(EnigmaPulseEvents.LEAVE_QUEUE);
      toast.error(resolveEnigmaPulseErrorToast(p));
      navigate('/enigmaPulseLobby', { replace: true });
    };

    socket.on(EnigmaPulseEvents.MATCH_PREPARING, onPreparing);
    socket.on(EnigmaPulseEvents.MATCH_FOUND, onFound);
    socket.on(EnigmaPulseEvents.WAITING, onWaiting);
    socket.on(EnigmaPulseEvents.ERROR, onErr);

    return () => {
      socket.off(EnigmaPulseEvents.MATCH_PREPARING, onPreparing);
      socket.off(EnigmaPulseEvents.MATCH_FOUND, onFound);
      socket.off(EnigmaPulseEvents.WAITING, onWaiting);
      socket.off(EnigmaPulseEvents.ERROR, onErr);
      if (!matchedRef.current) {
        socket.emit(EnigmaPulseEvents.LEAVE_QUEUE);
      }
    };
  }, [step, gameKey, navigate]);

  const startQueue = async (modeKey) => {
    if (!gameUser) return;
    await ensureSocketConnected();
    socket.emit(EnigmaPulseEvents.RECONNECT);
    if (modeKey === 'practice') {
      socket.emit(
        EnigmaPulseEvents.JOIN_QUEUE,
        buildPracticeQueuePayload({
          user: { ...gameUser, xp: Number(gameUser.xp ?? 0) },
          category,
          difficulty,
          gameKey,
        })
      );
    } else if (modeKey === 'one_vs_one') {
      socket.emit(
        EnigmaPulseEvents.JOIN_QUEUE,
        buildOneVsOneQueuePayload({
          user: { ...gameUser, xp: Number(gameUser.xp ?? 0) },
          category,
          difficulty,
          gameKey,
        })
      );
    }
    setWaitingNotice(false);
    setStep('searching');
  };

  const goInviteOnLobby = () => {
    navigate('/enigmaPulseLobby', {
      replace: true,
      state: { openPatternInvite: true, category, difficulty, gameKey },
    });
  };

  const backToLobby = () => {
    navigate('/enigmaPulseLobby', { replace: true });
  };

  if (step === 'connecting') {
    return (
      <Layout>
        <SequenceIqBootView
          phase="connecting"
          room={null}
          headline="Loading"
          tip={SEQUENCE_IQ_GAMEPLAY_TIPS[tipIndex]}
          tipFade={msgPulse}
        />
      </Layout>
    );
  }

  if (step === 'choose_mode') {
    return (
      <Layout>
        <div className="pr-boot pr-join-mode">
          <div className="pr-boot__bg" aria-hidden />
          <div className="pr-boot__grid" aria-hidden />
          <div className="pr-boot__content pr-join-mode__inner">
            <p className="pr-boot__title">Sequence IQ</p>
            <h1 className="pr-boot__headline">Pattern Recognition</h1>
            <p className="pr-boot__msg">Choose how you want to play.</p>
            <div className="pr-join-mode__grid">
              {ENIGMA_PLAY_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="pr-join-mode__pill"
                  onClick={() => {
                    if (m.key === 'invite') {
                      goInviteOnLobby();
                      return;
                    }
                    void startQueue(m.key);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" className="pr-join-mode__back" onClick={backToLobby}>
              ← Back to EnigmaPulse lobby
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (step === 'deck_preparing') {
    return (
      <Layout>
        <SequenceIqBootView
          phase="deck_preparing"
          room={preparingRoom}
          headline="Calibrating"
          tip={SEQUENCE_IQ_GAMEPLAY_TIPS[tipIndex]}
          tipFade={msgPulse}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <SequenceIqBootView
        phase="matchmaking"
        room={null}
        headline={waitingNotice ? 'Matching' : 'Finding opponent'}
        tip={SEQUENCE_IQ_GAMEPLAY_TIPS[tipIndex]}
        tipFade={msgPulse}
        statusOverride={
          waitingNotice
            ? 'Pairing you with a worthy challenger…'
            : 'Hold tight — your Sequence IQ room opens when the match is ready.'
        }
      />
    </Layout>
  );
}
