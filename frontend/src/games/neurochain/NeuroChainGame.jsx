import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/config.js';
import {
  callNeuroChainProcessBotTurn,
  callNeuroChainResolveRoundIfStale,
  callNeuroChainSubmitAnswer,
} from '../../api/cloudFunctionsApi.js';
import { COLLECTIONS, NC_BOT_UID, NODES_PER_MATCH } from '../../../../shared/neurochain/constants.js';
import Layout from '../../Components/Layout';
import Timer from './Timer.jsx';
import QuestionCard from './QuestionCard.jsx';
import NeuroChainResult from './NeuroChainResult.jsx';
import './NeuroChainGame.css';

const SCHEMA_V2 = 2;
const BOT_POLL_MS = 450;
const BOT_POLL_MAX = 50;
const DEBUG_ENDPOINT = 'http://127.0.0.1:7889/ingest/315b70b2-50ee-40dc-9f35-3f8c09643cc1';
const DEBUG_SESSION_ID = '55a939';
function debugLog(hypothesisId, message, data = {}) {
  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': DEBUG_SESSION_ID },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId: 'pre-fix',
      hypothesisId,
      location: 'frontend/src/games/neurochain/NeuroChainGame.jsx',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export default function NeuroChainGame() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [myUid, setMyUid] = useState(() => auth.currentUser?.uid || '');
  const expiredRef = useRef(false);
  const answeredRef = useRef(false);
  const submitFnRef = useRef(async () => {});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setMyUid(u?.uid || ''));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!gameId) return undefined;
    const ref = doc(db, COLLECTIONS.GAMES, gameId);
    return onSnapshot(ref, (snap) => {
      setGame(snap.exists() ? snap.data() : null);
    });
  }, [gameId]);

  const idx = game ? Number(game.currentQuestionIndex) || 0 : 0;
  const q = useMemo(() => (game?.questions && game.questions[idx]) || null, [game, idx]);

  const schemaV2 = Number(game?.schemaVersion) === SCHEMA_V2;
  const isPractice = Boolean(
    game && (game.mode === 'practice' || (Array.isArray(game.playerIds) && game.playerIds.includes(NC_BOT_UID)))
  );

  const answered = useMemo(() => {
    if (!game || !myUid) return false;
    if (schemaV2) {
      return Boolean(game.submissionStatus?.[String(idx)]?.[myUid]?.lockedAt);
    }
    const node = game.answers?.[String(idx)] || {};
    return node[myUid] != null;
  }, [game, idx, myUid, schemaV2]);

  useEffect(() => {
    answeredRef.current = answered;
  }, [answered]);

  useEffect(() => {
    if (!game?.lastReveal || !myUid) return;
    const mine = game.lastReveal[myUid];
    if (mine && typeof mine.correct === 'boolean') {
      setFlash(mine.correct ? 'ok' : 'bad');
      const t = window.setTimeout(() => setFlash(null), 650);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [game?.lastReveal, myUid]);

  const submit = useCallback(
    async (selectedIndex) => {
      if (!gameId || busy || answeredRef.current || game?.status !== 'active') return;
      debugLog('H3', 'submit_invoked', {
        gameId,
        selectedIndex: Number(selectedIndex),
        idx: Number(idx),
        answered: Boolean(answeredRef.current),
        status: String(game?.status || ''),
      });
      setBusy(true);
      try {
        await callNeuroChainSubmitAnswer({
          gameId,
          questionIndex: idx,
          selectedIndex,
        });
        void callNeuroChainResolveRoundIfStale({ gameId }).catch(() => {});
      } catch (e) {
        debugLog('H3', 'submit_catch', {
          message: String(e?.message || ''),
          name: String(e?.name || ''),
        });
        console.error(e);
      } finally {
        setBusy(false);
      }
    },
    [gameId, busy, game?.status, idx]
  );

  useEffect(() => {
    submitFnRef.current = submit;
  }, [submit]);

  useEffect(() => {
    if (!gameId || !game || game.status !== 'active' || !isPractice || !schemaV2 || !answered) return undefined;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      if (cancelled || attempts >= BOT_POLL_MAX) return;
      attempts += 1;
      try {
        await callNeuroChainProcessBotTurn({ gameId });
      } catch (_) {
        /* bot not ready yet */
      }
      if (!cancelled && attempts < BOT_POLL_MAX) {
        window.setTimeout(tick, BOT_POLL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [gameId, game?.status, game?.currentQuestionIndex, answered, isPractice, schemaV2]);

  const onTimerExpire = useCallback(() => {
    if (expiredRef.current || answeredRef.current || game?.status !== 'active') return;
    expiredRef.current = true;
    void (async () => {
      try {
        await submitFnRef.current(-1);
      } catch (e) {
        console.error(e);
      }
      try {
        await callNeuroChainResolveRoundIfStale({ gameId });
      } catch (_) {
        /* ignore */
      }
    })();
  }, [gameId, game?.status]);

  useEffect(() => {
    expiredRef.current = false;
  }, [idx]);

  if (!gameId) {
    return (
      <Layout>
        <p className="nc-muted">Missing game.</p>
      </Layout>
    );
  }

  if (game === null) {
    return (
      <Layout>
        <div className="nc-game-shell">
          <p className="nc-muted">Syncing…</p>
        </div>
      </Layout>
    );
  }

  if (!game) {
    return (
      <Layout>
        <p className="nc-muted">Game not found.</p>
        <button type="button" className="nc-btn" onClick={() => navigate('/neurochainLobby')}>
          Lobby
        </button>
      </Layout>
    );
  }

  if (game.status === 'finished') {
    return (
      <Layout>
        <div className="nc-game-shell nc-game-shell--result">
          <NeuroChainResult game={game} myUid={myUid} onBack={() => navigate('/neurochainLobby')} />
        </div>
      </Layout>
    );
  }

  const scores = game.scores || {};
  const opp = (game.players || []).find((p) => p.uid !== myUid);

  return (
    <Layout>
      <div className="nc-game-shell">
        <header className="nc-game-head">
          <div>
            <h1 className="nc-game-title">NeuroChain</h1>
            <p className="nc-game-sub">
              {game.mode === 'practice' ? 'Practice vs NeuroBot' : game.mode === '1v1' ? 'Ranked duel' : 'Invite match'}
              {opp ? ` · vs ${opp.displayName || 'Opponent'}` : ''}
            </p>
          </div>
          <div className="nc-scores">
            <span className="nc-score-pill">
              You <strong>{scores[myUid] ?? 0}</strong>
            </span>
            {opp ? (
              <span className="nc-score-pill nc-score-pill--alt">
                {opp.uid === NC_BOT_UID ? 'Bot' : 'Rival'}{' '}
                <strong>{scores[opp.uid] ?? 0}</strong>
              </span>
            ) : null}
          </div>
        </header>

        <div className="nc-game-body">
          <Timer endsAt={game.questionEndsAt || null} onExpire={onTimerExpire} />
          <QuestionCard
            question={q}
            nodeIndex={idx}
            totalNodes={NODES_PER_MATCH}
            disabled={busy || answered}
            flashKey={flash}
            onPick={(i) => submit(i)}
          />
        </div>

        <footer className="nc-game-foot">
          <button type="button" className="nc-btn nc-btn--ghost" onClick={() => navigate('/neurochainLobby')}>
            Leave
          </button>
          {answered ? (
            <span className="nc-muted">
              {game.mode === 'practice' ? 'Resolving node…' : 'Locked in. Waiting for opponent…'}
            </span>
          ) : null}
        </footer>
      </div>
    </Layout>
  );
}
