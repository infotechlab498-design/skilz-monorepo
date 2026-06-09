/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { Zap, ChevronRight, Search, Users, Trophy, Waypoints, Target, UserPlus } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import confetti from 'canvas-confetti';

import { useGamePlayers } from '../hooks/useGamePlayers';
import { api } from './mathRush/api.js';
import './mathRush/styles/lobby.css';
import './mathRush/styles/mathRushLobbyMobile.css';

import { socket, connectSocket, ensureSocketConnected } from './mathRush/lib/socket.js';
import MathRushHeader from './mathRush/MathRushHeader.jsx';
import MathRushBottom from './mathRush/MathRushBottom.jsx';
import LobbySliders from '../lobbyPages/components/LobbySliders';
import LobbyRightSidebar from '../lobbyPages/components/LobbyRightSidebar';
import '../lobbyPages/triviaGame.css';
import FriendMatchSessionBanner from '../Components/friends/FriendMatchSessionBanner.jsx';
import { useGameConfig } from '../hooks/useGameConfig.js';
import GameEntryFeeBadge, { canAffordEntryFee } from '../Components/GameEntryFeeBadge.jsx';

// --- Contexts ---

import { AuthContext, GameContext } from './mathRush/contexts.jsx';
import ChatBox from '../lobbyPages/components/ChatBox.jsx';
import { gameLobbyId } from '../firebase/gameLobbyPath.js';
import Layout from '../Components/Layout.jsx';
import { ensureGameUserFromAuth } from '../utils/gameAuthSync.js';
import { auth } from '../firebase/config.js';

/** `bootstrap-json-user` legacy wrapper could return `{ success, user }`. */

function normalizeUserProfile(data) {
    if (!data) return null;
    if (data.user && typeof data.user === 'object') return data.user;
    return data;
}

const ProgressBar = ({ progress, themeColor }) => (
    <div className="progress-bar-container">
        <Motion.div
            className="progress-bar-fill"
            animate={{ width: `${progress ?? 0}%` }}
            transition={{ duration: 0.3 }}
        />
    </div>
);

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', rush: 'Rush' };

const MATH_RUSH_TIPS = [
    'Practice daily to improve your speed and accuracy.',
    'Start on Easy to warm up, then climb to Medium and Hard.',
    'In 1v1, answer quickly when scores are tied.',
    'Invite mode is best for private practice with friends.',
];

