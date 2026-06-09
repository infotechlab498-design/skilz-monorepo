/**
 * Syllogism matchmaking shell — shown after lobby Select Mode (Practice / 1 vs 1).
 * Invite flow stays on `/enigmaPulse/syllogism` directly (private room UX unchanged).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '../../Components/Layout.jsx';
import { ensureGameUserFromAuth } from '../../utils/gameAuthSync.js';
import { connectSocket, ensureSocketConnected, socket } from '../mathRush/lib/socket.js';
import { EnigmaPulseEvents } from '../../../../shared/enigmaPulse/constants.js';
import { auth } from '../../firebase/config.js';
import { SyllogismBackdrop } from './Syllogism.jsx';
import './Syllogism.css';

const SYL_JOIN_TIPS = [
  'Read premises slowly — the conclusion follows only from what is stated.',
  'Eliminate options that contradict any premise.',
  'Hard rounds are timed — trust your first logical pass.',
];

export default function SyllogismJoining() {
  const navigate = useNavigate();
  const location = useLocation();
  const matchedRef = useRef(false);

  const passed = location.state || {};
  const category = passed.category ?? 'General Knowledge';
  const difficulty = passed.difficulty ?? 'medium';
  const syllogismMode = passed.syllogismMode;

  /** @type {'connecting' | 'searching' | 'deck_preparing'} */
  const [step, setStep] = useState('connecting');
  const [tipIndex, setTipIndex] = useState(0);
  const [waitingNotice, setWaitingNotice] = useState(false);
  const [preparingPlayers, setPreparingPlayers] = useState([]);

  useEffect(() => {
    if (syllogismMode !== 'practice' && syllogismMode !== 'one_vs_one') {
      navigate('/enigmaPulseLobby', { replace: true });
    }
  }, [navigate, syllogismMode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % SYL_JOIN_TIPS.length);
    }, 3400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (step !== 'connecting') return;
    if (syllogismMode !== 'practice' && syllogismMode !== 'one_vs_one') return;

    let active = true;
    void (async () => {
      try {
        const u = await ensureGameUserFromAuth();
        if (!active) return;
        if (!u) {
          navigate('/signin', { replace: true });
          return;
        }
        if (!auth.currentUser) {
          navigate('/signin', { replace: true });
          return;
        }
        connectSocket();
        await ensureSocketConnected();
        if (!active) return;

        socket.emit(EnigmaPulseEvents.RECONNECT);
        socket.emit(EnigmaPulseEvents.JOIN_QUEUE, {
          displayName: u.displayName,
          photoURL: u.photoURL,
          difficulty,
          category,
          gameKey: 'syllogism',
          soloBot: syllogismMode === 'practice',
        });

        setWaitingNotice(false);
        setStep('searching');
      } catch (e) {
        console.warn('[Syllogism joining] bootstrap failed:', e?.message || e);
        if (!active) return;
        navigate('/signin', { replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [step, syllogismMode, category, difficulty, navigate]);

  useEffect(() => {
    if (step !== 'searching' && step !== 'deck_preparing') return undefined;

    const onPreparing = (payload) => {
      const gk = String(payload?.gameKey || '').toLowerCase();
      if (gk && gk !== 'syllogism') return;
      setStep('deck_preparing');
      setPreparingPlayers(Array.isArray(payload?.players) ? payload.players : []);
    };

    const onFound = (payload) => {
      if (!payload?.roomId) return;
      const gk = String(payload.gameKey || '').toLowerCase();
      if (gk && gk !== 'syllogism') return;
      matchedRef.current = true;
      navigate('/enigmaPulse/syllogism', {
        replace: true,
        state: {
          mode: syllogismMode,
          category,
          difficulty,
          match: payload,
        },
      });
    };

    const onWaiting = () => {
      setWaitingNotice(true);
      toast.info('Searching for an opponent…');
    };

    const onErr = (p) => {
      matchedRef.current = true;
      socket.emit(EnigmaPulseEvents.LEAVE_QUEUE);
      toast.error(p?.message || 'Could not start Syllogism match');
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
  }, [step, syllogismMode, category, difficulty, navigate]);

  const headline =
    step === 'connecting'
      ? 'Connecting'
      : step === 'deck_preparing'
        ? 'Preparing deck'
        : waitingNotice
          ? 'Matching'
          : 'Finding opponent';

  const subline =
    step === 'connecting'
      ? 'Establishing secure session…'
      : step === 'deck_preparing'
        ? 'Building your Syllogism question deck…'
        : waitingNotice
          ? 'Pairing you with the next challenger…'
          : 'Your Syllogism duel loads as soon as the server finds a match.';

  return (
    <Layout>
      <SyllogismBackdrop>
        <div className="sy-join-stage">
          <div className="sy-join-orbit" aria-hidden />
          <h1 className="sy-join-title">{headline}</h1>
          <p className="sy-join-sub">{subline}</p>
          {preparingPlayers.length > 0 ? (
            <div className="sy-join-players" aria-label="Players in match">
              {preparingPlayers.map((p) => (
                <span key={p.uid} className="sy-join-player-chip">
                  {p.displayName || p.uid?.slice(0, 8) || 'Player'}
                  {p.isBot ? ' · Bot' : ''}
                </span>
              ))}
            </div>
          ) : null}
          <div className="sy-join-dots" aria-hidden>
            <span className="sy-join-dot" />
            <span className="sy-join-dot" />
            <span className="sy-join-dot" />
          </div>
          <p className="sy-join-tip">{SYL_JOIN_TIPS[tipIndex]}</p>
          <button type="button" className="sy-join-cancel" onClick={() => navigate('/enigmaPulseLobby', { replace: true })}>
            Cancel
          </button>
        </div>
      </SyllogismBackdrop>
    </Layout>
  );
}
