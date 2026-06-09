import React, { useEffect, useMemo, useState } from 'react';

import { useLocation, useNavigate, useParams } from 'react-router-dom';

import Layout from '../../Components/Layout.jsx';

import { isPatternRecognitionGameKey, isWordCipherGameKey } from '../../../../shared/enigmaPulse/gameKeys.js';

import EnigmaPulseMatchResultView from './EnigmaPulseMatchResultView.jsx';

import EnigmaPulseBootView from './EnigmaPulseBootView.jsx';

import { bootHeadlineForPhase } from './enigmaSessionPhases.js';

import { useEnigmaMatchSession } from './hooks/useEnigmaMatchSession.js';

import './EnigmaPulseGameRoom.css';



const MAX_ATTEMPTS_PER_QUESTION = 2;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];



function roomDisplayMeta(gameKey) {

  const k = String(gameKey || '');

  if (isPatternRecognitionGameKey(k)) return { title: 'SEQUENCE IQ', kicker: 'Predict the next node' };

  if (k === 'logic_grid') return { title: 'LOGIC MASTER', kicker: 'Find the missing pattern' };

  return { title: 'LOGIC QUIZ', kicker: 'Choose the best answer' };

}



export default function EnigmaPulseGameRoom() {

  const { roomId } = useParams();

  const location = useLocation();

  const navigate = useNavigate();

  const prefetchMatch = location.state?.match || null;



  const [submittedForQuestion, setSubmittedForQuestion] = useState(false);

  const [answerText, setAnswerText] = useState('');

  const [localHint, setLocalHint] = useState('');

  const [opponentAnswered, setOpponentAnswered] = useState(false);

  const [lastOutcome, setLastOutcome] = useState(null);

  const [submitPending, setSubmitPending] = useState(false);

  const [selectedOption, setSelectedOption] = useState('');



  const gameKeyHint = String(

    prefetchMatch?.gameKey || location.state?.match?.gameKey || ''

  ).toLowerCase();



  useEffect(() => {

    if (!isWordCipherGameKey(gameKeyHint) || !roomId) return;

    navigate(`/enigmaPulse/cipher/${roomId}`, { replace: true, state: location.state });

  }, [gameKeyHint, location.state, navigate, roomId]);



  const {

    gameUser,

    phase,

    room,

    result,

    secondsLeft,

    emitSubmitAnswer,

    emitUseHint,

    emitSkipQuestion,

  } = useEnigmaMatchSession({

    profile: 'generic',

    routeRoomId: roomId,

    prefetchMatch: isWordCipherGameKey(gameKeyHint) ? null : prefetchMatch,

    navigate,

    acceptGameKey: (gk) => !isWordCipherGameKey(gk),

    onQuestionStart: () => {

      setSubmittedForQuestion(false);

      setAnswerText('');

      setLocalHint('');

      setSubmitPending(false);

      setSelectedOption('');

      setOpponentAnswered(false);

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

        return;

      }

      setOpponentAnswered(true);

    },

    onOpponentHint: (payload) => {

      if (payload?.uid === gameUser?.uid && payload?.hint) setLocalHint(String(payload.hint));

    },

    onNextQuestion: () => {

      setSubmittedForQuestion(false);

      setAnswerText('');

      setLocalHint('');

      setSubmitPending(false);

      setSelectedOption('');

      setOpponentAnswered(false);

      setLastOutcome(null);

    },

  });



  const me = useMemo(() => room?.players?.find((p) => p.uid === gameUser?.uid), [room, gameUser?.uid]);

  const gameKey = String(room?.gameKey || gameKeyHint || 'riddle_classic');

  const { title: roomTitle, kicker: roomKicker } = useMemo(() => roomDisplayMeta(gameKey), [gameKey]);

  const questionNumber = Number(room?.questionIndex ?? 0) + 1;

  const totalQuestions = Number(room?.totalQuestions ?? 10);

  const streakValue = Math.max(0, Number(me?.streak || 0));

  const categoryTag = String(room?.question?.category || room?.category || 'Logic').toUpperCase();

  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / 15) * 100));

  const progressItems = useMemo(

    () => Array.from({ length: totalQuestions }).map((_, i) => i),

    [totalQuestions]

  );

  const sequenceCells = useMemo(() => {

    const seq = room?.question?.sequence;

    return Array.isArray(seq) ? seq : [];

  }, [room?.question?.sequence]);

  const optionList = useMemo(() => {

    const opts = room?.question?.options;

    if (!Array.isArray(opts)) return [];

    return opts.map((x) => String(x ?? '').trim()).filter(Boolean);

  }, [room?.question?.options]);

  const showMcqTiles = optionList.length >= 4;



  const submitSelectedAnswer = () => {

    if (!room?.question || result) return;

    if (!answerText.trim() || submittedForQuestion || submitPending) return;

    setSubmitPending(true);

    emitSubmitAnswer({

      questionId: room.question.id,

      questionIndex: room.questionIndex,

      answerText: answerText.trim(),

    });

  };



  const submitOption = (optionValue) => {

    if (!optionValue || submittedForQuestion || submitPending) return;

    if (!room?.question || result) return;

    setSelectedOption(String(optionValue));

    setSubmitPending(true);

    emitSubmitAnswer({

      questionId: room.question.id,

      questionIndex: room.questionIndex,

      answerText: String(optionValue).trim(),

    });

  };



  if (isWordCipherGameKey(gameKeyHint)) {

    return (

      <Layout>

        <EnigmaPulseBootView variant="word_cipher" phase="connecting" message="Opening Word Cipher…" />

      </Layout>

    );

  }



  if (!room) {

    const preparing = phase === 'preparing';

    return (

      <Layout>

        <EnigmaPulseBootView

          variant="generic"

          phase={phase}

          headline={bootHeadlineForPhase(preparing ? 'preparing' : 'connecting')}

          subtitle={preparing ? 'Building question deck from the puzzle bank.' : ''}

          message={preparing ? undefined : 'Connecting to room…'}

        />

      </Layout>

    );

  }



  if (result) {

    return (

      <Layout>

        <EnigmaPulseMatchResultView

          gameUser={gameUser}

          result={result}

          roomSnapshot={room}

          recentResults={[]}

          onBackToLobby={() => navigate('/enigmaPulseLobby')}

          gameLabel={roomTitle}

          sublineWin="Great job!"

          sublineLoss="Better luck next round."

          sublineDraw="Evenly matched. Well played."

        />

      </Layout>

    );

  }



  return (

    <Layout>

      <div className={`ep-stage ep-stage--${gameKey.replace(/[^a-z0-9_-]/gi, '').toLowerCase()}`}>

        <header className="ep-room-topline">

          <div className="ep-room-topline-row">

            <div className="ep-title-stack">

              <span className="ep-streak-badge" aria-live="polite">{`🔥 ${streakValue}x Streak`}</span>

              <h2 className="ep-room-title">{roomTitle}</h2>

            </div>

            <span className="ep-round-label">ROUND {questionNumber}/{totalQuestions}</span>

          </div>

          <div className="ep-timer-progress" aria-label="Round timer">

            <span className="ep-timer-fill" style={{ width: `${progressPercent}%` }} />

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

            <span className="ep-category-chip">{categoryTag}</span>

            <p className="ep-kicker">{sequenceCells.length > 0 ? 'Predict the next node in the pattern' : roomKicker}</p>



            <div className="ep-sequence-card">

              {sequenceCells.length > 0 ? (

                <div className="ep-sequence-line" aria-label="Number sequence">

                  {sequenceCells.map((cell, i) => (

                    <React.Fragment key={`${i}-${cell}`}>

                      {i > 0 ? <span className="ep-sequence-sep" aria-hidden="true">|</span> : null}

                      <span className={cell === '?' ? 'ep-sequence-cell ep-sequence-cell--q' : 'ep-sequence-cell'}>{cell}</span>

                    </React.Fragment>

                  ))}

                </div>

              ) : (

                <h3 className="ep-riddle-text">{room.question?.text}</h3>

              )}

            </div>



            <button type="button" className="ep-ghost-action" onClick={() => emitUseHint(room.questionIndex)} disabled={submittedForQuestion}>

              Request Hint

            </button>



            {localHint ? <p className="ep-hint-line">Hint: {localHint}</p> : null}

            {opponentAnswered ? <p className="ep-hint-line">Opponent answered.</p> : null}

            {submittedForQuestion ? (

              <p className="ep-hint-line ep-answer-locked" role="status">

                Answer submitted — locked for this round.

              </p>

            ) : null}

          </section>



          {showMcqTiles ? (

            <section className={`ep-options-row ${gameKey === 'riddle_classic' ? 'ep-options-row--logic' : ''}`} role="group" aria-label="Answer options">

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



          <div className="ep-progress-dots" aria-label="Question progress">

            {progressItems.map((idx) => (

              <span

                key={idx}

                className={

                  idx + 1 === questionNumber

                    ? 'ep-dot active'

                    : idx < questionNumber - 1

                      ? 'ep-dot done'

                      : 'ep-dot'

                }

              />

            ))}

          </div>

        </main>



        <footer className="ep-room-footer">

          <button onClick={() => navigate('/enigmaPulseLobby')}>Leave Match</button>

          <button onClick={() => emitSkipQuestion(room.questionIndex)} disabled={submittedForQuestion}>

            Skip

          </button>

        </footer>

      </div>

    </Layout>

  );

}


