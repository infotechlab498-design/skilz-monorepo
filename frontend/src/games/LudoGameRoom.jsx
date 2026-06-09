import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

import Layout from '../Components/Layout';
import ErrorBoundary from '../Components/ErrorBoundary';
import { useLudoGame } from './ludoGame/hooks/useLudoGame';
import { LudoRoom } from './ludoGame/components/LudoRoom';
import { GameStatus, PlayerType } from './ludoGame/types';
import { initialGameState } from './ludoGame/engine/reducer';
import { socketService } from '../services/socketService';
import { ensureGameUserFromAuth, getJwtUserId } from '../utils/gameAuthSync';
import { useGameSession } from '../context/GameSessionContext.jsx';
import { startUserPresence } from '../services/presenceService.js';
import './ludo.css';

function inviteUrl(roomId) {
    if (typeof window === 'undefined') return `/ludo/game/${roomId}`;
    return `${window.location.origin}/ludo/game/${roomId}`;
}

export default function LudoGameRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const inviteIdForJoin =
        typeof location.state?.inviteId === 'string' ? location.state.inviteId.trim() : '';
    const { user: authUser } = useSelector((s) => s.auth);
    const { setSession, clearSession, setError } = useGameSession();

    const { state, rollDice, moveToken, resetGame, quitMatch, hydrateGame, validMoves } =
        useLudoGame({ socketRoomId: roomId || null });

    const [syncReady, setSyncReady] = useState(false);
    const [roomErr, setRoomErr] = useState(null);
    const [voteNowMs, setVoteNowMs] = useState(Date.now());

    const uid = useMemo(
        () => authUser?.uid || getJwtUserId() || null,
        [authUser]
    );

    const displayName = useMemo(
        () =>
            authUser?.username ||
            authUser?.displayName ||
            authUser?.name ||
            'Player',
        [authUser]
    );

    const hostUid = state?.lobby?.hostUid ?? state?.meta?.hostUid;
    const isHost =
        Boolean(location.state?.isHost) ||
        Boolean(hostUid && uid && String(hostUid) === String(uid));

    const displayValidMoves = useMemo(() => {
        if (state.status !== GameStatus.PLAYING) return validMoves;
        const cur = state.players?.[state.currentTurn];
        if (!cur || cur.type !== PlayerType.HUMAN || !uid) return validMoves;
        const pid = String(cur.id || '');
        const auth = String(uid);
        const seatedMe =
            pid === auth || pid.startsWith(`${auth}_seat_`);
        if (!seatedMe) return [];
        return validMoves;
    }, [state.status, state.players, state.currentTurn, uid, validMoves]);

    useEffect(() => {
        if (!roomId) return;
        hydrateGame({
            ...initialGameState,
            gameId: roomId,
            status: GameStatus.LOBBY,
        });
    }, [roomId, hydrateGame]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await ensureGameUserFromAuth();
            if (!cancelled) setSyncReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!uid) return undefined;
        startUserPresence(uid, 'ludo-game');
        return () => {
            startUserPresence(uid, 'lobby');
        };
    }, [uid]);

    useEffect(() => {
        if (!roomId || !syncReady || !uid) return;

        let cancelled = false;
        let socket = null;

        const onErr = (e) => {
            const msg = e?.message || 'Ludo error';
            const code = e?.code;
            setRoomErr(msg);
            setError({ message: msg, code });
            if (code === 'ROOM_NOT_FOUND' || code === 'HOST_LEFT') {
                setTimeout(() => navigate('/ludoLobby', { replace: true }), 1600);
            }
        };

        const doJoin = () => {
            const s = socketService.getSocket();
            if (!s?.connected) return;
            s.emit('ludo:joinRoom', {
                roomId,
                displayName,
                ...(inviteIdForJoin ? { inviteId: inviteIdForJoin } : {}),
            });
        };

        const onConnect = () => {
            doJoin();
        };

        void (async () => {
            try {
                socket = await socketService.ensureConnected({ forceRefresh: false });
                if (cancelled) return;
                socket.on('ludo:error', onErr);
                socket.on('connect', onConnect);
                doJoin();
            } catch (e) {
                if (!cancelled) setRoomErr(e?.message || 'Could not connect');
            }
        })();

        return () => {
            cancelled = true;
            if (socket) {
                socket.off('ludo:error', onErr);
                socket.off('connect', onConnect);
            }
        };
    }, [roomId, syncReady, uid, displayName, navigate, setError, inviteIdForJoin]);

    useEffect(() => {
        if (!roomId) return;
        const members = state?.lobby?.members;
        setSession({
            gameType: 'ludo',
            roomId,
            match: {
                players: Array.isArray(members) ? members : [],
                status: state.status,
            },
        });
    }, [roomId, state?.lobby?.members, state.status, setSession]);

    const handleLeave = useCallback(() => {
        if (roomId) {
            socketService.emit('ludo:leaveRoom', { roomId });
        }
        clearSession();
        quitMatch();
        navigate('/ludoLobby', { replace: true });
    }, [roomId, clearSession, quitMatch, navigate]);

    const handleStart = useCallback(() => {
        if (!roomId || !uid) return;
        setRoomErr(null);
        socketService.emit('ludo:startGame', { roomId });
    }, [roomId, uid]);

    const lobby = state?.lobby;
    const inLobby = state?.status === GameStatus.LOBBY && lobby;
    const soloFallback = Boolean(
        state?.meta?.soloFallback ?? lobby?.meta?.soloFallback ?? state?.lobby?.soloFallback
    );
    const vote = lobby?.vote || null;
    const voteOpen = Boolean(vote?.open);
    const myVote = vote && uid ? vote.votesByUid?.[uid] || null : null;
    const voteSecondsLeft = voteOpen
        ? Math.max(0, Math.ceil((Number(vote.deadlineAt || 0) - voteNowMs) / 1000))
        : 0;
    const memberCount = Array.isArray(lobby?.members) ? lobby.members.length : 0;
    const isLobbyFull = inLobby && Number(lobby?.maxPlayers || 0) > 0 && memberCount >= Number(lobby?.maxPlayers || 0);

    useEffect(() => {
        if (!voteOpen) return undefined;
        const tid = setInterval(() => setVoteNowMs(Date.now()), 1000);
        return () => clearInterval(tid);
    }, [voteOpen]);

    const submitVote = useCallback((choice) => {
        if (!roomId || !voteOpen) return;
        socketService.emit('ludo:submitVote', { roomId, choice });
    }, [roomId, voteOpen]);

    if (!roomId) {
        navigate('/ludoLobby', { replace: true });
        return null;
    }

    if (!uid) {
        return (
            <Layout>
                <div className="app-container ludo-signin-required">
                    <p>Sign in required.</p>
                </div>
            </Layout>
        );
    }

    if (!syncReady) {
        return (
            <Layout>
                <div className="app-container">
                    <p className="ludo-muted-text">Loading room…</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <ErrorBoundary>
                <div className="app-container">
                    <header className="main-header ludo-room-header">
                        <h1>
                            Ludo <span>Master</span>
                        </h1>
                        <p>Online room — share link to invite players</p>
                    </header>

                    {roomErr && (
                        <div role="alert" className="ludo-alert-error ludo-room-alert">
                            {roomErr}
                        </div>
                    )}

                    {inLobby && (
                        <div className="ludo-waiting-room">
                            <h2 className="ludo-waiting-title">Waiting room</h2>
                            {soloFallback && (
                                <div role="status" className="ludo-info-banner">
                                    Matched from queue with a shorter wait: remaining seats may be filled by
                                    bots so you can start right away.
                                </div>
                            )}
                            <p className="ludo-muted-text ludo-spaced-bottom">
                                Max {lobby.maxPlayers} players. Invite via link.
                            </p>
                            {isLobbyFull && (
                                <p className="ludo-info-banner">Lobby is full. Host can start the game now.</p>
                            )}
                            <div className="ludo-invite-row">
                                <input
                                    readOnly
                                    aria-label="Invite link"
                                    value={inviteUrl(roomId)}
                                    className="ludo-input ludo-link-input"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigator.clipboard.writeText(inviteUrl(roomId))
                                    }
                                    className="ludo-btn ludo-btn-secondary"
                                >
                                    Copy link
                                </button>
                            </div>
                            <h3 className="ludo-joined-title">Who joined</h3>
                            <ul className="ludo-joined-list">
                                {(lobby.members || []).map((m) => (
                                    <li
                                        key={m.uid}
                                        className="ludo-joined-item"
                                    >
                                        {m.displayName || m.uid}
                                        {String(m.uid) === String(lobby.hostUid)
                                            ? ' (host)'
                                            : ''}
                                    </li>
                                ))}
                            </ul>
                            {!lobby.members?.length && (
                                <p className="ludo-muted-text">No players joined yet. Share the invite link to fill the lobby.</p>
                            )}
                            {vote && (
                                <div className="ludo-vote-panel">
                                    <h3 className="ludo-joined-title">
                                        {voteOpen ? 'Bot Fill Vote' : 'Vote Result'}
                                    </h3>
                                    <p className="ludo-body-text ludo-vote-text">
                                        Missing seats: {vote.missingSeats ?? Math.max(0, 4 - (lobby.members || []).length)}
                                        {voteOpen ? ` • closes in ${voteSecondsLeft}s` : ''}
                                    </p>
                                    <p className="ludo-body-text ludo-vote-text">
                                        Add bots: {vote.addBotsCount || 0} • Humans only: {vote.humanOnlyCount || 0}
                                    </p>
                                    {voteOpen ? (
                                        <div className="ludo-vote-actions">
                                            <button
                                                type="button"
                                                onClick={() => submitVote('HUMANS_ONLY')}
                                                disabled={myVote === 'HUMANS_ONLY'}
                                                className={`ludo-btn ludo-vote-btn ${myVote === 'HUMANS_ONLY' ? 'is-selected' : ''}`}
                                            >
                                                Play with current humans
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => submitVote('ADD_BOTS')}
                                                disabled={myVote === 'ADD_BOTS'}
                                                className={`ludo-btn ludo-vote-btn ludo-btn-primary ${myVote === 'ADD_BOTS' ? 'is-selected' : ''}`}
                                            >
                                                Add bots
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="ludo-body-text ludo-no-margin">
                                            Outcome: {vote.outcome === 'ADD_BOTS' ? 'Missing seats were filled with bots.' : 'Match starts with only the available humans.'}
                                        </p>
                                    )}
                                </div>
                            )}
                            <p className="ludo-muted-text ludo-spaced-top">
                                {voteOpen
                                    ? 'All matched players must vote before the lobby starts.'
                                    : lobby.fillBots
                                        ? 'This match will include bots for the empty seats.'
                                        : 'This match will start with only the available humans.'}
                            </p>
                            <div className="ludo-primary-actions">
                                {isHost && !voteOpen && (
                                    <button
                                        type="button"
                                        onClick={handleStart}
                                        className="ludo-btn ludo-btn-primary ludo-start-btn"
                                    >
                                        Start game
                                    </button>
                                )}
                                <button type="button" onClick={handleLeave} className="ludo-btn ludo-btn-secondary ludo-leave-btn">
                                    Leave
                                </button>
                            </div>
                            {!isHost && (
                                <p className="ludo-muted-text ludo-spaced-top">
                                    Waiting for host to start…
                                </p>
                            )}
                        </div>
                    )}

                    {!inLobby && (
                        <LudoRoom
                            state={state}
                            rollDice={rollDice}
                            moveToken={moveToken}
                            resetGame={resetGame}
                            onQuitMatch={handleLeave}
                            onPlayAgain={handleLeave}
                            validMoves={displayValidMoves}
                            enforceSeatForRoll
                        />
                    )}
                </div>
            </ErrorBoundary>
        </Layout>
    );
}
