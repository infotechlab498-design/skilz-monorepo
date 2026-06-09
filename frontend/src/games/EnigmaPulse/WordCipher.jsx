/**
 * Word Cipher — dedicated EnigmaPulse mode (lobby gameKey: word_cipher).
 * Alternating turns: 20 shared rounds, 10 unique questions per player from the question bank.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Layout from '../../Components/Layout.jsx';
import { ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import { api } from '../../services/api.js';
import EnigmaPulseBootView from './EnigmaPulseBootView.jsx';
import { bootHeadlineForPhase } from './enigmaSessionPhases.js';
import { useEnigmaMatchSession } from './hooks/useEnigmaMatchSession.js';
import WordCipherResult from './WordCipherResult.jsx';
import './EnigmaPulseGameRoom.css';

const MAX_ATTEMPTS_PER_QUESTION = 2;
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export const WORD_CIPHER_GAMEPLAY_TIPS = [
  'Read the riddle carefully — every word can be a clue.',
  'On your turn only you can submit; watch the turn banner.',
  'You get 10 unique puzzles this match — make each answer count.',
  'Hints cost nothing but time — use them when the clock is tight.',
];

export default function WordCipher() {
  const { roomId: routeRoomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const prefetchMatch = location.state?.match || null;

  const [selectedOption, setSelectedOption] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [submittedForQuestion, setSubmittedForQuestion] = useState(false);
  const [localHint, setLocalHint] = useState('');
  const [lastOutcome, setLastOutcome] = useState(null);
  const [recentResults, setRecentResults] = useState([]);

  const {
    gameUser,
    phase,
    room,
    result,
    secondsLeft,
    emitSubmitAnswer,
    emitUseHint,
    emitRequestSync,
    emitSkipQuestion,
  } = useEnigmaMatchSession({
    profile: 'wordCipher',
    routeRoomId,
    prefetchMatch,
    navigate,
    onQuestionStart: () => {
      setSubmittedForQuestion(false);
      setSelectedOption('');
      setAnswerText('');
      setSubmitPending(false);
      setLocalHint('');
      setLastOutcome(null);
    },
    onAnswerResult: (payload) => {
      const myAnswerResult = (payload.answerResults || []).find((x) => x.uid === gameUser?.uid);
      if (myAnswerResult) {
        setLastOutcome({
          correct: Boolean(myAnswerResult.correct),
          timedOut: payload.reason === 'timeout',
        });
      }
    },
    onOpponentAnswered: (payload) => {
      if (payload?.notYourTurn) {
        setSubmitPending(false);
        setSelectedOption('');
        setAnswerText('');
        return;
      }
      if (payload?.uid === gameUser?.uid) {
        setSubmitPending(false);
        if (typeof payload.correct === 'boolean') {
          setLastOutcome({ correct: payload.correct, timedOut: false });
        }
        const locked = Boolean(payload.locked);
        if (!locked) {
          setSubmittedForQuestion(false);
          if (payload.correct === false) {
            setAnswerText('');
            setSelectedOption('');
          }
        } else {
          setSubmittedForQuestion(true);
        }
      }
    },
    onOpponentHint: (payload) => {
      if (payload?.uid === gameUser?.uid && payload?.hint) setLocalHint(String(payload.hint));
    },
    onNextQuestion: () => {
      setSubmittedForQuestion(false);
      setSelectedOption('');
      setAnswerText('');
      setSubmitPending(false);
      setLocalHint('');
      setLastOutcome(null);
    },
  });

  useEffect(() => {
    setSubmitPending(false);
  }, [room?.currentTurnUid, room?.questionIndex]);

  useEffect(() => {
    if (!gameUser?.uid || !result) return;
    let active = true;
    void (async () => {
      try {
        const data = await api.getRecentEnigmaResults({ gameKey: 'word_cipher', limit: 5 });
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

  const me = useMemo(() => room?.players?.find((p) => p.uid === gameUser?.uid), [room, gameUser?.uid]);
  const turnUid = room?.currentTurnUid;
  const isMyTurn = Boolean(gameUser?.uid && turnUid && turnUid === gameUser.uid);
  const activeTurnPlayerLabel = useMemo(() => {
    const p = room?.players?.find((x) => x.uid === turnUid);
    if (!turnUid) return '';
    if (turnUid === gameUser?.uid) return 'You';
    if (p?.isBot) return 'Bot';
    return p?.displayName || p?.uid?.slice(0, 8) || 'Opponent';
  }, [room?.players, turnUid, gameUser?.uid]);

  const personalTot =
    room?.personalQuestionTotal != null && Number.isFinite(Number(room.personalQuestionTotal))
      ? Number(room.personalQuestionTotal)
      : ENIGMA_PULSE.WORD_CIPHER_QUESTIONS_PER_PLAYER;
  const personalIdxRaw =
    room?.personalQuestionIndex != null && Number.isFinite(Number(room.personalQuestionIndex))
      ? Number(room.personalQuestionIndex)
      : null;
  const usePersonalNodes = personalIdxRaw != null && personalTot > 0;
  const questionNumber = usePersonalNodes
    ? Math.max(1, personalIdxRaw)
    : Number(room?.questionIndex ?? 0) + 1;
  const totalQuestions = usePersonalNodes
    ? personalTot
    : ENIGMA_PULSE.WORD_CIPHER_QUESTIONS_PER_PLAYER;

  const streakValue = Math.max(0, Number(me?.streak || 0));
  const categoryTag = String(room?.question?.category || room?.category || 'Logic').toUpperCase();
  const questionSeconds = Math.max(1, Number(ENIGMA_PULSE.QUESTION_SECONDS) || 15);
  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / questionSeconds) * 100));

  const optionList = useMemo(() => {
    const opts = room?.question?.options;
    if (!Array.isArray(opts)) return [];
    return opts.map((x) => String(x ?? '').trim()).filter(Boolean);
  }, [room?.question?.options]);
  const showMcqTiles = optionList.length >= 4;

  const submitSelectedAnswer = () => {
    if (!room?.question || result || !isMyTurn) return;
    if (!answerText.trim() || submittedForQuestion || submitPending) return;
    setSubmitPending(true);
    emitSubmitAnswer({
      questionId: room.question.id,
      questionIndex: room.questionIndex,
      answerText: answerText.trim(),
    });
  };

  const submitOption = (optionValue) => {
    if (!optionValue || !room?.question || result || !isMyTurn) return;
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
      phase === 'deck_preparing' ||
      phase === 'preparing');

  if (showBoot) {
    const preparing = phase === 'deck_preparing' || phase === 'preparing';
    return (
      <Layout>
        <EnigmaPulseBootView
          variant="word_cipher"
          phase={phase}
          headline={bootHeadlineForPhase(preparing ? 'preparing' : 'connecting')}
          subtitle={preparing ? 'Building your cipher deck from the question bank.' : ''}
          message={preparing ? undefined : 'Connecting to room…'}
        />
      </Layout>
    );
  }

  if (result) {
    return (
      <Layout>
        <WordCipherResult
          gameUser={gameUser}
          result={result}
          roomSnapshot={room}
          recentResults={recentResults}
          onBackToLobby={() => navigate('/enigmaPulseLobby')}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="ep-stage ep-stage--word_cipher">
        <header className="ep-room-topline">
          <div className="ep-room-topline-row">
            <div className="ep-title-stack">
              <span className="ep-streak-badge" aria-live="polite">{`🔥 ${streakValue}x Streak`}</span>
              <h2 className="ep-room-title">WORD CIPHER</h2>
            </div>
            <span className="ep-round-label">
              CIPHER {questionNumber}/{totalQuestions}
            </span>
          </div>
          <div className="ep-timer-progress" aria-label="Round timer">
            <span className="ep-timer-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div
            className={`ep-turn-banner ${isMyTurn ? 'ep-turn-banner--yours' : 'ep-turn-banner--wait'}`}
            role="status"
            aria-live="polite"
          >
            {isMyTurn ? (
              <span className="ep-turn-banner__text">Your turn — decode and answer.</span>
            ) : (
              <span className="ep-turn-banner__text">
                {`${activeTurnPlayerLabel}'s turn — wait for your cipher.`}
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
              <p className="ep-hud-kicker">Your Progress</p>
              <p className="ep-hud-value">
                Cipher {String(questionNumber).padStart(2, '0')}/{totalQuestions}
              </p>
            </div>
          </section>

          <section className={`ep-center-frame ${!isMyTurn ? 'ep-center-frame--wait' : ''}`}>
            <span className="ep-category-chip">{categoryTag}</span>
            <p className="ep-kicker">{isMyTurn ? 'Decode the hidden term' : 'Opponent is decoding…'}</p>

            <div className="ep-sequence-card">
              {isMyTurn ? (
                <h3 className="ep-riddle-text">{room.question?.text}</h3>
              ) : (
                <p className="ep-riddle-text ep-riddle-text--muted" role="status">
                  Hidden until your turn.
                </p>
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

            {localHint && isMyTurn ? <p className="ep-hint-line">Hint: {localHint}</p> : null}
            {submittedForQuestion ? (
              <p className="ep-hint-line ep-answer-locked" role="status">
                Answer submitted — locked for this round.
              </p>
            ) : null}
          </section>

          {showMcqTiles && isMyTurn ? (
            <section className="ep-options-row" role="group" aria-label="Answer options">
              {optionList.map((opt, idx) => {
                const isSelected = selectedOption === String(opt);
                const outcomeClass =
                  isSelected && lastOutcome && !lastOutcome.timedOut
                    ? lastOutcome.correct
                      ? 'is-correct'
                      : 'is-wrong'
                    : '';
                return (
                  <button
                    key={`${idx}-${String(opt)}`}
                    type="button"
                    className={`ep-option-tile ${isSelected ? 'is-selected' : ''} ${outcomeClass}`.trim()}
                    onClick={() => submitOption(opt)}
                    disabled={submittedForQuestion || submitPending}
                  >
                    <span className="ep-option-label">{OPTION_LABELS[idx] || String.fromCharCode(65 + idx)}</span>
                    <span className="ep-option-value">{opt}</span>
                  </button>
                );
              })}
            </section>
          ) : null}

          {isMyTurn ? (
            <section className="ep-text-answer" aria-label={showMcqTiles ? 'Optional typed answer' : 'Type your answer'}>
              {lastOutcome && !lastOutcome.timedOut ? (
                <p
                  className={`ep-attempt-feedback ${lastOutcome.correct ? 'ep-attempt-feedback--ok' : 'ep-attempt-feedback--bad'}`}
                  role="status"
                >
                  {lastOutcome.correct
                    ? 'Correct!'
                    : (me?.attemptsLeft ?? 0) > 0
                      ? 'Incorrect — try again.'
                      : 'Incorrect.'}
                </p>
              ) : null}
              {!showMcqTiles ? (
                <div className="ep-fallback-answer">
                  <input
                    type="text"
                    className="ep-whisper-box ep-whisper-box--grow"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitSelectedAnswer();
                      }
                    }}
                    placeholder="Type your answer..."
                    disabled={submittedForQuestion || submitPending}
                    autoComplete="off"
                    spellCheck="false"
                    aria-label="Your answer"
                  />
                  <button
                    type="button"
                    className="ep-submit-btn"
                    onClick={submitSelectedAnswer}
                    disabled={!answerText.trim() || submittedForQuestion || submitPending}
                  >
                    {submittedForQuestion ? 'Answer Locked' : submitPending ? 'Checking…' : 'Submit Answer'}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

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
              <span className="ep-metric-label">Attempts</span>
              <span className="ep-metric-value">{me?.attemptsLeft ?? MAX_ATTEMPTS_PER_QUESTION}</span>
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
          <button
            type="button"
            onClick={() => emitSkipQuestion(room.questionIndex)}
            disabled={!isMyTurn || submittedForQuestion}
          >
            Skip
          </button>
          <button type="button" onClick={() => emitRequestSync()}>
            Sync State
          </button>
        </footer>
      </div>
    </Layout>
  );
}
