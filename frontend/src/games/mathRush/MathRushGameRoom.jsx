import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser } from '../../redux/features/auth.jsx';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { motion as Motion } from 'motion/react';
import { Toaster, toast } from 'sonner';
import confetti from 'canvas-confetti';

import MathRushHeader from './MathRushHeader.jsx';
import { AuthContext, GameContext } from './contexts.jsx';
import { StatsPanel, GamePanel, MatchStatsPanel } from './MathRushMatchPanels.jsx';
import MathRushMatchResults from './MathRushMatchResults.jsx';
import { api } from './api.js';
import './styles/lobby.css';
import {
    socket,
    connectSocket,
    ensureSocketConnected,
} from './lib/socket.js';
import { ensureGameUserFromAuth } from '../../utils/gameAuthSync.js';
import { auth } from '../../firebase/config.js';
import { useGameSession } from '../../context/GameSessionContext.jsx';
import { useUser } from '../../context/UserContext.jsx';
import { postGameReward } from '../../utils/postGameReward.js';
import { toSerializableFirebase } from '../../services/userService.js';

function normalizeUserProfile(data) {
    if (!data) return null;
    if (data.user && typeof data.user === 'object') return data.user;
    return data;
}

function inviteUrlForRoom(roomId) {
    if (typeof window === 'undefined') return `/mathRush/game/${roomId}`;
    return `${window.location.origin}/mathRush/game/${roomId}`;
}

/**
 * Dedicated match screen: `/mathRush/game/:roomId`
 * Quick match, private invite (waiting → playing), and refresh rejoin via `mathrush_join_private`.
 */
