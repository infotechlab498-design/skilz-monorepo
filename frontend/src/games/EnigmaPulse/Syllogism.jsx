import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bot,
  Clock,
  Flame,
  Power,
  Star,
  Target,
  User,
} from 'lucide-react';
import Layout from '../../Components/Layout.jsx';
import { connectSocket, ensureSocketConnected, socket } from '../mathRush/lib/socket.js';
import { EnigmaPulseEvents, ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import { api } from '../../services/api.js';
import { ADMIN_EMAIL } from '../../config/admin.js';
import { resolveEnigmaPulseErrorToast } from './enigmaPulseClientErrors.js';
import EnigmaPulseMatchResultView from './EnigmaPulseMatchResultView.jsx';
import EnigmaPulseBootView from './EnigmaPulseBootView.jsx';
import { useEnigmaSocketBootstrap } from './hooks/useEnigmaMatchSession.js';
import syllogismBackground from '../../assets/enigmaPulseSyllogismBg.png';
import './Syllogism.css';
import '../../lobbyPages/triviaGame.css';

const TOTAL_QUESTIONS_FALLBACK = 10;
const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const OPTION_STYLE_SUFFIX = ['a', 'b', 'c', 'd'];

function modeTitle(mode) {
  if (mode === 'practice') return 'Practice';
  if (mode === 'one_vs_one') return '1 vs 1';
  if (mode === 'invite') return 'Invite';
  return 'Practice';
}

/** Split server `question.text` into premise block + interrogative line when possible (dynamic UI). */
function splitQuestionDisplay(text) {
  const raw = String(text || '').trim();
  if (!raw) return { premises: '', question: '' };
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { premises: lines.slice(0, -1).join(' '), question: lines[lines.length - 1] };
  }
  const interrog = raw.match(
    /\b(Are|Is|Are there|Is there|Do|Does|Did|Can|Could|Will|Would|Must|Should|Which|What|How|If)\b[\s\S]*\?\s*$/i
  );
  if (interrog && interrog.index != null && interrog.index > 8) {
    const premises = raw.slice(0, interrog.index).trim().replace(/[.;:]+$/u, '').trim();
    const question = raw.slice(interrog.index).trim();
    if (premises.length >= 8) return { premises, question };
  }
  const qIdx = raw.lastIndexOf('?');
  if (qIdx > 12) {
    const head = raw.slice(0, qIdx + 1);
    const dot = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'));
    if (dot > 10) {
      return {
        premises: head.slice(0, dot + 1).trim(),
        question: head.slice(dot + 1).trim(),
      };
    }
  }
  return { premises: raw, question: '' };
}

export function SyllogismBackdrop({ children }) {
  return (
    <div className="syllogism-root" style={{ '--sy-bg-url': `url(${syllogismBackground})` }}>
      <div className="syllogism-shell">{children}</div>
    </div>
  );
}