const MobileProfileCard = () => {
    const authContext = useContext(AuthContext);
    if (!authContext?.user || !authContext?.profile) return null;
    const { user, profile } = authContext;
    const level = profile?.level ?? 1;
    const xpPct = Math.max(0, Math.min(100, (profile?.xp ?? 0) % 100));
    const avatarSrc =
        profile?.photoURL ||
        user.photoURL ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;

    return (
        <div className="mr-mobile-profile-card">
            <div className="mr-mobile-profile-card__avatar-wrap">
                <img
                    className="mr-mobile-profile-card__avatar"
                    src={avatarSrc}
                    alt=""
                    referrerPolicy="no-referrer"
                />
                <span className="mr-mobile-profile-card__status" aria-hidden />
            </div>
            <div className="mr-mobile-profile-card__body">
                <p className="mr-mobile-profile-card__name">YOU</p>
                <div className="mr-mobile-profile-card__level-row">
                    <p className="mr-mobile-profile-card__level">Level {level}</p>
                    <span className="mr-mobile-profile-card__pct">{xpPct}%</span>
                </div>
                <div className="mr-mobile-profile-card__bar" aria-hidden>
                    <div
                        className="mr-mobile-profile-card__bar-fill"
                        style={{ width: `${xpPct}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

/** Full main-area screen when queueing — not mixed with lobby chrome. */

const PlayerFindingScreen = () => {
    const gameContext = useContext(GameContext);
    if (!gameContext) return null;
    const { difficulty, cancelSearch } = gameContext;
    const label = DIFFICULTY_LABELS[difficulty] || difficulty;

    return (
        <Motion.div
            className="mr-finding-screen flex min-h-[60vh] w-full items-center justify-center px-3 py-6 sm:px-4 md:px-6"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
        >
            <div className="MR-search-container mr-finding-card-inner w-full max-w-xl rounded-2xl p-4 sm:p-5 md:p-6">
                <Motion.div
                    animate={{ scale: [1, 1.08, 1], rotate: [0, 4, -4, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity }}
                    className="MR-search-icon-box"
                >
                    <Search className="MR-search-icon" aria-hidden />
                </Motion.div>

                <h2 className="MR-search-title text-xl sm:text-2xl md:text-3xl lg:text-4xl">Finding opponent</h2>

                <p className="MR-search-subtitle text-sm md:text-base">
                    Matching you for a <span className="mr-finding-diff">{label}</span> match.
                    <span className="MR-search-hint"> You can cancel anytime.</span>
                </p>

                <div className="MR-search-dots" aria-hidden>
                    <div className="MR-dot blue [animation-delay:0s]" />
                    <div className="MR-dot red [animation-delay:0.2s]" />
                    <div className="MR-dot yellow [animation-delay:0.4s]" />
                </div>

                <button type="button" onClick={cancelSearch} className="MR-search-cancel-btn w-full md:w-auto min-h-[44px] px-4 py-2">
                    Cancel search
                </button>
            </div>
        </Motion.div>
    );
};

// --- Components ---

const Lobby = () => {
    const authContext = useContext(AuthContext);
    const gameContext = useContext(GameContext);
    if (!authContext || !gameContext) return null;
    const { difficulty, setDifficulty } = gameContext;

    const difficulties = [
        { id: 'easy', label: 'Easy', color: 'bg-google-blue', borderColor: 'border-google-blue', shadowColor: 'shadow-[0_0_40px_rgba(66,133,244,0.15)]', desc: 'Basic addition & subtraction' },
        { id: 'medium', label: 'Medium', color: 'bg-google-green', borderColor: 'border-google-green', shadowColor: 'shadow-[0_0_40px_rgba(52,168,83,0.15)]', desc: 'Multiplication & mixed ops' },
        { id: 'hard', label: 'Hard', color: 'bg-orange-500', borderColor: 'border-orange-500', shadowColor: 'shadow-[0_0_40px_rgba(249,115,22,0.15)]', desc: 'Complex equations' },
        { id: 'rush', label: 'Rush', color: 'bg-google-red', borderColor: 'border-google-red', shadowColor: 'shadow-[0_0_40px_rgba(234,67,53,0.15)]', desc: 'Maximum speed test' }
    ];

    return (


        <div className="MR-lobby-wrapper">

            <Motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="MR-lobby-left w-full"
            >
                
                <div className="MR-lobby-header">
                    <h1 className="MR-lobby-title">Choose your challenge</h1>
                    <p className="MR-lobby-subtitle">
                        Select a mode and find an opponent to start your Math Rush!
                    </p>
                </div>

                <div className="MR-difficulty-grid ">
                    {difficulties.map((d) => (
                        <button
                            type="button"
                            key={d.id}
                            onClick={() => setDifficulty(d.id)}
                            className={`MR-difficulty-card w-full rounded-xl p-3 text-left sm:p-4 md:p-5 ${difficulty === d.id ? "active" : ""}`}
                        >
                            <div className={`MR-difficulty-icon mb-2 ${difficulty === d.id ? "active" : ""}`}>
                                <Zap className={`MR-difficulty-zap ${difficulty === d.id ? "active" : ""}`} />
                            </div>

                            <h3 className="MR-difficulty-title text-base sm:text-lg md:text-xl">{d.label}</h3>
                            <p className="MR-difficulty-desc">{d.desc}</p>

                            {difficulty === d.id && (
                                <div className="MR-difficulty-indicator">
                                    <div className="MR-pulse-dot" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>

               
            </Motion.div>

        </div>



    );
};

// --- Main App Component ---


const MathRushGameLobby = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const friendMatchId = searchParams.get('matchId') || '';
    const noop = () => {};







    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [difficulty, setDifficulty] = useState('medium');
    const [isSearching, setIsSearching] = useState(false);
    const [isMobileLobby, setIsMobileLobby] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
    );
    const {
        entryFee,
        maxRounds,
        questionSeconds,
        matchmakingTimeoutMs,
        maintenanceMode,
        enabled: mathRushEnabled,
    } = useGameConfig('math_rush');
    const botWaitSec = Math.round((matchmakingTimeoutMs || 10_000) / 1000);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const sync = () => setIsMobileLobby(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    // --- Socket Logic ---



    const gameId = "math";
    const maxPlayers = 2;
    // Math Rush is a 1v1 game
    const availablePlayers = useGamePlayers(gameId);
    const [invitedPlayers, setInvitedPlayers] = useState([]);

    const handleInvite = (opponent) => {
        if (!opponent) return;
        if (invitedPlayers.find(p => p.uid === opponent.uid)) return;

        // Host is 1 player, so we can invite (maxPlayers - 1) friends

        if (invitedPlayers.length >= maxPlayers - 1) {
            alert(`Maximum ${maxPlayers} players allowed for Math Rush.`);
            return;
        }

        const inviteData = {
            uid: opponent.uid,
            name: opponent.profile?.displayName || opponent.uid,
            avatar: opponent.profile?.avatar,
            type: 'friend'
        };
        setInvitedPlayers(prev => [...prev, inviteData]);
    };

    const handleConfirmInvite = async () => {
        if (invitedPlayers.length === 0) return;
        alert(`Math Rush match confirmed with ${invitedPlayers[0].name}!`);

        // Future: Integration with backend API

    };




    useEffect(() => {
        if (!user) return;

        connectSocket();

        const onWaiting = () => {
            setIsSearching(true);
            toast.info("Searching for an opponent...", { icon: '🔍' });
        };

        const onGameStarted = (matchState) => {
            if (!matchState?.id) return;
            setIsSearching(false);
            toast.success("Opponent found! Match starting...");
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            navigate(`/mathRush/game/${matchState.id}`, { state: { match: matchState } });
        };

        const onMathRushError = (payload) => {
            setIsSearching(false);
            toast.error(payload?.message || 'Match could not start.');
        };

        const onPrivateCreated = ({ roomId, match: m }) => {
            if (!roomId) return;
            navigate(`/mathRush/game/${roomId}`, { state: { match: m } });
        };

        socket.on('waiting_in_queue', onWaiting);
        socket.on('game_started', onGameStarted);
        socket.on('math_rush:error', onMathRushError);
        socket.on('mathrush_private_created', onPrivateCreated);
        socket.emit('reconnect_user', user.uid);

        return () => {
            socket.off('waiting_in_queue', onWaiting);
            socket.off('game_started', onGameStarted);
            socket.off('math_rush:error', onMathRushError);
            socket.off('mathrush_private_created', onPrivateCreated);
        };
    }, [user, navigate]);

    // --- Auth Logic ---
    useEffect(() => {
        const initAuth = async () => {
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
                    // OLD BACKEND (DISABLED - MIGRATED TO FIREBASE)
                    // Previously: api.createUser() called /api/auth/bootstrap-json-user.
                    const p = await api.createUser(u.uid, u.displayName || 'Player', u.photoURL || '');
                    setProfile(normalizeUserProfile(p));
                }
            } catch (error) {
                console.error("Auth initialization failed:", error);
            } finally {
                setLoading(false);
            }
        };
        initAuth();
    }, []);

    const signOutUser = async () => {
        await firebaseSignOut(auth).catch(() => {});
        setUser(null);
        setProfile(null);
    };

    const startMatch = async () => {
        if (!user || !profile) {
            toast.error("Please sign in to play!");
            return;
        }

        if (maintenanceMode) {
            toast.error('Games are in maintenance mode. Please try again later.');
            return;
        }

        if (!mathRushEnabled) {
            toast.error('MathRush is temporarily unavailable.');
            return;
        }

        if (!canAffordEntryFee(profile?.coins, entryFee)) {
            toast.error(`Insufficient coins! You need ${entryFee} coins to play.`, { icon: '💰' });
            return;
        }

        try {
            await ensureSocketConnected();
        } catch (e) {
            console.error('[MathRush] socket connect:', e);
            toast.error(
                'Cannot reach the game server. Run the API on port 3000 (npm run dev / node server) and keep using the Vite dev URL.',
                { duration: 6000 }
            );
            return;
        }

        try {
            socket.emit('join_queue', {
                uid: user.uid,
                displayName: profile.displayName,
                photoURL: profile.photoURL,
                difficulty
            });
            setIsSearching(true);
        } catch (error) {
            console.error("Failed to join queue", error);
            toast.error("Connection error. Please try again.");
        }
    };

    const cancelSearch = () => {
        socket.emit('leave_queue');
        setIsSearching(false);
        toast.info("Matchmaking cancelled.");
    };

    const createPrivateRoom = async () => {
        if (!user || !profile) {
            toast.error('Profile not ready. Try again.');
            return;
        }
        if (maintenanceMode) {
            toast.error('Games are in maintenance mode. Please try again later.');
            return;
        }
        if (!mathRushEnabled) {
            toast.error('MathRush is temporarily unavailable.');
            return;
        }
        if (!canAffordEntryFee(profile?.coins, entryFee)) {
            toast.error(`Insufficient coins! You need ${entryFee} coins to play.`, { icon: '💰' });
            return;
        }
        try {
            await ensureSocketConnected();
        } catch {
            toast.error('Cannot reach game server.', { duration: 5000 });
            return;
        }
        connectSocket();
        socket.emit('mathrush_create_private', {
            uid: user.uid,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
            difficulty,
        });
    };

    if (loading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-[#0F0C1D] px-3">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4">
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#4285F4]">M</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#EA4335]">a</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#FBBC05]">t</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#4285F4]">h</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#34A853]">R</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#EA4335]">u</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#EA4335]">s</span>
                    <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-[#EA4335]">h</span>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <Layout>
                <div className="game-root flex items-center justify-center p-8 text-white text-center">
                    <div>
                        <p className="mb-4">Could not load your player profile. Sign in again.</p>
                        <a className="text-blue-400 underline" href="/signin">Sign in</a>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>

        <AuthContext.Provider value={{ user, profile, loading, signIn: noop, signOut: signOutUser }}>
            <GameContext.Provider
                value={{
                    match: null,
                    difficulty,
                    setDifficulty,
                    startMatch,
                    submitAnswer: noop,
                    quitMatch: noop,
                    resetMatch: noop,
                    currentInput: '',
                    setCurrentInput: noop,
                    timeLeft: 15,
                    isSearching,
                    cancelSearch,
                }}
            >

                <div className="game-root MathRushLobby-container min-h-screen w-full">

                    <FriendMatchSessionBanner matchId={friendMatchId} />

                    <MathRushHeader lobbyMode={isMobileLobby} />

                    {isSearching ? (
                        <div className="mr-finding-shell w-full px-2 sm:px-3 md:px-4">
                            <AnimatePresence mode="wait">
                                <PlayerFindingScreen key="finding-opponent" />
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div className="mr-content-row mr-lobby-layout mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-2 px-2 sm:px-3 md:grid-cols-1 md:gap-3 md:px-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-6">
                            <div className="mr-main-column min-w-0">
                                <MobileProfileCard />

                                <div className="game-layout mr-lobby-game-layout">
                                    <div className="mr-lobby-left-column">
                                        <LobbySliders
                                            creating={false}
                                            authReady={true}
                                            availablePlayers={availablePlayers}
                                            selectedPlayer={null}
                                            setSelectedUid={() => { }}
                                            handleInvite={handleInvite}
                                            invitedPlayers={invitedPlayers}
                                            maxPlayers={maxPlayers}
                                        />
                                        <ChatBox
                                            lobbyId={gameLobbyId('math-rush')}
                                            layoutVariant="math-rush-lobby"
                                            currentUser={{
                                                uid: user.uid,
                                                displayName:
                                                    profile?.displayName ||
                                                    profile?.username ||
                                                    user.displayName ||
                                                    'Player',
                                                avatar: profile?.photoURL || user.photoURL || '',
                                            }}
                                        />
                                    </div>

                                    <div className="MR-lobby-center-column">
                                        <div className="MR-multiplayer-card MR-multiplayer-card--hero">
                                            <div className="MR-multiplayer-hero-inner">
                                                <div className="MR-multiplayer-emblem" aria-hidden>
                                                    <span className="MR-multiplayer-emblem-ring" />
                                                    <span className="MR-multiplayer-emblem-plus MR-multiplayer-emblem-plus--1">+</span>
                                                    <span className="MR-multiplayer-emblem-plus MR-multiplayer-emblem-plus--2">+</span>
                                                    <span className="MR-multiplayer-emblem-plus MR-multiplayer-emblem-plus--3">+</span>
                                                    <span className="MR-multiplayer-emblem-vs">
                                                        <span className="MR-multiplayer-emblem-v">V</span>
                                                        <span className="MR-multiplayer-emblem-s">S</span>
                                                    </span>
                                                </div>

                                                <div className="MR-multiplayer-hero-copy min-w-0">
                                                    <span className="MR-multiplayer-badge">Popular</span>
                                                    <h2 className="MR-multi-title MR-multi-title--hero">
                                                        Real-time multiplayer
                                                    </h2>
                                                    <p className="MR-multi-subtitle MR-multi-subtitle--hero">
                                                        Battle against real players worldwide in fast-paced math challenges.
                                                    </p>

                                                    <ul className="MR-multiplayer-features" aria-label="Multiplayer features">
                                                        <li className="MR-multiplayer-feature">
                                                            <Users className="MR-multiplayer-feature-icon" aria-hidden />
                                                            <div>
                                                                <span className="MR-multiplayer-feature-name">Real opponents</span>
                                                                <span className="MR-multiplayer-feature-desc">Live matches</span>
                                                            </div>
                                                        </li>
                                                        <li className="MR-multiplayer-feature">
                                                            <Waypoints className="MR-multiplayer-feature-icon" aria-hidden />
                                                            <div>
                                                                <span className="MR-multiplayer-feature-name">Instant matching</span>
                                                                <span className="MR-multiplayer-feature-desc">Quick & fair</span>
                                                            </div>
                                                        </li>
                                                        <li className="MR-multiplayer-feature">
                                                            <Trophy className="MR-multiplayer-feature-icon" aria-hidden />
                                                            <div>
                                                                <span className="MR-multiplayer-feature-name">Global ranking</span>
                                                                <span className="MR-multiplayer-feature-desc">Compete &amp; climb</span>
                                                            </div>
                                                        </li>
                                                        <li className="MR-multiplayer-feature">
                                                            <Target className="MR-multiplayer-feature-icon" aria-hidden />
                                                            <div>
                                                                <span className="MR-multiplayer-feature-name">Skill based</span>
                                                                <span className="MR-multiplayer-feature-desc">Balanced matchups</span>
                                                            </div>
                                                        </li>
                                                    </ul>

                                                    <p className="MR-multiplayer-online" role="status">
                                                        <span className="MR-multiplayer-online-dot" aria-hidden />
                                                        Players online:{' '}
                                                        <span className="MR-multiplayer-online-count">{availablePlayers.length}</span>
                                                    </p>

                                                    <ul className="MR-hero-carousel-dots" aria-hidden>
                                                        <li />
                                                        <li className="active" />
                                                        <li />
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>

                                        <GameEntryFeeBadge
                                            entryFee={entryFee}
                                            maxRounds={maxRounds}
                                            questionSeconds={questionSeconds}
                                            className="game-entry-fee-badge--block"
                                        />

                                        <div className="MR-multiplayer-btn-row">
                                            <button
                                                type="button"
                                                onClick={startMatch}
                                                className="MR-find-btn MR-find-btn--split"
                                            >
                                                <Zap className="MR-find-btn-lead-icon shrink-0" aria-hidden />
                                                <span className="MR-find-btn-text">
                                                    <span className="MR-find-btn-primary">Quick match ({botWaitSec}s)</span>
                                                    <span className="MR-find-btn-secondary">Play vs. bot</span>
                                                </span>
                                                <ChevronRight className="MR-find-icon shrink-0" aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={createPrivateRoom}
                                                className="MR-find-btn MR-find-btn--split"
                                            >
                                                <UserPlus className="MR-find-btn-lead-icon shrink-0" aria-hidden />
                                                <span className="MR-find-btn-text">
                                                    <span className="MR-find-btn-primary">Invite friend (link)</span>
                                                    <span className="MR-find-btn-secondary">No bot match</span>
                                                </span>
                                                <ChevronRight className="MR-find-icon shrink-0" aria-hidden />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <aside className="mr-right-sidebar w-full md:w-full lg:w-[22rem] xl:w-[24rem]" aria-label="Stats and invites">
                                <LobbyRightSidebar
                                    user={profile}
                                    gameId="math"
                                    showInviteSection={invitedPlayers.length > 0}
                                    themeColor="#10b981"
                                    ProgressBar={ProgressBar}
                                    invitedPlayers={invitedPlayers}
                                    setInvitedPlayers={setInvitedPlayers}
                                    onConfirmInvite={handleConfirmInvite}
                                    maxPlayers={maxPlayers}
                                    tips={MATH_RUSH_TIPS}
                                />
                            </aside>
                        </div>
                    )}

                    {!isSearching && <MathRushBottom />}

                </div>

            </GameContext.Provider>
        </AuthContext.Provider>

        </Layout>

    );
}
export default MathRushGameLobby;



