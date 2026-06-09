import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, Bot, User as UserIcon } from 'lucide-react';
import { Toaster, toast } from 'sonner';

import Layout from '../Components/Layout';
import TriviaMatchResults from './TriviaMatchResults.jsx';
import '../lobbyPages/triviaGame.css';
import {
    socket,
    connectSocket,
    ensureSocketConnected,
} from './mathRush/lib/socket.js';
import { ensureGameUserFromAuth } from '../utils/gameAuthSync.js';
import { useGameSession } from '../context/GameSessionContext.jsx';
import { useUser } from '../context/UserContext.jsx';
import { api } from '../services/api.js';

function inviteUrlForRoom(roomId) {
    if (typeof window === 'undefined') return `/trivia/game/${roomId}`;
    return `${window.location.origin}/trivia/game/${roomId}`;
}

/** Avoid showing raw gRPC / Firestore index URLs in the game UI. */

function userFacingTriviaErrorMessage(raw) {
    const msg = String(raw || 'Room error').trim();
    if (/failed_precondition|requires an index/i.test(msg)) {
        return 'Quiz data is still updating. Please try again in a moment.';
    }
    return msg.replace(/https:\/\/console\.firebase\.google\.com[^\s]*/gi, '').trim() || 'Room error';
}

/** Aligns with backend `normalizeTriviaCategory` — only history + current_affairs use text stems today. */
function isHistoryOrCurrentAffairsCategory(category) {
    const c = String(category || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
    return c === 'history' || c === 'current_affairs';
}

export default function TriviaGameRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const returnGameId = location.state?.returnGameId || 'trivia';

    const [gameUser, setGameUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [match, setMatch] = useState(() => location.state?.match ?? null);
    const [secondsLeft, setSecondsLeft] = useState(15);
    const [roomError, setRoomError] = useState(null);
    const [ended, setEnded] = useState(null);
    const [rewardLoading, setRewardLoading] = useState(false);
    const [turnLogs, setTurnLogs] = useState([]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editFields, setEditFields] = useState(null);
    const [editLoading, setEditLoading] = useState(false);
    const [rematchStatus, setRematchStatus] = useState('idle');
    const [rematchError, setRematchError] = useState(null);
    const [rematchFromOpponent, setRematchFromOpponent] = useState(null);
    const joinEmittedRef = useRef(false);
    const prevMatchRef = useRef(null);

    const { refreshUser } = useUser();
    const {
        setSession,
        setTimer,
        setResult,
        setReward,
        setError,
        clearSession,
        lastReward,
    } = useGameSession();

    const goLobby = useCallback(() => {
        clearSession();
        navigate(`/triviaLobby/${returnGameId}`, { replace: true });
    }, [clearSession, navigate, returnGameId]);

    const handleExitToLobby = useCallback(() => {
        if (
            ended?.roomId &&
            (rematchStatus === 'waiting' || rematchStatus === 'pending')
        ) {
            socket.emit('trivia_decline_rematch', { sourceRoomId: ended.roomId });
        }
        goLobby();
    }, [ended?.roomId, rematchStatus, goLobby]);

    const handlePlayAgain = useCallback(async () => {
        if (!ended || !gameUser) return;
        if (rematchStatus === 'waiting' || rematchStatus === 'starting') return;

        const opponent = ended.players?.find((p) => p.uid !== gameUser.uid);
        try {
            await ensureSocketConnected();
            connectSocket();
            setRematchStatus('waiting');
            setRematchError(null);
            socket.emit('trivia_request_rematch', {
                sourceRoomId: ended.roomId,
                category: ended.category,
                difficulty: ended.difficulty,
                opponentUid: opponent?.uid,
                displayName: gameUser.displayName || 'Player',
                photoURL: gameUser.photoURL || '',
            });
        } catch {
            setRematchStatus('failed');
            setRematchError('Cannot reach game server');
            toast.error('Cannot reach game server');
        }
    }, [ended, gameUser, rematchStatus]);

    useEffect(() => {
        if (ended?.roomId) {
            setRematchStatus('idle');
            setRematchError(null);
            setRematchFromOpponent(null);
        }
    }, [ended?.roomId]);

    useEffect(() => {
        joinEmittedRef.current = false;
    }, [roomId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const u = await ensureGameUserFromAuth();
            if (cancelled) return;
            if (!u) {
                setLoading(false);
                return;
            }
            setGameUser(u);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (match && roomId) {
            setSession({ gameType: 'trivia', roomId, match });
        }
    }, [match, roomId, setSession]);

    useEffect(() => {
        setTimer(secondsLeft);
    }, [secondsLeft, setTimer]);

    useEffect(() => {
        if (!gameUser || !roomId) return;

        const applyMatch = (m) => {
            if (m?.roomId === roomId) {
                // Build lightweight per-turn correctness log from server score deltas.
                const prev = prevMatchRef.current;
                if (prev?.gameState && m?.gameState) {
                    const prevIdx = prev.gameState.currentQuestionIndex ?? -1;
                    const nextIdx = m.gameState.currentQuestionIndex ?? -1;
                    const prevP1 = prev.players?.[0]?.score ?? 0;
                    const prevP2 = prev.players?.[1]?.score ?? 0;
                    const nextP1 = m.players?.[0]?.score ?? 0;
                    const nextP2 = m.players?.[1]?.score ?? 0;
                    // Question advanced -> evaluate who gained points on the completed turn.
                    if (nextIdx > prevIdx) {
                        const actorUid = prev.gameState.currentTurnUid;
                        const actorIsP1 = prev.players?.[0]?.uid === actorUid;
                        const before = actorIsP1 ? prevP1 : prevP2;
                        const after = actorIsP1 ? nextP1 : nextP2;
                        const correct = after > before;
                        const actorName = actorUid === gameUser.uid
                            ? 'You'
                            : (prev.players?.find((p) => p.uid === actorUid)?.displayName || 'Opponent');
                        setTurnLogs((logs) => [
                            ...logs,
                            { question: prevIdx + 1, actorName, correct },
                        ].slice(-8));
                    }
                }
                setMatch(m);
                prevMatchRef.current = m;
                setRoomError(null);
            }
        };

        const onTimer = (p) => {
            if (p?.roomId === roomId && typeof p.secondsLeft === 'number') {
                setSecondsLeft(p.secondsLeft);
            }
        };

        const onEnded = (m) => {
            if (m?.roomId !== roomId) return;
            setMatch(m);
            setEnded(m);
            const me = gameUser.uid;
            const w = m.gameState?.winner;
            if (w === me) toast.success('You won!');
            else if (w === 'draw') toast.info("It's a draw!");
            else toast.error('You lost');

            const self = m.players?.find((p) => p.uid === me);
            const myProg = (m.progression || []).find((p) => p.uid === me);
            if (myProg) {
                setReward({
                    coinsEarned: myProg.coinsGained,
                    xpEarned: myProg.xpGained,
                    baseCoins: myProg.baseCoins,
                    baseXp: myProg.baseXp,
                    bonusCoins: myProg.bonusCoins,
                    bonusXp: myProg.bonusXp,
                    performanceBreakdown: myProg.performanceBreakdown,
                });
            }

            setRewardLoading(true);
            void (async () => {
                try {
                    if (self && !self.isBot && myProg) {
                        await refreshUser();
                        const bonusNote =
                            Number(myProg.bonusCoins || 0) > 0 || Number(myProg.bonusXp || 0) > 0
                                ? ' (includes performance bonus)'
                                : '';
                        toast.success(
                            `Rewards: +${myProg.coinsGained ?? 0} coins` +
                                (myProg.xpGained ? `, +${myProg.xpGained} XP` : '') +
                                bonusNote
                        );
                    }
                    setResult({
                        winner: w,
                        match: m,
                        gameType: 'trivia',
                    });
                } finally {
                    setRewardLoading(false);
                }
            })();
        };

        const onCancelled = () => {
            toast.info('Private room closed.');
            goLobby();
        };

        const onErr = (p) => {
            const msg = userFacingTriviaErrorMessage(p?.message || 'Room error');
            setRoomError(msg);
            setError(msg);
            toast.error(msg);
        };

        const onReconnectGrace = (p) => {
            if (p?.roomId !== roomId) return;
            if (p.disconnectedUid && p.disconnectedUid !== gameUser.uid) {
                toast.message('Opponent disconnected — 10s reconnect window…');
            }
        };

        const onReconnectCleared = (p) => {
            if (p?.roomId !== roomId) return;
            if (p.uid && p.uid !== gameUser.uid) {
                toast.success('Opponent reconnected.');
            }
        };

        const onAdminSuccess = (p) => {
            if (p.action === 'delete') {
                toast.success('Question deleted successfully!');
            } else if (p.action === 'edit') {
                toast.success('Question updated successfully!');
                setIsEditModalOpen(false);
            }
        };

        const onAdminError = (p) => {
            toast.error(p?.message || 'Admin action failed');
        };

        connectSocket();

        socket.on('trivia_update_game', applyMatch);
        socket.on('trivia_game_started', applyMatch);
        socket.on('trivia_timer_update', onTimer);
        socket.on('trivia_game_ended', onEnded);
        socket.on('trivia_private_cancelled', onCancelled);
        socket.on('trivia_error', onErr);
        socket.on('trivia_reconnect_grace', onReconnectGrace);
        socket.on('trivia_reconnect_cleared', onReconnectCleared);
        socket.on('trivia_admin_action_success', onAdminSuccess);
        socket.on('trivia_admin_error', onAdminError);

        let cancelled = false;
        if (!joinEmittedRef.current) {
            joinEmittedRef.current = true;
            void (async () => {
                try {
                    await ensureSocketConnected();
                    if (cancelled) return;
                    socket.emit('reconnect_user', gameUser.uid);
                    socket.emit('trivia_reconnect_user', gameUser.uid);
                    socket.emit('trivia_join_private', {
                        roomId,
                        uid: gameUser.uid,
                        displayName: gameUser.displayName || 'Player',
                        photoURL: gameUser.photoURL || '',
                    });
                } catch {
                    if (!cancelled) toast.error('Reconnecting to game server…');
                }
            })();
        }

        return () => {
            cancelled = true;
            socket.off('trivia_update_game', applyMatch);
            socket.off('trivia_game_started', applyMatch);
            socket.off('trivia_timer_update', onTimer);
            socket.off('trivia_game_ended', onEnded);
            socket.off('trivia_private_cancelled', onCancelled);
            socket.off('trivia_error', onErr);
            socket.off('trivia_reconnect_grace', onReconnectGrace);
            socket.off('trivia_reconnect_cleared', onReconnectCleared);
            socket.off('trivia_admin_action_success', onAdminSuccess);
            socket.off('trivia_admin_error', onAdminError);
        };
    }, [gameUser, roomId, goLobby, refreshUser, setResult, setReward, setError]);

    useEffect(() => {
        if (!ended || !gameUser) return;

        const sourceRoomId = ended.roomId;

        const onRematchWaiting = (p) => {
            if (p?.sourceRoomId !== sourceRoomId) return;
            setRematchStatus('waiting');
            setRematchError(null);
        };

        const onRematchPending = (p) => {
            if (p?.sourceRoomId !== sourceRoomId) return;
            setRematchStatus('pending');
            setRematchFromOpponent({
                displayName: p.fromDisplayName || 'Opponent',
            });
            setRematchError(null);
        };

        const onRematchFailed = (p) => {
            if (p?.sourceRoomId && p.sourceRoomId !== sourceRoomId) return;
            setRematchStatus('failed');
            const msg = p?.message || 'Rematch unavailable';
            setRematchError(msg);
            toast.error(msg);
        };

        const onRematchGameStarted = (m) => {
            if (!m?.roomId || m.roomId === sourceRoomId) return;
            setRematchStatus('starting');
            setEnded(null);
            setTurnLogs([]);
            setRematchError(null);
            setRematchFromOpponent(null);
            prevMatchRef.current = null;
            joinEmittedRef.current = false;
            navigate(`/trivia/game/${m.roomId}`, {
                replace: true,
                state: { match: m, returnGameId },
            });
        };

        connectSocket();
        socket.on('trivia_rematch_waiting', onRematchWaiting);
        socket.on('trivia_rematch_pending', onRematchPending);
        socket.on('trivia_rematch_failed', onRematchFailed);
        socket.on('trivia_game_started', onRematchGameStarted);

        return () => {
            socket.off('trivia_rematch_waiting', onRematchWaiting);
            socket.off('trivia_rematch_pending', onRematchPending);
            socket.off('trivia_rematch_failed', onRematchFailed);
            socket.off('trivia_game_started', onRematchGameStarted);
        };
    }, [ended, gameUser, navigate, returnGameId]);

    const cancelPrivateRoom = () => {
        if (!roomId || !gameUser) return;
        socket.emit('trivia_cancel_private', { roomId, uid: gameUser.uid });
        goLobby();
    };

    const copyInviteLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteUrlForRoom(roomId));
            toast.success('Link copied');
        } catch {
            toast.error('Could not copy');
        }
    };

    const submitAnswer = (idx) => {
        if (!match || match.status !== 'playing' || !gameUser) return;
        if (match.gameState?.currentTurnUid !== gameUser.uid) return;
        socket.emit('trivia_submit_answer', {
            roomId,
            uid: gameUser.uid,
            selectedIndex: idx,
        });
    };

    const isAdmin = gameUser?.email === 'info@aljazeeragc.com';

    const handleDeleteQuestion = (questionId) => {
        if (!window.confirm('Are you sure you want to delete this question? This will remove it from the database.')) {
            return;
        }
        socket.emit('trivia_admin_delete_question', { roomId, questionId });
    };

    const handleOpenEditModal = async (q) => {
        setEditLoading(true);
        try {
            const res = await api.getAdminQuestion(q.id);
            const fullQ = res.question;
            setEditFields({
                id: fullQ.id,
                question: fullQ.question ?? '',
                option1: fullQ.options?.[0] ?? '',
                option2: fullQ.options?.[1] ?? '',
                option3: fullQ.options?.[2] ?? '',
                option4: fullQ.options?.[3] ?? '',
                correctIndex: fullQ.correctIndex ?? 0,
                category: fullQ.category ?? 'history',
                difficulty: fullQ.difficulty ?? 'easy',
                active: fullQ.active !== false,
                gameType: fullQ.gameType ?? 'trivia',
                type: fullQ.type ?? '',
                sequence: Array.isArray(fullQ.sequence) ? fullQ.sequence.join(', ') : (fullQ.sequence || ''),
                patternKind: fullQ.patternKind ?? '',
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
        if (!editFields) return;

        const options = [
            editFields.option1.trim(),
            editFields.option2.trim(),
            editFields.option3.trim(),
            editFields.option4.trim()
        ];

        if (options.some(opt => !opt)) {
            toast.error('All four options must be filled');
            return;
        }

        const updatePayload = {
            question: editFields.question.trim(),
            options,
            correctIndex: Number(editFields.correctIndex),
            category: editFields.category,
            difficulty: editFields.difficulty,
            active: editFields.active,
            gameType: editFields.gameType,
            type: editFields.type,
            sequence: editFields.sequence.split(',').map(s => s.trim()).filter(Boolean),
            patternKind: editFields.patternKind,
            hint: editFields.hint,
            explanation: editFields.explanation,
        };

        socket.emit('trivia_admin_edit_question', {
            roomId,
            questionId: editFields.id,
            updateFields: updatePayload
        });
    };

    if (loading) {
        return (
            <Layout>
                <div className="TopLobby-container flex flex-col items-center justify-center min-h-[50vh] text-white gap-2">
                    <div className="animate-pulse font-semibold">Loading match…</div>
                    <p className="text-white/60 text-sm">Syncing account and socket</p>
                </div>
            </Layout>
        );
    }

    if (!gameUser) {
        return <Navigate to={`/triviaLobby/${returnGameId}`} replace />;
    }

    const isHostWaiting =
        match?.status === 'waiting' &&
        match?.players?.[0]?.uid === gameUser.uid &&
        match?.roomId === roomId;

    if (isHostWaiting) {
        return (
            <Layout>
                <div className="TopLobby-container flex flex-col items-center justify-center min-h-[70vh] p-6 text-white gap-6">
                    <h2 className="text-xl font-bold">Private match</h2>
                    <p className="text-white/70 text-center max-w-md text-sm">
                        Share this link with your opponent. They must be logged in. No bot is used for private
                        rooms.
                    </p>
                    <input
                        readOnly
                        className="w-full max-w-lg rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm text-white"
                        value={inviteUrlForRoom(roomId)}
                    />
                    <div className="flex flex-wrap gap-3 justify-center">
                        <button type="button" onClick={copyInviteLink} className="GameView-TimerContainer-button">
                            Copy link
                        </button>
                        <button type="button" onClick={cancelPrivateRoom} className="GameView-TimerContainer-button">
                            Cancel room
                        </button>
                    </div>
                    <Toaster position="top-center" theme="dark" richColors />
                </div>
            </Layout>
        );
    }

    if (roomError && !match) {
        return (
            <Layout>
                <div className="TopLobby-container flex flex-col items-center justify-center min-h-[50vh] p-6 text-white gap-4">
                    <p className="text-center max-w-md">{roomError}</p>
                    <button type="button" onClick={goLobby} className="GameView-TimerContainer-button">
                        Back to lobby
                    </button>
                    <Toaster position="top-center" theme="dark" richColors />
                </div>
            </Layout>
        );
    }

    const playing = match?.status === 'playing';
    const cq = match?.gameState?.currentQuestion;
    const p1 = match?.players?.[0];
    const p2 = match?.players?.[1];
    const myUid = gameUser.uid;
    const isMyTurn = playing && match.gameState?.currentTurnUid === myUid;
    const totalQ = match?.gameState?.questions?.length ?? 10;
    const qIdx = match?.gameState?.currentQuestionIndex ?? 0;

    if (ended) {
        return (
            <>
                <TriviaMatchResults
                    endedMatch={ended}
                    myUid={myUid}
                    onPlayAgain={handlePlayAgain}
                    onExitToLobby={handleExitToLobby}
                    reward={lastReward}
                    rewardLoading={rewardLoading}
                    rematchStatus={rematchStatus}
                    rematchError={rematchError}
                    rematchFromOpponent={rematchFromOpponent}
                />
                <Toaster position="top-center" theme="dark" richColors />
            </>
        );
    }

    if (!playing || !cq) {
        return (
            <Layout>
                <div className="TopLobby-container flex flex-col items-center justify-center min-h-[50vh] text-white gap-4">
                    <div className="animate-pulse font-semibold">Connecting to room…</div>
                    {roomError ? (
                        <p className="text-red-400 text-sm max-w-md text-center">{roomError}</p>
                    ) : (
                        <p className="text-white/60 text-sm">Waiting for server state</p>
                    )}
                    <button type="button" onClick={goLobby} className="GameView-TimerContainer-button">
                        Back to lobby
                    </button>
                    <Toaster position="top-center" theme="dark" richColors />
                </div>
            </Layout>
        );
    }

    const opponent = p1?.uid === myUid ? p2 : p1;
    const myScore = p1?.uid === myUid ? p1.score : p2?.score;
    const oppScore = p1?.uid === myUid ? p2?.score : p1?.score;
    const proseCategory = isHistoryOrCurrentAffairsCategory(match?.category ?? 'history');
    const estMyCorrect = Math.max(0, Math.floor((myScore ?? 0) / 10));
    const estCoinsEarned = estMyCorrect * 2;
    const estXpEarned = estMyCorrect * 3;

    return (
        <Layout>
            <div className="GameView-container">
                {roomError ? (
                    <div className="mx-4 mt-2 rounded-lg bg-red-950/80 border border-red-500/40 px-3 py-2 text-red-200 text-sm">
                        {roomError}
                    </div>
                ) : null}
                <div className="GameView-Header-container">
                    <div className="GameView-Header-Subcontainer">
                        <div className="GameView-Header-Subcontainer-left flex items-center gap-6 flex-wrap">
                            <div>
                                <p className="GameView-User-Name">{gameUser.displayName}</p>
                                <p className="GameView-User-Score">Score: {myScore ?? 0}</p>
                            </div>
                            <div className="GameView-Header-Subcontainer-right h-8 w-px bg-zinc-800" />
                            <div>
                                <p className="GameBot-User-Name">
                                    {opponent?.isBot ? 'AI opponent' : opponent?.displayName || 'Opponent'}
                                </p>
                                <p className="GameBot-User-Score">Score: {oppScore ?? 0}</p>
                            </div>
                        </div>
                        <div className="GameView-TimerContainer flex items-center gap-4 flex-wrap">
                            <div className="question-timer">
                                <Timer size={16} className={secondsLeft < 5 ? 'text-red-500' : 'text-emerald-500'} />
                                <span className={secondsLeft < 5 ? 'text-red-500' : 'text-white'}>{secondsLeft}s</span>
                            </div>
                            <span className="text-white/80 text-sm font-semibold">
                                Q {qIdx + 1}/{totalQ}
                            </span>
                            <button type="button" onClick={goLobby} className="GameView-TimerContainer-button">
                                Leave
                            </button>
                        </div>
                    </div>
                </div>

                <div className="gamedisplay-container">
                    <div className="gamedisplay-left w-full max-w-3xl mx-auto">
                        <div className="relative">
                            {cq?.text ? (
                                <div className="mb-4 rounded-xl border border-white/10 bg-zinc-900/60 p-4">
                                    <p
                                        className={
                                            proseCategory
                                                ? 'trivia-room-question-stem'
                                                : 'text-white text-lg font-semibold leading-relaxed'
                                        }
                                    >
                                        {cq.text}
                                    </p>
                                    {isAdmin && (
                                        <div className="GameView-Admin-button-container">
                                            <button
                                                type="button"
                                                disabled={editLoading}
                                                onClick={() => handleOpenEditModal(cq)}
                                                className="GameView-Admin-Edit-button"
                                            >
                                                {editLoading ? 'Loading...' : 'Edit Question'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteQuestion(cq.id)}
                                                className="GameView-Admin-Delete-button"
                                            >
                                                Delete Question
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                            {cq.imageUrl ? (
                                <img
                                    src={cq.imageUrl}
                                    alt=""
                                    className="rounded-3xl max-h-64 w-full object-contain bg-zinc-900/50"
                                />
                            ) : null}
                            <AnimatePresence>
                                {!isMyTurn && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="game-question-overlay absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl"
                                    >
                                        <div className="text-center space-y-2 p-4">
                                            {opponent?.isBot ? (
                                                <Bot size={40} className="mx-auto text-white" />
                                            ) : (
                                                <UserIcon size={40} className="mx-auto text-white" />
                                            )}
                                            <p className="text-white font-bold text-lg">
                                                {opponent?.isBot ? 'AI is thinking…' : "Opponent's turn"}
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className="gamedisplay-options mt-4">
                            {(cq.options || []).map((opt, idx) => (
                                <button
                                    type="button"
                                    key={`${cq.id}-${idx}`}
                                    onClick={() => submitAnswer(idx)}
                                    disabled={!isMyTurn}
                                    className={`option-btn ${isMyTurn ? 'clickable' : 'disabled'}`}
                                >
                                    <div className="option-content">
                                        <div className="option-content-icon">{idx + 1}</div>
                                        <div className="option-content-text">
                                            <span className="option-content-text-large">{opt}</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Right rail restored: timer, live progress, and per-turn result board. */}
                    <aside className="gamedisplay-sidebar">
                        <div className="performance-stats-container">
                            <h3 className="performance-title">Live Match Stats</h3>
                            <div className="stat-item">
                                <span className="stat-label">Question Timer</span>
                                <span className="stat-value">{secondsLeft}s</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Your Correct</span>
                                <span className="stat-value">{estMyCorrect}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Est. Coins (live)</span>
                                <span className="stat-value">+{estCoinsEarned}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Est. XP (live)</span>
                                <span className="stat-value">+{estXpEarned}</span>
                            </div>
                            <p className="text-xs text-white/60 mt-2">
                                Final rewards are settled by server on match end.
                            </p>
                        </div>

                        <div className="performance-stats-container mt-4">
                            <h3 className="performance-title">Turn Board</h3>
                            {turnLogs.length === 0 ? (
                                <p className="text-xs text-white/60">No completed turns yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {turnLogs.map((log, idx) => (
                                        <div key={`${log.question}-${idx}`} className="stat-item">
                                            <span className="stat-label">Q{log.question} · {log.actorName}</span>
                                            <span className={log.correct ? 'match-log-status-correct' : 'match-log-status-wrong'}>
                                                {log.correct ? 'Correct' : 'Wrong'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
            {isEditModalOpen && editFields && (
                <div className="AdminEditModal-overlay">
                    <div className="AdminEditModal-container">
                        <header className="AdminEditModal-header">
                            <h2 className="AdminEditModal-title">Edit Question</h2>
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
                                    rows={3}
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
                                    <label className="AdminEditModal-label">Category</label>
                                    <select
                                        value={editFields.category}
                                        onChange={(e) => setEditFields({ ...editFields, category: e.target.value })}
                                        className="AdminEditModal-select"
                                    >
                                        <option value="history">History</option>
                                        <option value="current_affairs">Current Affairs</option>
                                        <option value="sports">Sports</option>
                                        <option value="science">Science</option>
                                        <option value="geography">Geography</option>
                                        <option value="entertainment">Entertainment</option>
                                        <option value="gaming">Gaming</option>
                                        <option value="pop_culture">Pop Culture</option>
                                    </select>
                                </div>
                            </div>

                            <div className="AdminEditModal-grid-2">
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
                                <div className="AdminEditModal-field">
                                    <label className="AdminEditModal-label">Game Type</label>
                                    <select
                                        value={editFields.gameType}
                                        onChange={(e) => setEditFields({ ...editFields, gameType: e.target.value })}
                                        className="AdminEditModal-select"
                                    >
                                        <option value="trivia">Trivia</option>
                                        <option value="enigma_pulse">Enigma Pulse</option>
                                    </select>
                                </div>
                            </div>

                            <div className="AdminEditModal-grid-2">
                                <div className="AdminEditModal-field">
                                    <label className="AdminEditModal-label">Question Type</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. text, multiple"
                                        value={editFields.type}
                                        onChange={(e) => setEditFields({ ...editFields, type: e.target.value })}
                                        className="AdminEditModal-input"
                                    />
                                </div>
                                <div className="AdminEditModal-field">
                                    <label className="AdminEditModal-label">Pattern Kind</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. general"
                                        value={editFields.patternKind}
                                        onChange={(e) => setEditFields({ ...editFields, patternKind: e.target.value })}
                                        className="AdminEditModal-input"
                                    />
                                </div>
                            </div>

                            <div className="AdminEditModal-field">
                                <label className="AdminEditModal-label">Sequence (comma-separated if array)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 1, 2, 3"
                                    value={editFields.sequence}
                                    onChange={(e) => setEditFields({ ...editFields, sequence: e.target.value })}
                                    className="AdminEditModal-input"
                                />
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

                            <div className="AdminEditModal-checkbox-container" onClick={() => setEditFields({ ...editFields, active: !editFields.active })}>
                                <input
                                    type="checkbox"
                                    checked={editFields.active}
                                    onChange={() => { }}
                                    className="AdminEditModal-checkbox"
                                />
                                <span className="AdminEditModal-label" style={{ margin: 0, cursor: 'pointer' }}>Active in pool</span>
                            </div>

                            <div className="AdminEditModal-footer">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="AdminEditModal-cancel-btn"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="AdminEditModal-save-btn"
                                >
                                    Save changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <Toaster position="top-center" theme="white" richColors />
        </Layout>
    );
}