export default function Syllogism() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { gameUser, ready } = useEnigmaSocketBootstrap({ navigate });
  const [status, setStatus] = useState('loading'); // loading | searching | waiting_invite | deck_preparing | playing | ended
  const [room, setRoom] = useState(null);
  const [result, setResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(ENIGMA_PULSE.QUESTION_SECONDS);
  const [selectedOption, setSelectedOption] = useState('');
  const [locked, setLocked] = useState(false);
  const [lastOutcome, setLastOutcome] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [recentResults, setRecentResults] = useState([]);
  const [exitPending, setExitPending] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFields, setEditFields] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  const modeFromQuery = String(searchParams.get('mode') || '').trim();
  const roomIdFromUrl = String(searchParams.get('roomId') || '').trim();
  const inviteIdFromUrl = String(searchParams.get('inviteId') || '').trim();
  const mode = String(location.state?.mode || modeFromQuery || (roomIdFromUrl ? 'invite' : 'practice'));
  const category = String(location.state?.category || 'General Knowledge');
  const difficulty = String(location.state?.difficulty || 'medium');

  /** MATCH_FOUND carried from SyllogismJoining — skip JOIN_QUEUE and redundant leave_queue on teardown. */
  const prefetchMatch = location.state?.match || null;
  const prefetchRoomId = prefetchMatch?.roomId ? String(prefetchMatch.roomId) : '';
  const leaveQueueOnUnmountRef = useRef(!prefetchRoomId);

  useEffect(() => {
    if (!ready || !gameUser) return;
    let active = true;

    if (inviteIdFromUrl) {
      setStatus('searching');
      socket.emit(EnigmaPulseEvents.ACCEPT_INVITE_LINK, {
        inviteId: inviteIdFromUrl,
        displayName: gameUser.displayName,
        photoURL: gameUser.photoURL,
      });
      return () => {
        active = false;
      };
    }

    if (prefetchRoomId) {
      socket.emit(EnigmaPulseEvents.RECONNECT);
      socket.emit(EnigmaPulseEvents.REQUEST_SYNC_STATE, { roomId: prefetchRoomId });
      setStatus('deck_preparing');
      setRoom({
        roomId: prefetchRoomId,
        status: 'playing',
        category: prefetchMatch.category ?? category,
        difficulty: prefetchMatch.difficulty ?? difficulty,
        gameKey: prefetchMatch.gameKey ?? 'syllogism',
        players: prefetchMatch.players || [],
        questionIndex: 0,
        totalQuestions: ENIGMA_PULSE.QUESTION_COUNT,
        question: null,
        deadlineMs: null,
        currentTurnUid: null,
        roundDifficulty: prefetchMatch.difficulty ?? difficulty,
      });
      return () => {
        active = false;
      };
    }

    if (mode === 'invite' && roomIdFromUrl) {
      setStatus('searching');
      socket.emit(EnigmaPulseEvents.JOIN_PRIVATE, {
        roomId: roomIdFromUrl,
        displayName: gameUser.displayName,
        photoURL: gameUser.photoURL,
      });
      return () => {
        active = false;
      };
    }

    if (mode === 'invite') {
      setStatus('waiting_invite');
      socket.emit(EnigmaPulseEvents.CREATE_PRIVATE, {
        displayName: gameUser.displayName,
        photoURL: gameUser.photoURL,
        difficulty,
        category,
        gameKey: 'syllogism',
      });
      return () => {
        active = false;
      };
    }

    setStatus(mode === 'practice' ? 'playing' : 'searching');
    socket.emit(EnigmaPulseEvents.JOIN_QUEUE, {
      displayName: gameUser.displayName,
      photoURL: gameUser.photoURL,
      difficulty,
      category,
      gameKey: 'syllogism',
      soloBot: mode === 'practice',
    });

    return () => {
      active = false;
      if (leaveQueueOnUnmountRef.current) {
        socket.emit(EnigmaPulseEvents.LEAVE_QUEUE);
      }
    };
  }, [category, difficulty, gameUser, inviteIdFromUrl, mode, prefetchMatch, prefetchRoomId, ready, roomIdFromUrl]);

  useEffect(() => {
    const onWaiting = () => {
      if (mode === 'practice') return;
      setStatus('searching');
    };
    const onMatchPreparing = (payload) => {
      if (!payload?.roomId) return;
      setStatus('deck_preparing');
      setRoom({
        roomId: payload.roomId,
        status: payload.status || 'preparing',
        category: payload.category,
        difficulty: payload.difficulty,
        gameKey: payload.gameKey,
        players: payload.players || [],
        questionIndex: 0,
        totalQuestions: ENIGMA_PULSE.QUESTION_COUNT,
        question: null,
        deadlineMs: null,
        currentTurnUid: null,
        roundDifficulty: payload.difficulty,
      });
    };
    const onMatchFound = (payload) => {
      if (!payload?.roomId) return;
      setStatus('playing');
      setRoom((prev) =>
        prev?.roomId === payload.roomId
          ? {
              ...prev,
              players: payload.players || prev.players,
              category: payload.category ?? prev.category,
              difficulty: payload.difficulty ?? prev.difficulty,
              gameKey: payload.gameKey ?? prev.gameKey,
            }
          : prev
      );
    };
    const onPrivateCreated = ({ roomId }) => {
      if (!roomId) return;
      const baseUrl = window.location.origin;
      setInviteLink(`${baseUrl}/enigmaPulse/syllogism?mode=invite&roomId=${encodeURIComponent(roomId)}`);
      toast.success('Private room created. Share link with friend.');
    };
    const onInviteAccepted = ({ roomId }) => {
      if (!roomId) return;
      setStatus('playing');
    };
    const onQuestionStart = (payload) => {
      setRoom(payload);
      setStatus('playing');
      setLocked(false);
      setSelectedOption('');
      setLastOutcome(null);
    };
    const onTimerSync = (payload) => {
      setSecondsLeft(Number(payload?.secondsLeft || 0));
    };
    const onAnswerResult = (payload) => {
      const mine = (payload?.answerResults || []).find((x) => x.uid === gameUser?.uid);
      setLastOutcome({
        correct: Boolean(mine?.correct),
        timedOut: payload?.reason === 'timeout',
        correctAnswer: payload?.correctAnswerPreview || '',
      });
      setLocked(true);
    };
    const onNextQuestion = ({ questionIndex }) => {
      setRoom((prev) => (prev ? { ...prev, questionIndex } : prev));
      setLocked(false);
      setSelectedOption('');
      setLastOutcome(null);
    };
    const onSyncState = (payload) => {
      setRoom(payload);
      if (payload?.status === 'playing') setStatus('playing');
    };
    const onMatchEnd = (payload) => {
      setResult(payload);
      setStatus('ended');
    };
    const onErr = (payload) => {
      toast.error(resolveEnigmaPulseErrorToast(payload));
      if (payload?.code === 'QUEUE_TIMEOUT') {
        toast.info('No opponent found in 4s. Starting bot match...');
      }
    };

    socket.on(EnigmaPulseEvents.WAITING, onWaiting);
    socket.on(EnigmaPulseEvents.MATCH_PREPARING, onMatchPreparing);
    socket.on(EnigmaPulseEvents.MATCH_FOUND, onMatchFound);
    socket.on(EnigmaPulseEvents.PRIVATE_CREATED, onPrivateCreated);
    socket.on(EnigmaPulseEvents.INVITE_ACCEPTED, onInviteAccepted);
    socket.on(EnigmaPulseEvents.QUESTION_START, onQuestionStart);
    socket.on(EnigmaPulseEvents.TIMER_SYNC, onTimerSync);
    socket.on(EnigmaPulseEvents.ANSWER_RESULT, onAnswerResult);
    socket.on(EnigmaPulseEvents.NEXT_QUESTION, onNextQuestion);
    socket.on(EnigmaPulseEvents.SYNC_STATE, onSyncState);
    socket.on(EnigmaPulseEvents.MATCH_END, onMatchEnd);
    socket.on(EnigmaPulseEvents.ERROR, onErr);
    return () => {
      socket.off(EnigmaPulseEvents.WAITING, onWaiting);
      socket.off(EnigmaPulseEvents.MATCH_PREPARING, onMatchPreparing);
      socket.off(EnigmaPulseEvents.MATCH_FOUND, onMatchFound);
      socket.off(EnigmaPulseEvents.PRIVATE_CREATED, onPrivateCreated);
      socket.off(EnigmaPulseEvents.INVITE_ACCEPTED, onInviteAccepted);
      socket.off(EnigmaPulseEvents.QUESTION_START, onQuestionStart);
      socket.off(EnigmaPulseEvents.TIMER_SYNC, onTimerSync);
      socket.off(EnigmaPulseEvents.ANSWER_RESULT, onAnswerResult);
      socket.off(EnigmaPulseEvents.NEXT_QUESTION, onNextQuestion);
      socket.off(EnigmaPulseEvents.SYNC_STATE, onSyncState);
      socket.off(EnigmaPulseEvents.MATCH_END, onMatchEnd);
      socket.off(EnigmaPulseEvents.ERROR, onErr);
    };
  }, [gameUser?.uid]);

  useEffect(() => {
    if (!gameUser?.uid || status !== 'ended') return;
    let active = true;
    void (async () => {
      try {
        const data = await api.getRecentEnigmaResults({ gameKey: 'syllogism', limit: 5 });
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
  }, [gameUser?.uid, status]);

  const me = useMemo(
    () => room?.players?.find((player) => player.uid === gameUser?.uid),
    [room?.players, gameUser?.uid]
  );
  const opponent = useMemo(() => {
    if (!room?.players?.length || !gameUser?.uid) return null;
    return room.players.find((p) => p.uid !== gameUser.uid) || null;
  }, [room?.players, gameUser?.uid]);
  const isBotMatch = useMemo(
    () => Boolean(room?.players?.some((p) => p.isBot)),
    [room?.players]
  );
  // Product rule: Syllogism always runs exactly 10 questions per player.
  const totalQuestions = ENIGMA_PULSE.QUESTION_COUNT;
  const questionNumber = Math.min(ENIGMA_PULSE.QUESTION_COUNT, Number(room?.questionIndex || 0) + 1);
  const questionText = String(room?.question?.text || '');
  const { premises: questionPremises, question: questionAsk } = useMemo(
    () => splitQuestionDisplay(questionText),
    [questionText]
  );
  const options = Array.isArray(room?.question?.options) ? room.question.options.slice(0, 4) : [];
  const progressPercent = Math.max(0, Math.min(100, (questionNumber / totalQuestions) * 100));
  const opponentLabel = isBotMatch
    ? 'Bot'
    : String(opponent?.displayName || opponent?.name || 'Player').trim() || 'Player';

  const isAdmin = useMemo(
    () => String(gameUser?.email || '').toLowerCase().trim() === ADMIN_EMAIL,
    [gameUser?.email]
  );
  const questionId = String(room?.question?.id || '').trim();
  const canAdminManageQuestion =
    isAdmin && status === 'playing' && questionId && !questionId.startsWith('epq_');

  useEffect(() => {
    if (!isAdmin) return undefined;
    const onAdminSuccess = (payload) => {
      if (payload?.action === 'edit') {
        toast.success('Question updated in Firebase and live match.');
        setLocked(false);
        setSelectedOption('');
        setLastOutcome(null);
      }
      if (payload?.action === 'delete') {
        toast.success('Question deactivated and removed from this round.');
        setLocked(false);
        setSelectedOption('');
        setLastOutcome(null);
      }
    };
    const onAdminError = (payload) => {
      toast.error(String(payload?.message || 'Admin action failed'));
    };
    socket.on(EnigmaPulseEvents.ADMIN_ACTION_SUCCESS, onAdminSuccess);
    socket.on(EnigmaPulseEvents.ADMIN_ERROR, onAdminError);
    return () => {
      socket.off(EnigmaPulseEvents.ADMIN_ACTION_SUCCESS, onAdminSuccess);
      socket.off(EnigmaPulseEvents.ADMIN_ERROR, onAdminError);
    };
  }, [isAdmin]);

  const handleOpenEditModal = async () => {
    if (!canAdminManageQuestion) return;
    setEditLoading(true);
    try {
      const res = await api.getAdminQuestion(questionId);
      const fullQ = res.question;
      setEditFields({
        id: fullQ.id,
        question: fullQ.question ?? '',
        option1: fullQ.options?.[0] ?? '',
        option2: fullQ.options?.[1] ?? '',
        option3: fullQ.options?.[2] ?? '',
        option4: fullQ.options?.[3] ?? '',
        correctIndex: fullQ.correctIndex ?? 0,
        difficulty: fullQ.difficulty ?? 'medium',
        active: fullQ.active !== false,
        hint: fullQ.hint ?? '',
        explanation: fullQ.explanation ?? '',
      });
      setIsEditModalOpen(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to load question details');
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editFields || !room?.roomId) return;
    const options = [
      editFields.option1.trim(),
      editFields.option2.trim(),
      editFields.option3.trim(),
      editFields.option4.trim(),
    ];
    if (options.some((opt) => !opt)) {
      toast.error('All four options must be filled');
      return;
    }
    socket.emit(EnigmaPulseEvents.ADMIN_EDIT_QUESTION, {
      roomId: room.roomId,
      questionId: editFields.id,
      updateFields: {
        question: editFields.question.trim(),
        options,
        correctIndex: Number(editFields.correctIndex),
        difficulty: editFields.difficulty,
        active: editFields.active,
        hint: editFields.hint,
        explanation: editFields.explanation,
        gameType: 'enigma_pulse',
        type: 'syllogism',
        category: 'Syllogism',
      },
    });
    setIsEditModalOpen(false);
  };

  const handleDeleteQuestion = () => {
    if (!canAdminManageQuestion || !room?.roomId) return;
    if (
      !window.confirm(
        'Deactivate this question in Firebase and skip it in the live match? Players on this node will advance if it is the current round.'
      )
    ) {
      return;
    }
    socket.emit(EnigmaPulseEvents.ADMIN_DELETE_QUESTION, {
      roomId: room.roomId,
      questionId,
    });
  };

  const handleOptionClick = (option) => {
    if (!room?.question?.id || locked) return;
    setSelectedOption(String(option));
    setLocked(true);
    socket.emit(EnigmaPulseEvents.SUBMIT_ANSWER, {
      roomId: room.roomId,
      questionId: room.question.id,
      questionIndex: room.questionIndex,
      answerText: String(option),
    });
  };

  const returnToLobby = () => {
    setExitPending(true);
    socket.emit(EnigmaPulseEvents.RETURN_TO_LOBBY, { roomId: room?.roomId || '' });
    navigate('/enigmaPulseLobby');
  };

  const leaveGame = () => {
    if (!room?.roomId) {
      navigate('/enigmaPulseLobby');
      return;
    }
    setExitPending(true);
    socket.emit(EnigmaPulseEvents.LEAVE_MATCH, { roomId: room.roomId });
  };

  if (status === 'loading' || !ready) {
    return (
      <Layout>
        <SyllogismBackdrop>
          <EnigmaPulseBootView variant="generic" phase="connecting" headline="Loading" message="Loading Syllogism…" />
        </SyllogismBackdrop>
      </Layout>
    );
  }

  if (status === 'searching') {
    return (
      <Layout>
        <SyllogismBackdrop>
          <EnigmaPulseBootView
            variant="generic"
            phase="matchmaking"
            headline="Matchmaking"
            subtitle="Matchmaking window: 4 seconds."
            room={room}
          />
          <div className="sy-boot-actions">
            <button type="button" onClick={() => navigate('/enigmaPulseLobby')}>
              Cancel
            </button>
          </div>
        </SyllogismBackdrop>
      </Layout>
    );
  }

  if (status === 'waiting_invite') {
    return (
      <Layout>
        <SyllogismBackdrop>
          <div className="sy-card">
            <h2>Invite Room Ready</h2>
            <p>Share this link with your friend:</p>
            <input readOnly value={inviteLink} className="sy-invite-input" />
            <button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)} disabled={!inviteLink}>
              Copy Link
            </button>
          </div>
        </SyllogismBackdrop>
      </Layout>
    );
  }

  if (status === 'ended' && !result) {
    return (
      <Layout>
        <SyllogismBackdrop>
          <div className="sy-card sy-card--result">
            <h2>Finalizing results…</h2>
            <p>Hang tight while we close out the match.</p>
            <button type="button" onClick={() => navigate('/enigmaPulseLobby')}>
              Back To Lobby
            </button>
          </div>
        </SyllogismBackdrop>
      </Layout>
    );
  }

  if (status === 'ended' && result) {
    return (
      <Layout>
        <EnigmaPulseMatchResultView
          gameUser={gameUser}
          result={result}
          roomSnapshot={room}
          recentResults={recentResults}
          onBackToLobby={() => navigate('/enigmaPulseLobby')}
          gameLabel="Syllogism"
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <SyllogismBackdrop>
        {status === 'deck_preparing' || (status === 'playing' && room?.roomId && !room?.question?.id) ? (
          <EnigmaPulseBootView
            variant="generic"
            phase="preparing"
            headline="Calibrating"
            subtitle="Building question deck from the puzzle bank."
            room={room}
          />
        ) : null}
        <header className="sy-topbar">
          <span className="sy-mode-pill">
            <Target aria-hidden />
            {modeTitle(mode)}
          </span>
          <span className="sy-round">{`ROUND ${questionNumber}/${totalQuestions}`}</span>
        </header>

        <div className="sy-progress-track" role="progressbar" aria-valuenow={questionNumber} aria-valuemin={1} aria-valuemax={totalQuestions}>
          <span className="sy-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="sy-stats-row">
          <div className="sy-stat-card sy-stat-card--streak">
            <Flame aria-hidden />
            <div>
              <span className="sy-stat-label">Streak</span>
              <span className="sy-stat-value">{`${Number(me?.streak || 0)}×`}</span>
            </div>
          </div>
          <div className="sy-stat-card sy-stat-card--time">
            <Clock aria-hidden />
            <div>
              <span className="sy-stat-label">Time</span>
              <span className="sy-stat-value">{`${String(Math.max(0, secondsLeft)).padStart(2, '0')}s`}</span>
            </div>
          </div>
          <div className="sy-stat-card sy-stat-card--score">
            <Star aria-hidden />
            <div>
              <span className="sy-stat-label">Score</span>
              <span className="sy-stat-value">{String(Number(me?.score || 0))}</span>
            </div>
          </div>
          <div className="sy-stat-card sy-stat-card--opponent">
            {isBotMatch ? <Bot aria-hidden /> : <User aria-hidden />}
            <div>
              <span className="sy-stat-label">Opponent</span>
              <span className="sy-stat-value">{opponentLabel}</span>
            </div>
          </div>
        </div>

        <section className="sy-question-panel">
          <span className="sy-tag">LOGIC</span>
          {questionPremises ? <p className="sy-question-line sy-question-line--premises">{questionPremises}</p> : null}
          {questionAsk ? (
            <p className="sy-question-line sy-question-line--ask">{questionAsk}</p>
          ) : !questionPremises ? (
            <p className="sy-question-line sy-question-line--single">{questionText || 'Waiting for next question…'}</p>
          ) : null}
          {canAdminManageQuestion ? (
            <div className="GameView-Admin-button-container">
              <button
                type="button"
                disabled={editLoading}
                onClick={() => void handleOpenEditModal()}
                className="GameView-Admin-Edit-button"
              >
                {editLoading ? 'Loading…' : 'Edit Question'}
              </button>
              <button type="button" onClick={handleDeleteQuestion} className="GameView-Admin-Delete-button">
                Delete Question
              </button>
            </div>
          ) : null}
        </section>

        <section className="sy-options-grid">
          {options.map((opt, idx) => (
            <button
              key={`${idx}-${String(opt)}`}
              type="button"
              className={`sy-option sy-option--${OPTION_STYLE_SUFFIX[idx] || 'a'} ${selectedOption === String(opt) ? 'is-selected' : ''}`}
              onClick={() => handleOptionClick(opt)}
              disabled={locked}
            >
              <span className="sy-option-label">{OPTION_LABELS[idx]}</span>
              <span>{String(opt)}</span>
            </button>
          ))}
        </section>

        {lastOutcome ? (
          <section className={`sy-result-sheet ${lastOutcome.correct ? 'ok' : 'bad'}`}>
            <p>{lastOutcome.correct ? 'Correct' : 'Wrong'}</p>
            {lastOutcome.correctAnswer ? <p>{`Right answer: ${lastOutcome.correctAnswer}`}</p> : null}
          </section>
        ) : null}

        <section className="sy-footer-actions">
          <button type="button" className="sy-footer-btn sy-footer-btn--lobby" onClick={returnToLobby} disabled={exitPending}>
            <ArrowLeft aria-hidden />
            Return to Lobby
          </button>
          <button type="button" className="sy-footer-btn sy-footer-btn--leave" onClick={leaveGame} disabled={exitPending}>
            <Power aria-hidden />
            Leave Game
          </button>
        </section>

        {isEditModalOpen && editFields ? (
          <div className="AdminEditModal-overlay">
            <div className="AdminEditModal-container">
              <header className="AdminEditModal-header">
                <h2 className="AdminEditModal-title">Edit Syllogism Question</h2>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="AdminEditModal-close"
                >
                  &times;
                </button>
              </header>
              <form onSubmit={handleSaveEdit} className="AdminEditModal-body">
                <div className="AdminEditModal-field">
                  <label className="AdminEditModal-label">Question Text</label>
                  <textarea
                    required
                    rows={4}
                    value={editFields.question}
                    onChange={(e) => setEditFields({ ...editFields, question: e.target.value })}
                    className="AdminEditModal-textarea"
                  />
                </div>
                <div className="AdminEditModal-grid-2">
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Option 1</label>
                    <input
                      type="text"
                      required
                      value={editFields.option1}
                      onChange={(e) => setEditFields({ ...editFields, option1: e.target.value })}
                      className="AdminEditModal-input"
                    />
                  </div>
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Option 2</label>
                    <input
                      type="text"
                      required
                      value={editFields.option2}
                      onChange={(e) => setEditFields({ ...editFields, option2: e.target.value })}
                      className="AdminEditModal-input"
                    />
                  </div>
                </div>
                <div className="AdminEditModal-grid-2">
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Option 3</label>
                    <input
                      type="text"
                      required
                      value={editFields.option3}
                      onChange={(e) => setEditFields({ ...editFields, option3: e.target.value })}
                      className="AdminEditModal-input"
                    />
                  </div>
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Option 4</label>
                    <input
                      type="text"
                      required
                      value={editFields.option4}
                      onChange={(e) => setEditFields({ ...editFields, option4: e.target.value })}
                      className="AdminEditModal-input"
                    />
                  </div>
                </div>
                <div className="AdminEditModal-grid-2">
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Correct Option</label>
                    <select
                      value={editFields.correctIndex}
                      onChange={(e) => setEditFields({ ...editFields, correctIndex: e.target.value })}
                      className="AdminEditModal-select"
                    >
                      <option value={0}>Option 1</option>
                      <option value={1}>Option 2</option>
                      <option value={2}>Option 3</option>
                      <option value={3}>Option 4</option>
                    </select>
                  </div>
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Difficulty</label>
                    <select
                      value={editFields.difficulty}
                      onChange={(e) => setEditFields({ ...editFields, difficulty: e.target.value })}
                      className="AdminEditModal-select"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                <div className="AdminEditModal-grid-2">
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Hint</label>
                    <input
                      type="text"
                      value={editFields.hint}
                      onChange={(e) => setEditFields({ ...editFields, hint: e.target.value })}
                      className="AdminEditModal-input"
                    />
                  </div>
                  <div className="AdminEditModal-field">
                    <label className="AdminEditModal-label">Explanation</label>
                    <input
                      type="text"
                      value={editFields.explanation}
                      onChange={(e) => setEditFields({ ...editFields, explanation: e.target.value })}
                      className="AdminEditModal-input"
                    />
                  </div>
                </div>
                <div
                  className="AdminEditModal-checkbox-container"
                  onClick={() => setEditFields({ ...editFields, active: !editFields.active })}
                >
                  <input
                    type="checkbox"
                    checked={editFields.active}
                    onChange={() => {}}
                    className="AdminEditModal-checkbox"
                  />
                  <span className="AdminEditModal-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Active in question bank
                  </span>
                </div>
                <div className="AdminEditModal-footer">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="AdminEditModal-cancel-btn"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="AdminEditModal-save-btn">
                    Save to Firebase &amp; match
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </SyllogismBackdrop>
    </Layout>
  );
}