export default function MathRushGameRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const [match, setMatch] = useState(() => location.state?.match ?? null);
    const [difficulty, setDifficulty] = useState(location.state?.match?.difficulty ?? 'medium');
    const [currentInput, setCurrentInput] = useState('');
    const [timeLeft, setTimeLeft] = useState(15);
    const [roomError, setRoomError] = useState(null);
    const [rewardLoading, setRewardLoading] = useState(false);
    const [rewardError, setRewardError] = useState(null);
    const joinEmittedRef = useRef(false);

    const dispatch = useDispatch();
    const { refreshUser } = useUser();
    const {
        setSession,
        setTimer,
        setResult,
        setReward,
        setError,
        clearSession,
    } = useGameSession();

    useEffect(() => {
        joinEmittedRef.current = false;
    }, [roomId]);

    const goLobby = useCallback(() => {
        clearSession();
        navigate('/mathRushLobby', { replace: true });
    }, [clearSession, navigate]);

    useEffect(() => {
        const init = async () => {
            try {
                const synced = await ensureGameUserFromAuth();
                const u = synced;
                if (!u) {
                    setLoading(false);
                    return;
                }
                setUser(u);
                try {
                    const p = await api.getUser(u.uid);
                    setProfile(normalizeUserProfile(p));
                } catch {
                    const p = await api.createUser(u.uid, u.displayName || 'Player', u.photoURL || '');
                    setProfile(normalizeUserProfile(p));
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (match && roomId) {
            setSession({ gameType: 'math_rush', roomId, match });
        }
    }, [match, roomId, setSession]);

    useEffect(() => {
        setTimer(timeLeft);
    }, [timeLeft, setTimer]);

    const signOutUser = async () => {
        await firebaseSignOut(auth).catch(() => {});
        setUser(null);
        setProfile(null);
        goLobby();
    };

    const endMatch = useCallback(
        async (finalMatch) => {
            if (!finalMatch?.player1 || !finalMatch?.player2) return;

            setRewardError(null);
            setRewardLoading(true);
            setMatch({
                ...finalMatch,
                status: 'completed',
            });

            const win = finalMatch.winner === user?.uid;
            const draw = finalMatch.winner === 'draw';
            if (win) {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                toast.success('YOU WON!');
            } else if (draw) toast.info("It's a draw!");
            else toast.error('DEFEAT!');

            const self =
                user?.uid === finalMatch.player1?.uid
                    ? finalMatch.player1
                    : finalMatch.player2;
            let rewardPayload = null;
            try {
                if (self && !self.isBot && user) {
                    const result = draw ? 'draw' : win ? 'win' : 'lose';
                    const pr = await postGameReward({
                        gameType: 'math_rush',
                        result,
                        score: self.score ?? 0,
                    });
                    if (pr.ok) {
                        rewardPayload = pr.reward;
                        setReward(pr.reward);
                        if (pr.user) {
                            dispatch(setUser(toSerializableFirebase(pr.user)));
                        }
                        await refreshUser();
                        toast.success(
                            `Rewards: +${pr.reward?.coinsEarned ?? 0} coins` +
                                (pr.reward?.xpEarned ? `, +${pr.reward.xpEarned} XP` : '')
                        );
                        try {
                            const p = await api.getUser(user.uid);
                            setProfile(normalizeUserProfile(p));
                        } catch {
                            /* profile refresh optional */
                        }
                    } else {
                        setRewardError(pr.error || 'Reward failed');
                        if (pr.error !== 'Not authenticated') {
                            toast.error(pr.error);
                        }
                    }
                }
                setResult({
                    winner: finalMatch.winner,
                    match: finalMatch,
                    gameType: 'math_rush',
                });
            } catch (err) {
                console.error(err);
                const msg = err?.message || 'Reward failed';
                setRewardError(msg);
            } finally {
                setRewardLoading(false);
            }

            setMatch((prev) => ({
                ...(prev && prev.id === finalMatch.id ? prev : finalMatch),
                status: 'completed',
                endReason: finalMatch.endReason,
                rewards: rewardPayload
                    ? { xp: rewardPayload.xpEarned, coins: rewardPayload.coinsEarned }
                    : prev?.rewards,
            }));
        },
        [user, dispatch, refreshUser, setResult, setReward]
    );

    useEffect(() => {
        if (!user || !roomId) return;

        const applyIfRoom = (m) => {
            if (m?.id === roomId) {
                setMatch(m);
                setRoomError(null);
            }
        };

        const onTimer = (t) => setTimeLeft(t);
        const onUpdate = (m) => {
            applyIfRoom(m);
            setCurrentInput('');
        };
        const onEnded = (m) => {
            if (m?.id !== roomId) return;
            void endMatch(m);
        };

        const onPrivateCancelled = () => {
            toast.info('Private room closed.');
            goLobby();
        };

        const onRoomError = (payload) => {
            const msg = payload?.message || 'Could not join this room.';
            setRoomError(msg);
            setError(msg);
            toast.error(msg);
        };

        const onReconnectGrace = (p) => {
            if (p?.roomId !== roomId) return;
            if (p.disconnectedUid && p.disconnectedUid !== user.uid) {
                toast.message('Opponent disconnected — 10s reconnect window…');
            }
        };

        const onReconnectCleared = (p) => {
            if (p?.roomId !== roomId) return;
            if (p.uid && p.uid !== user.uid) {
                toast.success('Opponent reconnected.');
            }
        };

        connectSocket();
        socket.on('timer_update', onTimer);
        socket.on('update_game', onUpdate);
        socket.on('game_ended', onEnded);
        socket.on('game_started', applyIfRoom);
        socket.on('mathrush_private_cancelled', onPrivateCancelled);
        socket.on('math_rush:error', onRoomError);
        socket.on('mathrush_reconnect_grace', onReconnectGrace);
        socket.on('mathrush_reconnect_cleared', onReconnectCleared);

        let cancelled = false;
        if (!joinEmittedRef.current) {
            joinEmittedRef.current = true;
            void (async () => {
                try {
                    await ensureSocketConnected();
                    if (cancelled) return;
                    socket.emit('reconnect_user', user.uid);
                    socket.emit('mathrush_join_private', {
                        roomId,
                        uid: user.uid,
                        displayName: profile?.displayName || user.displayName || 'Player',
                        photoURL: profile?.photoURL || user.photoURL || '',
                    });
                } catch {
                    if (!cancelled) toast.error('Reconnecting to game server…');
                }
            })();
        }

        return () => {
            cancelled = true;
            socket.off('timer_update', onTimer);
            socket.off('update_game', onUpdate);
            socket.off('game_ended', onEnded);
            socket.off('game_started', applyIfRoom);
            socket.off('mathrush_private_cancelled', onPrivateCancelled);
            socket.off('math_rush:error', onRoomError);
            socket.off('mathrush_reconnect_grace', onReconnectGrace);
            socket.off('mathrush_reconnect_cleared', onReconnectCleared);
        };
    }, [user, roomId, profile, endMatch, goLobby, setError]);

    const submitAnswer = (answer) => {
        if (!match || !user || match.turn !== user.uid || match.id !== roomId) return;
        if (match.status !== 'playing') return;
        socket.emit('submit_answer', { roomId: match.id, answer, uid: user.uid });
        setCurrentInput('');
    };

    const quitMatch = () => {
        if (!match || !user) return;
        if (match.status !== 'playing') return;
        socket.emit('quit_game', { roomId: match.id, uid: user.uid });
    };

    const cancelPrivateRoom = () => {
        if (!roomId || !user) return;
        socket.emit('mathrush_cancel_private', { roomId, uid: user.uid });
        goLobby();
    };

    const copyInviteLink = async () => {
        const url = inviteUrlForRoom(roomId);
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
        } catch {
            toast.error('Could not copy');
        }
    };

    const resetAfterResult = () => {
        setMatch(null);
        setRewardError(null);
        setRewardLoading(false);
        goLobby();
    };

    const noOp = () => {};

    if (loading) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0F0C1D] text-white font-bold gap-2">
                <span className="animate-pulse">Loading match…</span>
                <span className="text-white/50 text-sm font-normal">Syncing profile and socket</span>
            </div>
        );
    }

    if (!user) {
        goLobby();
        return null;
    }

    const isWaitingHost =
        match?.status === 'waiting' &&
        match?.player1?.uid === user.uid &&
        match?.id === roomId;

    const isResultsView =
        match?.status === 'completed' &&
        match?.player1 &&
        match?.player2 &&
        match?.id === roomId;

    if (isResultsView) {
        return (
            <AuthContext.Provider value={{ user, profile, loading: false, signIn: noOp, signOut: signOutUser }}>
                <GameContext.Provider
                    value={{
                        match,
                        difficulty,
                        setDifficulty,
                        startMatch: noOp,
                        submitAnswer: noOp,
                        quitMatch: noOp,
                        resetMatch: resetAfterResult,
                        currentInput: '',
                        setCurrentInput: noOp,
                        timeLeft: 0,
                        isSearching: false,
                        cancelSearch: noOp,
                    }}
                >
                    <div className="game-root">
                        <MathRushHeader />
                        <MathRushMatchResults
                            match={match}
                            myUid={user.uid}
                            profile={profile}
                            rewardLoading={rewardLoading}
                            rewardError={rewardError}
                            onPlayAgain={resetAfterResult}
                            onExitToLobby={resetAfterResult}
                        />
                        <Toaster position="top-center" theme="dark" richColors />
                    </div>
                </GameContext.Provider>
            </AuthContext.Provider>
        );
    }

    if (isWaitingHost) {
        return (
            <AuthContext.Provider value={{ user, profile, loading: false, signIn: noOp, signOut: signOutUser }}>
                <div className="game-root">
                    <MathRushHeader />
                    <div className="mr-finding-shell flex items-center justify-center p-8">
                        <div className="text-center text-white/90 max-w-lg space-y-4">
                            <h2 className="text-xl font-bold">Private match</h2>
                            <p className="text-white/70 text-sm">
                                Share this link with your opponent. They must be logged in. No bot is used for private rooms.
                            </p>
                            <div className="flex flex-col gap-2 text-left">
                                <label className="text-xs text-white/50 uppercase tracking-wide">Invite URL</label>
                                <input
                                    readOnly
                                    className="w-full rounded-lg bg-[#1A162D] border border-white/10 px-3 py-2 text-sm text-white"
                                    value={inviteUrlForRoom(roomId)}
                                />
                            </div>
                            <div className="flex flex-wrap gap-3 justify-center pt-2">
                                <button type="button" onClick={copyInviteLink} className="MR-search-cancel-btn">
                                    Copy link
                                </button>
                                <button type="button" onClick={cancelPrivateRoom} className="MR-search-cancel-btn opacity-80">
                                    Cancel room
                                </button>
                            </div>
                        </div>
                    </div>
                    <Toaster position="top-center" theme="dark" richColors />
                </div>
            </AuthContext.Provider>
        );
    }

    const canPlay = match?.status === 'playing' && match?.player1 && match?.player2 && match.id === roomId;

    if (roomError && !canPlay && match?.status !== 'completed') {
        return (
            <div className="game-root">
                <MathRushHeader />
                <div className="mr-finding-shell flex items-center justify-center p-8">
                    <div className="text-center text-white/80 max-w-md">
                        <p className="mb-4">{roomError}</p>
                        <button type="button" onClick={goLobby} className="MR-search-cancel-btn mx-auto">
                            Back to lobby
                        </button>
                    </div>
                </div>
                <Toaster position="top-center" theme="dark" richColors />
            </div>
        );
    }

    if (!canPlay && match?.status !== 'completed') {
        return (
            <div className="game-root">
                <MathRushHeader />
                <div className="mr-finding-shell flex items-center justify-center p-8">
                    <div className="text-center text-white/80 max-w-md">
                        <p className="mb-4">Connecting to room…</p>
                        <button type="button" onClick={goLobby} className="MR-search-cancel-btn mx-auto">
                            Back to lobby
                        </button>
                    </div>
                </div>
                <Toaster position="top-center" theme="dark" richColors />
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, profile, loading: false, signIn: noOp, signOut: signOutUser }}>
            <GameContext.Provider
                value={{
                    match,
                    difficulty,
                    setDifficulty,
                    startMatch: noOp,
                    submitAnswer,
                    quitMatch,
                    resetMatch: resetAfterResult,
                    currentInput,
                    setCurrentInput,
                    timeLeft,
                    isSearching: false,
                    cancelSearch: noOp,
                }}
            >
                <div className="game-root">
                    <MathRushHeader />

                    <div className="mr-content-row mr-game-room-row">
                        <div className="mr-main-column">
                            <div className="game-layout mr-game-room-layout">
                                <Motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="game-stage"
                                >
                                    <div className="panel-left">
                                        <StatsPanel />
                                    </div>
                                    <GamePanel />
                                    <div className="panel-right">
                                        <MatchStatsPanel />
                                    </div>
                                </Motion.div>
                            </div>
                        </div>
                    </div>

                    <Toaster position="top-center" theme="dark" richColors />
                </div>
            </GameContext.Provider>
        </AuthContext.Provider>
    );
}
