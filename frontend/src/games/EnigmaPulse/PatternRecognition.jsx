





/**
 * Sequence IQ — Pattern Recognition (EnigmaPulse lobby only).
 *
 * Frontend route/component identity: PatternRecognition under EnigmaPulse games.
 * Socket/match gameKey: pattern_recognition (legacy: riddle_sequence).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Layout from '../../Components/Layout.jsx';
import { EnigmaPulseEvents, ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import { isPatternRecognitionGameKey } from '../../../../shared/enigmaPulse/gameKeys.js';
import { api } from '../../services/api.js';
import PatternRecognitionMatchResult from './PatternRecognitionMatchResult.jsx';
import EnigmaPulseBootView, { SequenceIqBootView } from './EnigmaPulseBootView.jsx';
import { bootHeadlineForPhase } from './enigmaSessionPhases.js';
import { useEnigmaMatchSession } from './hooks/useEnigmaMatchSession.js';
import './EnigmaPulseGameRoom.css';
import './PatternRecognitionStartup.css';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export const SEQUENCE_IQ_LOADING_MESSAGES = {
  connecting: 'Establishing secure uplink…',
  matchmaking: 'Synchronizing neural patterns…',
  deck_preparing: 'Generating puzzle matrix…',
  starting: 'Deploying first node…',
};

export const SEQUENCE_IQ_GAMEPLAY_TIPS = [
  'Watch the gap — the unknown cell is your target.',
  'Eliminate options that break the rhythm of the sequence.',
  'Hard rounds reward speed; use hints only when stuck.',
  'Streaks stack coins — consecutive correct answers matter.',
];

export { SequenceIqBootView };

export default function PatternRecognition() {
  const { roomId: routeRoomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const prefetchMatch = location.state?.match || null;

  const [selectedOption, setSelectedOption] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [submittedForQuestion, setSubmittedForQuestion] = useState(false);
  const [localHint, setLocalHint] = useState('');
  const [recentResults, setRecentResults] = useState([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [msgPulse, setMsgPulse] = useState(false);
  const [whooshKey, setWhooshKey] = useState(0);

  const {
    gameUser,
    phase,
    room,
    result,
    secondsLeft,
    activeRoomId,
    emitSubmitAnswer,
    emitUseHint,
    emitRequestSync,
  } = useEnigmaMatchSession({
    profile: 'sequenceIq',
    routeRoomId,
    prefetchMatch,
    navigate,
    onQuestionStart: () => {
      setSubmittedForQuestion(false);
      setSelectedOption('');
      setSubmitPending(false);
      setLocalHint('');
      setWhooshKey((k) => k + 1);
    },
    onOpponentAnswered: (payload) => {
      if (payload?.notYourTurn) {
        setSubmitPending(false);
        setSelectedOption('');
        return;
      }
      if (payload?.uid === gameUser?.uid) {
        setSubmitPending(false);
        if (payload.locked) setSubmittedForQuestion(true);
      }
    },
    onOpponentHint: (payload) => {
      if (payload?.uid === gameUser?.uid && payload?.hint) setLocalHint(String(payload.hint));
    },
    onNextQuestion: () => {
      setSubmittedForQuestion(false);
      setSelectedOption('');
      setSubmitPending(false);
      setLocalHint('');
    },
  });

  useEffect(() => {
    const t = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % SEQUENCE_IQ_GAMEPLAY_TIPS.length);
      setMsgPulse(true);
      window.setTimeout(() => setMsgPulse(false), 280);
    }, 3200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!gameUser?.uid || !result) return;
    let active = true;
    void (async () => {
      try {
        const data = await api.getRecentEnigmaResults({ gameKey: 'pattern_recognition', limit: 5 });
        if (!active) return;
        setRecentResults(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (!active) return;
        setRecentResults([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [gameUser?.uid, result]);

  useEffect(() => {
    setSubmitPending(false);
  }, [room?.currentTurnUid, room?.questionIndex]);

  const me = useMemo(() => room?.players?.find((p) => p.uid === gameUser?.uid), [room, gameUser?.uid]);
  const turnUid = room?.currentTurnUid;
  const isMyTurn = Boolean(gameUser?.uid && (!turnUid || turnUid === gameUser.uid));
  const activeTurnPlayerLabel = useMemo(() => {
    const p = room?.players?.find((x) => x.uid === turnUid);
    if (!turnUid) return '';
    if (turnUid === gameUser?.uid) return 'You';
    return p?.displayName || p?.uid?.slice(0, 8) || 'Opponent';
  }, [room?.players, turnUid, gameUser?.uid]);
  const personalTot =
    room?.personalQuestionTotal != null && Number.isFinite(Number(room.personalQuestionTotal))
      ? Number(room.personalQuestionTotal)
      : 0;
  const personalIdxRaw =
    room?.personalQuestionIndex != null && Number.isFinite(Number(room.personalQuestionIndex))
      ? Number(room.personalQuestionIndex)
      : null;
  const usePersonalNodes = personalTot > 0 && personalIdxRaw != null;
  const questionNumber = usePersonalNodes
    ? Math.max(1, personalIdxRaw)
    : Number(room?.questionIndex ?? 0) + 1;
  const totalQuestions = usePersonalNodes
    ? personalTot
    : Number(
        room?.totalQuestions ??
          (isPatternRecognitionGameKey(room?.gameKey)
            ? ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS
            : ENIGMA_PULSE.QUESTION_COUNT)
      );
  const questionSeconds = Math.max(1, Number(ENIGMA_PULSE.QUESTION_SECONDS) || 15);
  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / questionSeconds) * 100));
  const sequence = Array.isArray(room?.question?.sequence) ? room.question.sequence : [];
  const options = Array.isArray(room?.question?.options)
    ? room.question.options.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];

  const submitOption = (optionValue) => {
    if (!optionValue || !room?.question || result) return;
    if (!isMyTurn) return;
    if (submittedForQuestion || submitPending) return;
    setSelectedOption(String(optionValue));
    setSubmitPending(true);
    emitSubmitAnswer({
      questionId: room.question.id,
      questionIndex: room.questionIndex,
      answerText: String(optionValue).trim(),
    });
  };

  const showBoot =
    !result &&
    (!gameUser ||
      !room?.question ||
      phase === 'connecting' ||
      phase === 'matchmaking' ||
      phase === 'deck_preparing');

  if (showBoot) {
    return (
      <Layout>
        <EnigmaPulseBootView
          variant="sequence"
          title="Sequence IQ"
          phase={phase}
          room={room}
          headline={bootHeadlineForPhase(phase)}
          tip={SEQUENCE_IQ_GAMEPLAY_TIPS[tipIndex]}
          tipFade={msgPulse}
        />
      </Layout>
    );
  }

  if (result) {
    return (
      <Layout>
        <PatternRecognitionMatchResult
          gameUser={gameUser}
          result={result}
          roomSnapshot={room}
          recentResults={recentResults}
          onBackToLobby={() => navigate('/enigmaPulseLobby')}
        />
      </Layout>
    );
  }

  const whooshClass = phase === 'starting' ? 'pr-stage--whoosh-in' : '';

  return (
    <Layout>
      <div
        key={whooshKey}
        className={`ep-stage ep-stage--riddle_sequence ep-stage--pattern_recognition ${whooshClass}`}
      >
        <header className="ep-room-topline">
          <div className="ep-room-topline-row">
            <div className="ep-title-stack">
              <h2 className="ep-room-title">SEQUENCE IQ</h2>
            </div>
            <span className="ep-round-label">NODE {questionNumber}/{totalQuestions}</span>
          </div>
          <div className="ep-timer-progress">
            <span className="ep-timer-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div
            className={`ep-turn-banner ${isMyTurn ? 'ep-turn-banner--yours' : 'ep-turn-banner--wait'}`}
            role="status"
            aria-live="polite"
          >
            {isMyTurn ? (
              <span className="ep-turn-banner__text">Your turn — choose an answer.</span>
            ) : (
              <span className="ep-turn-banner__text">
                {`Opponent's turn — ${activeTurnPlayerLabel || 'Opponent'} is playing this node.`}
              </span>
            )}
          </div>
        </header>

        <main className="ep-room-shell">
          <section className="ep-hud-row">
            <div className="ep-hud-box ep-hud-box--left">
              <span className="ep-hud-badge">{secondsLeft}</span>
              <div>
                <p className="ep-hud-kicker">Time Remaining</p>
                <p className="ep-hud-value">T-MINUS 00:{String(Math.max(0, secondsLeft)).padStart(2, '0')}s</p>
              </div>
            </div>
            <div className="ep-hud-box ep-hud-box--right">
              <p className="ep-hud-kicker">Module Progress</p>
              <p className="ep-hud-value">Node {String(questionNumber).padStart(2, '0')}/{totalQuestions}</p>
            </div>
          </section>

          <section className="ep-center-frame">
            <p className="ep-kicker">Predict next sequence node</p>
            <div className="ep-sequence-card">
              {sequence.length > 0 ? (
                <div className="ep-sequence-line">
                  {sequence.map((cell, i) => (
                    <React.Fragment key={`${i}-${cell}`}>
                      {i > 0 ? <span className="ep-sequence-sep">|</span> : null}
                      <span className={cell === '?' ? 'ep-sequence-cell ep-sequence-cell--q' : 'ep-sequence-cell'}>
                        {cell}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <h3 className="ep-riddle-text">{room.question?.text}</h3>
              )}
            </div>
            <button
              type="button"
              className="ep-ghost-action"
              onClick={() => emitUseHint(room.questionIndex)}
              disabled={!isMyTurn || submittedForQuestion}
            >
              Request Hint
            </button>
            {localHint ? <p className="ep-hint-line">Hint: {localHint}</p> : null}
          </section>

          <section className="ep-options-row" role="group" aria-label="Answer options">
            {options.map((opt, idx) => (
              <button
                key={`${idx}-${opt}`}
                type="button"
                className={`ep-option-tile ${selectedOption === String(opt) ? 'is-selected' : ''}`}
                onClick={() => submitOption(opt)}
                disabled={!isMyTurn || submittedForQuestion || submitPending}
              >
                <span className="ep-option-label">{OPTION_LABELS[idx] || String.fromCharCode(65 + idx)}</span>
                <span className="ep-option-value">{opt}</span>
              </button>
            ))}
          </section>

          <section className="ep-stats-strip">
            <div className="ep-metric">
              <span className="ep-metric-label">Current Score</span>
              <span className="ep-metric-value">{me?.score ?? 0}</span>
            </div>
            <div className="ep-metric">
              <span className="ep-metric-label">Earned Coins</span>
              <span className="ep-metric-value">{me?.coinsEarned ?? 0}</span>
            </div>
            <div className="ep-metric">
              <span className="ep-metric-label">Streak</span>
              <span className="ep-metric-value">{Number(me?.streak || 0)}x</span>
            </div>
          </section>
        </main>

        <footer className="ep-room-footer">
          <button type="button" onClick={() => navigate('/enigmaPulseLobby')}>
            Leave Match
          </button>
          <button type="button" onClick={() => emitRequestSync()}>
            Sync State
          </button>
        </footer>
      </div>
    </Layout>
  );
}
