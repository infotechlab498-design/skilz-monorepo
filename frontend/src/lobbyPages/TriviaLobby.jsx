import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser } from '../redux/features/auth.jsx';
import { toSerializableFirebase } from '../services/userService.js';
import { useUser } from '../context/UserContext';
import { motion, AnimatePresence } from 'framer-motion';
import './triviaGame.css';
import './PlayersLobby.css';
import '../styles/triviaLobby.css';
import '../styles/triviaLobbyMobile.css';
import {
    Trophy,
    User as UserIcon,
    Zap,
    Coins,
    Brain,
    Timer,
    ChevronRight,
    Target,
    Sword,
    Bot,
    LogOut,
    BarChart3,
    Landmark,
    Newspaper,
    Swords,
    Gamepad2,
    Grid2X2,
    UserRoundPlus,
    Mail,
    MessageCircle,
    Star,
    Loader2
} from 'lucide-react';
import { getGameConfig } from '../config/gamesConfig';
import {
    socket as triviaSocket,
    connectSocket,
    ensureSocketConnected,
} from '../games/mathRush/lib/socket.js';
import { ensureGameUserFromAuth } from '../utils/gameAuthSync.js';
import ChatBox from './components/ChatBox';
import { gameLobbyId } from '../firebase/gameLobbyPath.js';
import LobbySliders from './components/LobbySliders';
// import LobbyHeader from './components/LobbyHeader';
import LobbyRightSidebar from './components/LobbyRightSidebar';
import heroImg from '../assets/hero3.png';
import duelImg from '../assets/image-1.png';
import mainImg from '../assets/mainLobbyImage.png';
import Layout from '../Components/Layout';
import { useGamePlayers } from '../hooks/useGamePlayers';
import icon4 from "/Icon4.png";
import icon5 from "/dollar.png";
import FriendMatchSessionBanner from '../Components/friends/FriendMatchSessionBanner.jsx';
import { callSendInvite } from '../api/cloudFunctionsApi.js';
import { useGameConfig } from '../hooks/useGameConfig.js';
import GameEntryFeeBadge, { canAffordEntryFee } from '../Components/GameEntryFeeBadge.jsx';

const GameData = {

    "Solo vs Bot": {
        "label": "Solo vs Bot",
        "Image": heroImg,
        "subTitle": "Practice / Warm-up",
    },
    "1v1": {
        "label": "Quick Match",
        "Image": duelImg,
        "subTitle": "Queue — live opponent or bot after 10s",
    },
    "Private-Room": {
        "label": "Invite friend",
        "Image": mainImg,
        "subTitle": "Private link — no bot",
    }

};

const CATEGORY_CARDS = [
    { id: 'history', title: 'History', value: 'history', icon: Landmark, subtitle: 'Test your knowledge of the past!' },
    { id: 'current-affairs', title: 'Current Affairs', value: 'current_affairs', icon: Newspaper, subtitle: 'Stay updated with world events!' },
];

function categoryLabel(categoryValue) {
    const match = CATEGORY_CARDS.find((c) => c.value === categoryValue);
    return match?.title || 'History';
}

const MODE_OPTIONS = [
    { id: 'practice', title: 'Practice', value: 'Solo vs Bot', icon: Bot },
    { id: 'one-vs-one', title: '1 vs 1', value: '1v1', icon: Swords },
    { id: 'invite', title: 'Invite Friend', value: 'Private-Room', icon: UserRoundPlus },
];

const MODE_META = {
    "Solo vs Bot": { label: "Solo Vs Bot", icon: Gamepad2 },
    "1v1": { label: "1 Vs 1", icon: Swords },
    "Private-Room": { label: "Private Room", icon: UserRoundPlus },
};

function modeLabel(modeValue) {
    return MODE_META[modeValue]?.label || modeValue;
}

const Popup = ({ onClose, onSendInvite, onStartInviteMatch, category, difficulty }) => {
    const [email, setEmail] = useState("");
    const [playerId, setPlayerId] = useState("");
    const [loading, setLoading] = useState(false);
    const inviteLink = `${window.location.origin}/triviaLobby/trivia`;

    const sendInvite = async () => {
        if (!email && !playerId) return alert("Enter email or player ID");

        setLoading(true);

        try {

            await new Promise(resolve => setTimeout(resolve, 800));
            if (email && onSendInvite) onSendInvite(email);
            if (playerId) {
                await callSendInvite({
                    toUserId: playerId,
                    gameId: 'trivia',
                    gameName: 'Trivia 1v1',
                    triviaCategory: category,
                    triviaDifficulty: difficulty,
                });
                if (onSendInvite) onSendInvite(playerId);
            }
            alert(`Invite prepared${email ? ` for ${email}` : ''}${playerId ? ` / ${playerId}` : ''}`);
            setEmail("");
            setPlayerId("");
            onClose();
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="popup-overlay">
            <div className="popup popup--invite">
                <div className="popup-header">
                    <h3 className="popup-title">Invite Players</h3>
                    <button className="close-btn" onClick={onClose} aria-label="Close invite popup">x</button>
                </div>

                <div className="popup-body">
                    <div className="invite-by-email">
                        <div className="select-checkpoint">Invite Friend</div>

                        <input
                            className="invite-input"
                            placeholder="Enter email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <input
                            className="invite-input"
                            placeholder="Enter player ID"
                            value={playerId}
                            onChange={(e) => setPlayerId(e.target.value)}
                        />
                        <div className="invite-share-actions">
                            <a
                                className="nextMove invite-share-btn"
                                href={`https://wa.me/?text=${encodeURIComponent(`Join my trivia invite: ${inviteLink}`)}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <MessageCircle size={16} /> WhatsApp
                            </a>
                            <a
                                className="nextMove invite-share-btn"
                                href={`mailto:?subject=Trivia Invite&body=${encodeURIComponent(`Join my trivia match: ${inviteLink}`)}`}
                            >
                                <Mail size={16} /> Email
                            </a>
                        </div>
                        <button className="send-btn" onClick={sendInvite} disabled={loading}>
                            {loading ? "Saving..." : "Save Invite"}
                        </button>
                        <button className="nextMove invite-start-btn" onClick={onStartInviteMatch}>
                            Start Invite Match
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

//  Components

const ProgressBar = React.memo(({ progress, themeColor }) => (
    <div className="progress-bar-container">
        <motion.div
            className="progress-bar-fill"
            style={{ backgroundColor: themeColor || '#10b981' }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
        />
    </div>
));

const StatCard = React.memo(({ icon, label, value, colorClass }) => (
    <div className="stat-card">
        <div className={`stat-card-icon-container ${colorClass}`}>
            {React.createElement(icon, { size: 20, className: 'text-white' })}
        </div>
        <div>
            <p className="stat-label">{label}</p>
            <p className="stat-value-white">{value}</p>
        </div>
    </div>
));

const TimerDisplay = React.memo(({ time, label, icon, colorClass = 'text-white' }) => (
    <div className="timer-display">
        <p className="timer-display-label">{label}</p>
        <div className={`timer-display-value ${colorClass}`}>
            {icon ? React.createElement(icon, { size: 20, className: 'text-emerald-500' }) : null}
            {typeof time === 'number' ? `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}` : time}
        </div>


    </div>
));

const QuestionTimer = React.memo(({ time }) => (
    <div className="question-timer">
        <Timer size={16} className={time < 5 ? 'text-red-500' : 'text-emerald-500'} />
        <span className={`text-sm font-black ${time < 5 ? 'text-red-500' : 'text-white'}`}>{time}s</span>
    </div>
));

const QuestionImage = React.memo(({ imageUrl, feedback }) => {
    const [imgError, setImgError] = React.useState(false);

    return (
        <div className="question-image-container">
            <AnimatePresence mode="wait">
                {feedback ? (
                    <motion.div
                        key="feedback"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        className="question-feedback-overlay"
                    >
                        <div className={`question-feedback-text ${feedback === 'correct' ? 'text-emerald-500' : 'text-red-500'}`}>
                            {feedback === 'correct' ? 'Correct!' : 'Wrong'}
                        </div>
                    </motion.div>
                ) : imgError ? (
                    <motion.div
                        key="img-fallback"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="question-image"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '1rem',
                            color: '#6b7280',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                        }}
                    >
                        IMAGE UNAVAILABLE
                    </motion.div>
                ) : (
                    <motion.img
                        key="question-img"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        src={imageUrl}
                        alt="IQ Question"
                        className="question-image"
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
});



//  Views



const LobbyView = React.memo(({
    user,
    coins,
    difficulty,
    setDifficulty,
    category,
    setCategory,
    startMatchmaking: _startMatchmaking,
    setView,
    authReady,
    creating,
    visiblePlayers,
    selectedPlayer,
    setSelectedUid,
    handleQuickMatch,
    handleInvite,
    currentUserForChat,
    selectedGame,
    setSelectedGame,
    themeColor,
    title,
    invitedPlayers,
    setInvitedPlayers,
    onConfirmInvite,
    maxPlayers,
    gameId,
    onOpenModeSelection,
    entryFee,
    questionCount,
    questionSeconds,
}) => (
    <div className="TriviaLobby-container">
        {/*<LobbyHeader
            title={title}
            themeColor={themeColor}
            coins={coins}
            setView={setView}
            gameId={gameId}
        />*/}

        <div className="TriviaLobby-container-main-content trivia-lobby-layout">

            {/* getLobbyCode */}
            <div className="trivia-lobby-left-column">
                <LobbySliders
                    creating={creating}

                    authReady={authReady}
                    availablePlayers={visiblePlayers}
                    selectedPlayer={selectedPlayer}
                    setSelectedUid={setSelectedUid}
                    handleInvite={handleInvite}
                    invitedPlayers={invitedPlayers}
                    maxPlayers={maxPlayers}
                />

                {/* <div className="Chat-card"> */}

                <ChatBox
                    lobbyId={gameLobbyId('trivia', category)}
                    currentUser={currentUserForChat}
                    layoutVariant="trivia-lobby"
                />
                {/* </div> */}
            </div>
            <div className="centerContent trivia-lobby-center-column">
                <div className="mode-selection-container">
                    <div className="playerGameMode">
                        <div className="difficulty-container difficulty-container--hero">
                            <div className="trivia-hero-floor" aria-hidden />
                            <div className="trivia-hero-heading">
                                <span className="trivia-hero-heading__line trivia-hero-heading__line--left" aria-hidden />
                                <h3 className="difficulty-container-title trivia-hero-title text-2xl md:text-3xl lg:text-4xl">Select Category</h3>
                                <span className="trivia-hero-heading__line trivia-hero-heading__line--right" aria-hidden />
                            </div>
                            <div className="trivia-card-container trivia-card-container--hero">
                                {CATEGORY_CARDS.map((cat) => (
                                    <motion.button
                                        key={cat.id}
                                        type="button"
                                        whileHover={{ y: -3, scale: 1.01 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => {
                                            setCategory(cat.value);
                                            onOpenModeSelection();
                                        }}
                                        className={`trivia-card trivia-card--category trivia-card-hover ${cat.id === 'history' ? 'trivia-card--purple' : 'trivia-card--blue'} ${category === cat.value ? 'trivia-card-active' : ''}`}
                                    >
                                        <div className={`trivia-card-icon-wrap ${cat.id === 'history' ? 'trivia-card-icon-wrap--purple' : 'trivia-card-icon-wrap--blue'}`}>
                                            <cat.icon size={22} />
                                        </div>
                                        <div className="trivia-card-body">
                                            <div className="trivia-card-title">{cat.title}</div>
                                            <div className="trivia-card-sub text-sm md:text-base">{cat.subtitle}</div>
                                        </div>
                                        <div
                                            className={`trivia-card-select-indicator ${category === cat.value ? 'trivia-card-select-indicator--active' : ''} ${cat.id === 'history' ? 'trivia-card-select-indicator--purple' : 'trivia-card-select-indicator--blue'}`}
                                            aria-hidden
                                        />
                                        <div className={`trivia-card-icon-foot trivia-card-icon-foot--desktop ${cat.id === 'history' ? 'trivia-card-icon-foot--purple' : 'trivia-card-icon-foot--blue'}`}>
                                            <cat.icon size={14} />
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                            <div className="trivia-hero-heading">
                                <span className="trivia-hero-heading__line trivia-hero-heading__line--left" aria-hidden />
                                <h3 className="difficulty-container-title trivia-hero-title text-2xl md:text-3xl lg:text-4xl">Difficulty</h3>
                                <span className="trivia-hero-heading__line trivia-hero-heading__line--right" aria-hidden />
                            </div>
                            <div className="difficulty-btn-row difficulty-btn-row--hero">
                                {['easy', 'medium', 'hard'].map(d => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDifficulty(d)}
                                        className={difficulty === d ? 'active difficulty-btn difficulty-btn--hero' : 'difficulty-btn difficulty-btn--hero'}
                                    >
                                        {difficulty === d ? (
                                            <Star className="difficulty-btn-star difficulty-btn-star--filled" size={17} fill="currentColor" strokeWidth={0} />
                                        ) : (
                                            <Star className="difficulty-btn-star difficulty-btn-star--outline" size={17} fill="none" stroke="currentColor" strokeWidth={2} />
                                        )}
                                        {d}
                                    </button>
                                ))}
                            </div>
                            <div className="step-4-confirm-container step-4-confirm-container--hero">
                                <p className="confirm-text-row text-sm md:text-base">
                                    <Gamepad2 size={18} className="confirm-text-row-ico" aria-hidden />
                                    <span className="confirm-text-row-copy">
                                        Mode: <strong>{modeLabel(selectedGame)}</strong>
                                    </span>
                                </p>
                                <p className="confirm-text-row text-sm md:text-base">
                                    <Grid2X2 size={18} className="confirm-text-row-ico" aria-hidden />
                                    <span className="confirm-text-row-copy">
                                        Category: <strong>{categoryLabel(category)}</strong>
                                    </span>
                                </p>
                                <p className="confirm-text-row text-sm md:text-base">
                                    <BarChart3 size={18} className="confirm-text-row-ico" aria-hidden />
                                    <span className="confirm-text-row-copy">
                                        Difficulty: <strong>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</strong>
                                    </span>
                                </p>
                                <GameEntryFeeBadge
                                    entryFee={entryFee}
                                    questionCount={questionCount}
                                    questionSeconds={questionSeconds}
                                    className="game-entry-fee-badge--block"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleQuickMatch}
                                className={`nextMove nextMove--hero ${creating ? 'nextMove--loading' : ''}`}
                                disabled={creating || !authReady}
                            >
                                {creating ? (
                                    <span className="button-loading-content">
                                        <Loader2 className="button-loading-spinner animate-spin" size={20} />
                                        <span className="button-loading-text">Preparing Arena...</span>
                                    </span>
                                ) : (
                                    <>
                                        <span className="nextMove--hero-text">Start Game</span>
                                        <ChevronRight size={20} className="nextMove--hero-arrow" aria-hidden />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    <div>

                    </div>
                </div>
            </div>

            {/* rightSidebar */}


            <div className="trivia-lobby-right-column">
                <LobbyRightSidebar
                    user={user}
                    gameId={gameId || 'trivia'}
                    selectedMode={selectedGame}
                    showInviteSection={selectedGame === 'Private-Room' || invitedPlayers.length > 0}
                    themeColor={themeColor}
                    title={title}
                    invitedPlayers={invitedPlayers}
                    setInvitedPlayers={setInvitedPlayers}
                    onConfirmInvite={onConfirmInvite}
                    maxPlayers={maxPlayers}
                />
            </div>

        </div>
    </div>
));

const MatchmakingView = React.memo(({ difficulty, category, themeColor, onCancel }) => (
    <div className="MatchmakingView-container">
        <div className="relative">
            {/* <motion.div
                className="MatchmakingView-ring-outer"
                style={{ borderColor: `${themeColor}33` }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            /> */}
            <motion.div
                className="MatchmakingView-ring-inner"
                style={{ borderTopColor: themeColor }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
            <div className="MatchmakingView-icon-container" style={{ backgroundColor: themeColor }}>
                <Brain className="MatchmakingView-icon text-white" size={40} />
            </div>
        </div>
        <div className="MatchmakingView-content">
            <h2 className="MatchmakingView-title">Finding Opponent</h2>
            <p className="MatchmakingView-subtitle">Searching for a {difficulty} level match in {categoryLabel(category)}...</p>
        </div>
        <div className="MatchmakingView-info-box">
            <div className="MatchmakingView-avatars">
                <div className="MatchmakingView-avatar-p1">P</div>
                <div className="MatchmakingView-avatar-opponent">?</div>
            </div>
            <div className="MatchmakingView-status-container">
                <p className="MatchmakingView-status-main">Waiting for player...</p>
                <p className="MatchmakingView-status-sub">Matching by skill level</p>
            </div>
        </div>

        {onCancel ? (
            <div className="flex justify-center mt-8">
                <button type="button" className="backMove px-6 py-2 rounded-lg" onClick={onCancel}>
                    Cancel search
                </button>
            </div>
        ) : null}

    </div>
));

const ModeSelectionModal = React.memo(({ open, onClose, onSelectMode, category, entryFee, matchmakingTimeoutMs }) => {
    if (!open) return null;
    const timeoutSec = Math.round((matchmakingTimeoutMs || 12_000) / 1000);
    return (
        <div className="trivia-modal-overlay" role="dialog" aria-modal="true">
            <div className="trivia-modal">
                <div className="trivia-modal-head">
                    <div className="trivia-modal-title">Choose Mode - {categoryLabel(category)}</div>
                    <button className="trivia-modal-close" onClick={onClose} aria-label="Close mode selection">x</button>
                </div>
                <GameEntryFeeBadge entryFee={entryFee} className="game-entry-fee-badge--block" />
                <div>
                    <div className="trivia-card-container">
                        {MODE_OPTIONS.map((mode) => (
                            <motion.button
                                key={mode.id}
                                type="button"
                                className="trivia-card trivia-card-hover trivia-button-primary"
                                whileHover={{ y: -2, scale: 1.01 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => onSelectMode(mode.value)}
                            >
                                <div className="trivia-card-title">{mode.title}</div>
                                <div className="trivia-card-sub">
                                    {mode.value === '1v1'
                                        ? `Queue — live opponent or bot after ${timeoutSec}s`
                                        : mode.value === 'Private-Room'
                                          ? 'Private link — no bot'
                                          : 'Practice / warm-up'}
                                </div>
                                <mode.icon size={20} />
                            </motion.button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});



const GameView = React.memo(({
    currentQuestion,
    user,
    score,
    isBotMatch,
    timeLeft,
    questionTime,
    currentQuestionIndex,
    totalQuestions,
    matchStats,
    streak,
    matchLogs,
    feedback,
    handleAnswer,
    currentPlayerTurn,
    quitGame
}) => {
    if (!currentQuestion) return null;

    return (
        <div className="GameView-container">

            {/* Header */}

            <div className="GameView-Header-container">
                <div className="GameView-Header-Subcontainer">
                    <div className="GameView-Header-Subcontainer-left flex items-center gap-6">
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem',
                            borderRadius: '1rem',
                            transition: 'all 0.2s ease-in-out',
                            backgroundColor: currentPlayerTurn === 'p1' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                            boxShadow: currentPlayerTurn === 'p1' ? '0 0 0 1px #10b981' : 'none',
                        }}>

                            <div className="GameView-Header-Subcontainer-left-player-icon">P1</div>

                            <div>
                                <p className="GameView-User-Name">{user?.username}</p>
                                <p className="GameView-User-Score">Score: {score.player}</p>
                            </div>
                        </div>
                        <div className="GameView-Header-Subcontainer-right      h-8 w-px bg-zinc-800" />
                        <div className={`GameView-Header-Subcontainer-playerTurn flex items-center     ${currentPlayerTurn === 'p2' ? 'bg-emerald-500/20 ring-1 ring-emerald-500' : ''}`}>
                            <div className="GameView-Header-Subcontainer-playerTurn-playerIcon">
                                {isBotMatch ? <Bot size={20} /> : 'P2'}
                            </div>
                            <div>
                                <p className="GameBot-User-Name      ">{isBotMatch ? 'AI Opponent' : 'Player 2'}</p>
                                <p className="GameBot-User-Score   ">Score: {score.opponent}</p>
                            </div>
                        </div>
                    </div>

                    <div className="GameView-TimerContainer">


                        <TimerDisplay time={timeLeft} label="Match Time" icon={Timer} />
                        <TimerDisplay time={`${currentQuestionIndex + 1} / ${totalQuestions}`} label="Question" />

                        <button
                            onClick={quitGame}
                            className="GameView-TimerContainer-button"
                        >
                            Quit
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}

            <div className="gamedisplay-container">
                <div className="gamedisplay-left">
                    <div className="relative">

                        <QuestionImage imageUrl={currentQuestion.imageUrl} feedback={feedback} />
                        <QuestionTimer time={questionTime} />

                        {/* Turn Overlay */}

                        <AnimatePresence>
                            {currentPlayerTurn === 'p2' && !feedback && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="game-question-overlay   absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl"
                                >
                                    <div className=" text-center space-y-4">
                                        <div className="question-overlay-icon w-20 h-20 mx-auto rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 animate-pulse">
                                            {isBotMatch ? <Bot size={40} /> : <UserIcon size={40} />}
                                        </div>
                                        <p className="question-overlay-text text-xl font-black text-white uppercase italic tracking-tighter">
                                            {isBotMatch ? "AI is thinking..." : "Waiting for Player 2..."}
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Options Grid */}

                    <div className="gamedisplay-options">

                        {currentQuestion.options.map((opt, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleAnswer(idx)}
                                disabled={currentPlayerTurn !== 'p1' || !!feedback}
                                className={`option-btn ${currentPlayerTurn === 'p1' && !feedback
                                    ? 'clickable'
                                    : 'disabled'
                                    }`}
                            >
                                <div className="option-content">
                                    <div className="option-content-icon">
                                        {idx + 1}
                                    </div>
                                    <div className="option-content-text">
                                        <span className="option-content-text-small">Select Name</span>
                                        <span className="option-content-text-large">{opt}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="gamedisplay-sidebar">
                    <div className="performance-card">
                        <h3 className="performance-title">
                            <Zap size={18} className="text-amber-400" />
                            Performance
                        </h3>
                        <div className="performance-stats-container">
                            <div className="stat-row">
                                <span className="stat-label">Accuracy</span>
                                <span className="stat-value-white">
                                    {matchStats.correct > 0 ? Math.round((matchStats.correct / Math.ceil((currentQuestionIndex + 1) / 2)) * 100) : 0}%
                                </span>
                            </div>

                            <ProgressBar progress={matchStats.correct > 0 ? (matchStats.correct / Math.ceil((currentQuestionIndex + 1) / 2)) * 100 : 0} color="bg-amber-400" />

                            <div className="performance-footer">
                                <div className="stat-row">
                                    <span className="stat-label">Current Streak</span>
                                    <div className="stat-value-streak">
                                        <Zap size={14} className="text-amber-400" fill="currentColor" />
                                        <span>{streak}</span>
                                    </div>
                                </div>
                                <div className="stat-row">
                                    <span className="stat-label">Earned XP</span>
                                    <span className="stat-value-xp">+{matchStats.xp}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="match-log-card">
                        <h3 className="match-log-title">Match Log</h3>
                        <div className="match-log-list custom-scrollbar">
                            {matchLogs.map((log, i) => (
                                <div key={i} className="match-log-item">
                                    <span className="match-log-item-info">
                                        Q{log.index + 1} - {log.player === 'p1' ? 'You' : 'Opponent'}
                                    </span>
                                    <span className={log.correct ? 'match-log-status-correct' : 'match-log-status-wrong'}>
                                        {log.correct ? 'Correct' : 'Wrong'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* datanew */}

        </div>
    );
});

const ResultsView = React.memo(({ score, matchStats, setView, startMatchmaking, themeColor: _themeColor }) => {
    const isWinner = score.player >= score.opponent;

    return (
        <div className="results-view-container">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="results-card"
            >
                <div className="results-status-bar" style={{ backgroundColor: isWinner ? '#10b981' : '#ef4444' }} />

                <div>
                    <div className={`results-trophy-container ${isWinner ? 'winner' : 'loser'}`}>
                        <Trophy size={40} className="text-white" />
                    </div>
                    <h2 className="results-title">
                        {isWinner ? 'Victory!' : 'Defeat'}
                    </h2>
                    <p className="results-subtitle">
                        {isWinner ? 'You outsmarted your opponent' : 'Keep practicing to improve'}
                    </p>
                </div>

                <div className="results-stats-grid">
                    <div className="results-stat-card">
                        <p className="results-stat-label">XP Earned</p>
                        <p className="results-stat-value xp">+{matchStats.xp}</p>
                    </div>
                    <div className="results-stat-card">
                        <p className="results-stat-label">Coins Gained</p>
                        <p className="results-stat-value coins">+{matchStats.coins}</p>
                    </div>
                </div>

                <div className="results-actions">
                    <button
                        onClick={() => setView('lobby')}
                        className="results-btn-primary"
                    >
                        Return to Lobby
                        <ChevronRight size={20} />
                    </button>
                    <button
                        onClick={startMatchmaking}
                        className="results-btn-secondary"
                    >
                        Play Again
                    </button>
                </div>
            </motion.div>
        </div>
    );
});

const ProfileView = React.memo(({ user, setView }) => {
    const navigate = useNavigate();
    return (
        <div className="profile-container">
            <header className="profile-header">
                <button onClick={() => setView('lobby')} className="profile-header-btn back">

                    Back to Lobby
                    <ChevronRight size={16} className="rotate-180" />
                </button>
                <h1 className="profile-title">Player Profile</h1>
                <button className="profile-header-btn logout">
                    <LogOut size={16} />
                    Logout
                </button>
            </header>

            <div className="profile-grid">
                <div className="profile-user-card">
                    <div className="profile-avatar">
                        {user?.username?.[0]}
                    </div>
                    <div>
                        <h2 className="profile-username">{user?.username}</h2>
                        <p className="profile-rank">Elite Intelligence Rank</p>
                    </div>
                    <div className="profile-level-info">
                        <div className="profile-level-row">
                            <span>Level {Math.floor((user?.xp || 0) / 1000) + 1}</span>
                            <span>{(user?.xp || 0) % 1000} / 1000 XP</span>
                        </div>
                        <ProgressBar progress={(user?.xp || 0) % 100} />
                    </div>

                    <div className="recent-activities-or">
                        <div className="heading">
                            <div className="container">
                                <img className="icon" alt="Icon" src={icon4} />
                            </div>

                            <div className="text">Active Games</div>
                        </div>

                        <div className="background-border-wrapper">
                            <div className="background-border">
                                <div className="total-XP-wrapper">
                                    <span className="total-XP">TOTAL XP</span>
                                    <span className="text-wrapper">42k</span>
                                </div>

                                {/* <div className="div-wrapper">
                            </div> */}
                            </div>
                        </div>
                    </div>

                </div>

                <div className="profile-right-content">
                    <div className='Charge-wallet-container'>
                        <div className="wallet-section">
                            <div className="overlay-blur" />

                            <div className="div" />

                            <div className="container">
                                <div className="container-2">
                                    <div className="text">AVAILABLE BALANCE</div>

                                    <div className="container-3">
                                        <div className="overlay-border">
                                            <div className="icon-wrapper">
                                                <img className="icon" alt="Icon" src={icon5} />
                                            </div>
                                        </div>

                                        <div className="heading">
                                            <div className="text-wrapper">{(user?.coins || 0).toLocaleString()}</div>
                                        </div>
                                    </div>
                                </div>

                                <button className="button" onClick={() => navigate('/checkout')}>
                                    <div className="container-4">
                                        <div className="img-wrapper">
                                            {/* <img className="img" alt="Icon" src={image} /> */}
                                        </div>

                                        <div className="text-wrapper-2">Recharge Wallet</div>
                                    </div>
                                </button>
                            </div>
                        </div>


                    </div>


                    <div className="profile-stats-grid">
                        <StatCard icon={Trophy} label="Total Wins" value={user?.wins || 0} colorClass="bg-amber-500" />
                        <StatCard
                            icon={Target}
                            label="Accuracy"
                            value={user?.total_questions_answered ? `${Math.round((user.wins / user.total_questions_answered) * 100)}%` : "0%"}
                            colorClass="bg-emerald-500"
                        />
                        <StatCard icon={Zap} label="Best Streak" value={user?.daily_streak || 0} colorClass="bg-blue-500" />
                        <StatCard
                            icon={Timer}
                            label="Avg Speed"
                            value={user?.total_questions_answered ? `${(user.total_time_taken / user.total_questions_answered).toFixed(1)}s` : "0s"}
                            colorClass="bg-purple-500"
                        />
                    </div>

                    <div className="profile-history-card">
                        <h3 className="profile-history-title">Performance History</h3>
                        <div className="profile-history-chart">
                            {[40, 70, 45, 90, 65, 80, 55, 75, 60, 85].map((h, i) => (
                                <div key={i} className="chart-bar">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${h}%` }}
                                        className="chart-bar-fill"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="profile-history-footer">
                            <span>Last 10 Matches</span>
                            <span>Current Session</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
});

function TriviaLobby() {

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const friendMatchId = searchParams.get('matchId') || '';
    const { gameId } = useParams();
    const gameConfig = useMemo(() => getGameConfig(gameId || 'trivia'), [gameId]);
    const { title, themeColor } = gameConfig;

    const { user: contextUser, userId, refreshUser } = useUser();

    // Stable object for hooks deps (avoid new `{}` every render when contextUser is null)

    const user = useMemo(
        () => contextUser || { id: userId, coins: 0, username: 'Guest', xp: 0 },
        [contextUser, userId]
    );

    const [view, setView] = useState('lobby');
    const [room, setRoom] = useState(null);

    const [difficulty, setDifficulty] = useState('easy');
    const [category, setCategory] = useState(gameId === 'math' ? 'mathematics' : 'history');
    const [matchQuestions, setMatchQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState({ player: 0, opponent: 0 });
    const [matchStats, setMatchStats] = useState({ xp: 0, coins: 0, correct: 0 });
    const [timeLeft, setTimeLeft] = useState(300);
    const [questionTime, setQuestionTime] = useState(15);
    const [streak, setStreak] = useState(0);
    const [isBotMatch, setIsBotMatch] = useState(false);
    const [matchLogs, setMatchLogs] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [currentPlayerTurn, setCurrentPlayerTurn] = useState('p1');
    const matchmakingTimerRef = useRef(null);
    const isMatchmakingRef = useRef(false);
    const matchmakingRoomIdRef = useRef(null);
    const socketRef = useRef(null);
    const [selectedUid, setSelectedUid] = useState(null);
    const [selectedGame, setSelectedGame] = useState('Solo vs Bot');
    const [showModeModal, setShowModeModal] = useState(false);

    const gamePlayers = useGamePlayers(gameId || 'trivia');

    const {
        entryFee,
        questionCount,
        questionSeconds,
        matchmakingTimeoutMs,
        enabled: triviaEnabled,
        maintenanceMode,
    } = useGameConfig('trivia', { variantKey: category });

    // Minimal fallbacks for lobby UI (demo mode)

    const [creating, setCreating] = useState(false);
    const authReady = true;
    const visiblePlayers = gamePlayers.filter(p => p.uid !== userId);
    const selectedPlayer = (selectedUid && visiblePlayers.find(p => p.uid === selectedUid)) || visiblePlayers[0] || null;

    const currentUserForChat = useMemo(() => {
        if (!userId) return null;
        return {
            uid: userId,
            displayName: user?.username || 'Guest',
            avatar: '/vite.svg',
        };
    }, [userId, user]);

    const [invitedPlayers, setInvitedPlayers] = useState([]);
    const [showInviteModal, setShowInviteModal] = useState(false);

    const maxPlayers = useMemo(() => gameConfig.maxPlayers || 2, [gameConfig]);

    const handleInvite = useCallback((player) => {
        if (invitedPlayers.some(p => p.uid === player.uid)) return;

        // Host (user) is 1 player, so we can invite maxPlayers - 1 friends

        if (invitedPlayers.length >= maxPlayers - 1) {
            alert(`Maximum ${maxPlayers} players allowed for this game.`);
            return;
        }

        setInvitedPlayers(prev => [...prev, {
            uid: player.uid,
            name: player.profile?.displayName || player.uid,
            avatar: player.profile?.avatar,
            type: 'friend'
        }]);
    }, [invitedPlayers, maxPlayers]);

    const handleEmailInvite = useCallback((email) => {
        if (invitedPlayers.some(p => p.email === email)) return;

        if (invitedPlayers.length >= maxPlayers - 1) {
            alert(`Maximum ${maxPlayers} players allowed for this game.`);
            return;
        }

        setInvitedPlayers(prev => [...prev, {
            uid: `email_${Date.now()}`,
            email: email,
            name: email,
            type: 'email'
        }]);
    }, [invitedPlayers, maxPlayers]);

    const handleConfirmInvite = useCallback(async () => {
        if (invitedPlayers.length === 0) return;

        try {
            // 1. Create the lobby in the backend
            const lobbyResponse = await fetch('/api/lobby/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerUid: userId,
                    options: {
                        gameType: gameId || 'trivia',
                        difficulty,
                        category,
                        maxPlayers
                    }
                })
            });
            const lobbyData = await lobbyResponse.json();
            const lobbyId = lobbyData.id;

            // 2. Send invitations for each invited player

            await Promise.all(invitedPlayers.map(player =>
                fetch('/api/invite/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lobbyId,
                        invitee: player,
                        inviterUid: userId
                    })
                })
            ));

            alert(`Lobby created and ${invitedPlayers.length} invitations sent!`);

            // For 1v1, if requested by the user flow, we might still open the email modal 
            // if they want to invite *additional* people via email specifically.
            // But based on the objective, "Confirm Invite" should process the current invited list.

            if (maxPlayers === 2) {
                // Specific requirement for 1v1: Allow user to enter another player's email
                setShowInviteModal(true);
            }
        } catch (err) {
            console.error("Failed to confirm invites:", err);
            alert("Error creating lobby/sending invites.");
        }
    }, [invitedPlayers, maxPlayers, userId, gameId, difficulty, category]);

    const handleQuickMatch = () => {
        startMatchmaking();
    };

    /*
    useEffect(() => {
        const auth = getAuth();
        return onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                // Handle firebase user
            }
        });
    }, []);
    */


    const quitGame = useCallback(async () => {
        if (room?.id) {
            const isWinner = score.player > score.opponent;
            const scoresForSocket = { player1: score.player, player2: score.opponent };

            socketRef.current?.emit('quitGame', { roomId: room.id, userId, scores: scoresForSocket });

            await fetch('/api/game/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, roomId: room.id, isWinner })
            });
        }
        setView('lobby');
        setRoom(null);
        setMatchQuestions([]);
        setCurrentQuestionIndex(0);
        setScore({ player: 0, opponent: 0 });
        setFeedback(null);
        setTimeLeft(300);
        refreshUser();
    }, [userId, room?.id, score.player, score.opponent, refreshUser]);

    const initGame = useCallback((roomId, bot, startsFirst = true, syncedQuestions = null) => {
        if (matchmakingTimerRef.current) {
            clearTimeout(matchmakingTimerRef.current);
            matchmakingTimerRef.current = null;
        }
        matchmakingRoomIdRef.current = null;
        setRoom({ id: roomId, player1_id: userId, player2_id: bot ? 'bot' : 'player2', status: 'active', difficulty, category });
        setIsBotMatch(bot);

        // State reset

        const finalQuestions = syncedQuestions || [];
        setMatchQuestions(finalQuestions);

        setCurrentQuestionIndex(0);
        setScore({ player: 0, opponent: 0 });
        setMatchStats({ xp: 0, coins: 0, correct: 0 });
        setTimeLeft(300);
        setQuestionTime(15);
        setStreak(0);
        setMatchLogs([]);
        setFeedback(null);
        setCurrentPlayerTurn(startsFirst ? 'p1' : 'p2');
        setView('game');
    }, [userId, difficulty, category]);

    useEffect(() => {
        socketRef.current = triviaSocket;
        connectSocket();

        const onConnectErr = (err) => {
            console.warn('Socket unavailable (backend offline?):', err.message);
        };

        triviaSocket.on('connect_error', onConnectErr);

        const onGameStateUpdate = ({ lastActionBy, score: updatedScore, correct, index }) => {
            if (lastActionBy !== userId) {
                setScore(s => ({ ...s, opponent: updatedScore.player }));
                setMatchLogs(prev => [...prev, { index, correct, player: 'p2' }]);
                setFeedback(correct ? 'correct' : 'wrong');
                setTimeout(() => {
                    setFeedback(null);
                    if (currentQuestionIndex < matchQuestions.length - 1) {
                        setCurrentQuestionIndex(i => i + 1);
                        setQuestionTime(15);
                        setCurrentPlayerTurn('p1');
                    }
                }, 1000);
            }
        };

        const onMatchReady = ({ roomId, starterId, questions }) => {
            if (!isMatchmakingRef.current) return;
            const startsFirst = starterId === userId;
            initGame(roomId, false, startsFirst, questions);
        };

        const onGameOver = ({ scores }) => {
            setScore({ player: scores.player1, opponent: scores.player2 });
            setView('results');
        };

        triviaSocket.on('gameStateUpdate', onGameStateUpdate);
        triviaSocket.on('matchReady', onMatchReady);
        triviaSocket.on('gameOver', onGameOver);

        return () => {
            triviaSocket.off('connect_error', onConnectErr);
            triviaSocket.off('gameStateUpdate', onGameStateUpdate);
            triviaSocket.off('matchReady', onMatchReady);
            triviaSocket.off('gameOver', onGameOver);
        };
    }, [userId, matchQuestions.length, currentQuestionIndex, initGame]);

    useEffect(() => {
        const returnId = gameId || 'trivia';
        const onGameStarted = (m) => {
            if (!m?.roomId) return;
            isMatchmakingRef.current = false;
            navigate(`/trivia/game/${m.roomId}`, {
                state: { match: m, returnGameId: returnId },
            });
        };
        const onPrivateCreated = ({ roomId, match: privMatch }) => {
            if (!roomId) return;
            navigate(`/trivia/game/${roomId}`, {
                state: { match: privMatch, returnGameId: returnId },
            });
        };
        const onTriviaErr = (p) => {
            isMatchmakingRef.current = false;
            setCreating(false);
            if (matchmakingTimerRef.current) {
                clearTimeout(matchmakingTimerRef.current);
                matchmakingTimerRef.current = null;
            }
            setView('lobby');
            alert(p?.message || 'Trivia match error');
        };
        const onMatchNotFound = (p) => {
            isMatchmakingRef.current = false;
            setCreating(false);
            if (matchmakingTimerRef.current) {
                clearTimeout(matchmakingTimerRef.current);
                matchmakingTimerRef.current = null;
            }
            setView('lobby');
            alert(p?.message || 'Player Not Found');
        };

        connectSocket();
        triviaSocket.on('trivia_game_started', onGameStarted);
        triviaSocket.on('trivia_private_created', onPrivateCreated);
        triviaSocket.on('trivia_error', onTriviaErr);
        triviaSocket.on('trivia_match_not_found', onMatchNotFound);

        return () => {
            triviaSocket.off('trivia_game_started', onGameStarted);
            triviaSocket.off('trivia_private_created', onPrivateCreated);
            triviaSocket.off('trivia_error', onTriviaErr);
            triviaSocket.off('trivia_match_not_found', onMatchNotFound);
        };
    }, [navigate, gameId]);

    const startMatchmaking = useCallback(async (modeOverride = '') => {
        if (!category || !difficulty || !selectedGame) {
            alert("Please select all parameters to play the game.");
            return;
        }

        if (!userId) {
            alert('Sign in to play.');
            return;
        }

        if (maintenanceMode) {
            alert('Games are in maintenance mode. Please try again later.');
            return;
        }

        if (!triviaEnabled) {
            alert('Trivia is temporarily unavailable.');
            return;
        }

        if (!canAffordEntryFee(user?.coins, entryFee)) {
            alert(`Insufficient coins! You need ${entryFee} coins to play.`);
            return;
        }

        setCreating(true);

        try {
            const synced = await ensureGameUserFromAuth();
            const uid = synced?.uid ?? userId;
            const displayName =
                synced?.displayName ?? user?.username ?? user?.displayName ?? 'Player';
            const photoURL = synced?.photoURL ?? user?.photoURL ?? '';

            try {
                await ensureSocketConnected();
            } catch {
                alert('Cannot reach game server.');
                setCreating(false);
                return;
            }
            connectSocket();

            const activeMode = modeOverride || selectedGame;
            const payload = {
                uid,
                displayName,
                photoURL,
                difficulty,
                category,
                xp: Number(user?.xp) || 0,
            };

            if (activeMode === 'Solo vs Bot') {
                triviaSocket.emit('trivia_join_queue', { ...payload, soloBot: true });
                return;
            }

            if (activeMode === 'Private-Room') {
                triviaSocket.emit('trivia_create_private', payload);
                return;
            }

            isMatchmakingRef.current = true;
            setView('matchmaking');
            triviaSocket.emit('trivia_join_queue', { ...payload, soloBot: false });
            matchmakingTimerRef.current = setTimeout(() => {
                if (!isMatchmakingRef.current) return;
                isMatchmakingRef.current = false;
                triviaSocket.emit('trivia_leave_queue');
                setView('lobby');
                setCreating(false);
                alert('Player Not Found');
            }, matchmakingTimeoutMs);
        } catch (err) {
            console.error("Matchmaking initialization failed:", err);
            alert("Matchmaking initialization failed. Please try again.");
            setCreating(false);
        }
    }, [userId, difficulty, category, selectedGame, user, entryFee, matchmakingTimeoutMs, maintenanceMode, triviaEnabled]);

    const handleModeSelect = useCallback((modeValue) => {
        setSelectedGame(modeValue);
        setShowModeModal(false);
        if (modeValue === 'Private-Room') {
            setShowInviteModal(true);
            return;
        }
        startMatchmaking(modeValue);
    }, [startMatchmaking]);


    const cancelMatchmaking = useCallback(() => {
        isMatchmakingRef.current = false;
        setCreating(false);
        if (matchmakingTimerRef.current) {
            clearTimeout(matchmakingTimerRef.current);
            matchmakingTimerRef.current = null;
        }
        connectSocket();
        triviaSocket.emit('trivia_leave_queue');
        if (matchmakingRoomIdRef.current) {
            socketRef.current?.emit('leaveRoom', { roomId: matchmakingRoomIdRef.current, userId });
            matchmakingRoomIdRef.current = null;
        }
        setView('lobby');
    }, [userId]);

    const endMatch = useCallback(async () => {
        try {
            const isWinner = score.player >= score.opponent;
            await fetch('/api/game/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, roomId: room?.id, isWinner })
            });

            const userRes = await fetch(`/api/user/${userId}`);
            if (userRes.ok) {
                const userData = await userRes.json();
                dispatch(setUser(toSerializableFirebase(userData)));
            }
        } catch (err) {
            console.error('Failed to end match officially:', err);
        } finally {
            refreshUser();
            setView('results');
        }
    }, [userId, room?.id, score.player, score.opponent, refreshUser, dispatch]);

    const nextQuestion = useCallback(() => {
        if (currentQuestionIndex < matchQuestions.length - 1) {
            setCurrentQuestionIndex(i => i + 1);
            setQuestionTime(15);
            setCurrentPlayerTurn(prev => prev === 'p1' ? 'p2' : 'p1');

        } else {

            endMatch();

        }
    }, [currentQuestionIndex, matchQuestions.length, endMatch]);

    const handleAnswer = useCallback(async (index) => {
        if (feedback || currentPlayerTurn !== 'p1') return;

        const timeTaken = 15 - questionTime;
        const currentQuestion = matchQuestions[currentQuestionIndex];
        let isCorrect = false; // Local variable to avoid stale feedback closure

        try {
            const res = await fetch('/api/game/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    roomId: room?.id,
                    questionId: currentQuestion.id,
                    selectedAnswer: index,
                    correctIndex: currentQuestion.correctIndex,
                    timeTaken,
                    streak
                })
            });

            if (!res.ok) throw new Error('Answer submission failed');
            const data = await res.json();
            isCorrect = data.correct; // capture result before any state updates

            if (data.correct) {
                setScore(s => {
                    const newScore = { ...s, player: s.player + 1 };
                    if (!isBotMatch) {
                        socketRef.current?.emit('submitAnswer', {
                            roomId: room?.id,
                            userId,
                            score: newScore,
                            correct: true,
                            index
                        });
                    }
                    return newScore;
                });
                setMatchStats(s => ({
                    ...s,
                    xp: s.xp + (data.xp || 0),
                    coins: s.coins + (data.coins || 0),
                    correct: s.correct + 1
                }));
                setStreak(s => s + 1);
                setFeedback('correct');
                // Sync coins/xp with global context
                setTimeout(() => refreshUser(), 500);
            } else {
                if (!isBotMatch) {
                    socketRef.current?.emit('submitAnswer', {
                        roomId: room?.id,
                        userId,
                        score,
                        correct: false,
                        index
                    });
                }
                setStreak(0);
                setFeedback('wrong');

                // Track wrong answer speed as well

                fetch('/api/game/submit/wrong', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, timeTaken })
                }).catch(console.error);
            }
        } catch (err) {
            console.error('Answer submission error:', err);

            isCorrect = index === currentQuestion.correctIndex; // fallback: derive locally
            if (isCorrect) {
                setScore(s => ({ ...s, player: s.player + 1 }));
                setFeedback('correct');
            } else {
                setFeedback('wrong');
            }
        }

        setMatchLogs(prev => [...prev, { index: currentQuestionIndex, correct: isCorrect, player: 'p1' }]); // use local var, not stale feedback state

        setTimeout(() => {
            setFeedback(null);
            nextQuestion();
        }, 1000);
    }, [feedback, currentPlayerTurn, questionTime, matchQuestions, currentQuestionIndex, userId, room?.id, streak, nextQuestion, isBotMatch, score, refreshUser]);

    // Bot Turn Logic

    useEffect(() => {
        if (view === 'game' && isBotMatch && currentPlayerTurn === 'p2' && !feedback) {
            const botAction = setTimeout(() => {
                const botAccuracy = difficulty === 'easy' ? 0.6 : (difficulty === 'medium' ? 0.75 : 0.9);
                const isCorrect = Math.random() < botAccuracy;

                if (isCorrect) {
                    setScore(s => ({ ...s, opponent: s.opponent + 1 }));
                    setFeedback('correct');
                } else {
                    setFeedback('wrong');
                }

                setMatchLogs(prev => [...prev, { index: currentQuestionIndex, correct: isCorrect, player: 'p2' }]);

                setTimeout(() => {
                    setFeedback(null);
                    nextQuestion();
                }, 1000);
            }, 2000);

            // Bot takes 2 seconds to "think"

            return () => clearTimeout(botAction);
        }
    }, [view, isBotMatch, currentPlayerTurn, feedback, difficulty, currentQuestionIndex, nextQuestion]);

    useEffect(() => {
        if (view !== 'game') return;

        const timer = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timer);
                    endMatch();
                    return 0;
                }
                return t - 1;
            });

            setQuestionTime(t => {
                if (t <= 1) {
                    nextQuestion();
                    return 15;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [view, nextQuestion, endMatch]);

    return (
        <Layout>

            <FriendMatchSessionBanner matchId={friendMatchId} />

            <div className="TopLobby-container ">


                <AnimatePresence mode="wait">

                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {view === 'lobby' && (
                            <LobbyView
                                user={user}
                                coins={user?.coins}
                                difficulty={difficulty}
                                setDifficulty={setDifficulty}
                                category={category}
                                setCategory={setCategory}
                                startMatchmaking={startMatchmaking}
                                setView={setView}
                                authReady={authReady}
                                creating={creating}
                                visiblePlayers={visiblePlayers}
                                selectedPlayer={selectedPlayer}
                                setSelectedUid={setSelectedUid}
                                handleQuickMatch={handleQuickMatch}
                                handleInvite={handleInvite}
                                currentUserForChat={currentUserForChat}
                                selectedGame={selectedGame}
                                setSelectedGame={setSelectedGame}
                                themeColor={themeColor}
                                title={title}
                                invitedPlayers={invitedPlayers}
                                setInvitedPlayers={setInvitedPlayers}
                                onConfirmInvite={handleConfirmInvite}
                                maxPlayers={maxPlayers}
                                gameId={gameId || 'trivia'}
                                onOpenModeSelection={() => setShowModeModal(true)}
                                entryFee={entryFee}
                                questionCount={questionCount}
                                questionSeconds={questionSeconds}
                            />
                        )}
                        {view === 'matchmaking' && (
                            <MatchmakingView
                                difficulty={difficulty}
                                category={category}
                                onCancel={cancelMatchmaking}
                                themeColor={themeColor}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
            <ModeSelectionModal
                open={showModeModal}
                onClose={() => setShowModeModal(false)}
                onSelectMode={handleModeSelect}
                category={category}
                entryFee={entryFee}
                matchmakingTimeoutMs={matchmakingTimeoutMs}
            />
            {showInviteModal && (
                <Popup
                    onClose={() => setShowInviteModal(false)}
                    onSendInvite={handleEmailInvite}
                    category={category}
                    difficulty={difficulty}
                    onStartInviteMatch={() => {
                        setShowInviteModal(false);
                        setSelectedGame('Private-Room');
                        startMatchmaking('Private-Room');
                    }}
                />
            )}
        </Layout>
    );
}

export default TriviaLobby;


























// import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { useUser } from '../context/UserContext';
// import { motion, AnimatePresence } from 'framer-motion';
// import './triviaGame.css';
// import './PlayersLobby.css';
// import {
//     Trophy,
//     User as UserIcon,
//     Zap,
//     Coins,
//     Brain,
//     Timer,
//     ChevronRight,
//     Target,
//     Sword,
//     Bot,
//     LogOut,
//     BarChart3
// } from 'lucide-react';
// import { CATEGORIES } from './data';
// import { getQuestionsForMatch } from './data';
// import { getGameConfig } from '../config/gamesConfig';
// import { io } from 'socket.io-client';
// import ChatBox from './components/ChatBox';
// import LobbySliders from './components/LobbySliders';
// import LobbyHeader from './components/LobbyHeader';
// import LobbyRightSidebar from './components/LobbyRightSidebar';
// import heroImg from '../assets/hero3.png';
// import duelImg from '../assets/image-1.png';
// import mainImg from '../assets/mainLobbyImage.png';
// import Layout from '../Components/Layout';
// import { useGamePlayers } from '../hooks/useGamePlayers';
// import icon4 from "/Icon4.png";
// import icon5 from "/dollar.png";
// const GameData = {
//     "Solo vs Bot": {
//         "Image": heroImg,
//         "subTitle": "Practice / Warm-up",
//     },
//     "1v1": {
//         "Image": duelImg,
//         "subTitle": "Match by XP",
//     },
//     "Private-Room": {
//         "Image": mainImg,
//         "subTitle": "Invite Only",
//     }
// };
// //  Matchmaking
// const findBestMatch = (current, others) => {
//     // Simple mock logic
//     return others[0] || { uid: 'bot_001', profile: { displayName: 'AI Bot', level: 1, xp: 0 }, isBot: true };
// };
// const Popup = ({ onClose, onSendInvite }) => {
//     const [email, setEmail] = useState("");
//     const [loading, setLoading] = useState(false);
//     const [step, setStep] = useState(1);
//     const sendInvite = async () => {
//         if (!email) return alert("Enter email");
//         setLoading(true);
//         try {
//             // Simulated invite logic
//             await new Promise(resolve => setTimeout(resolve, 800));
//             // Mock storing in localStorage for demo
//             const invites = JSON.parse(localStorage.getItem("emailInvites") || "[]");
//             invites.push({ email, time: new Date().toISOString() });
//             localStorage.setItem("emailInvites", JSON.stringify(invites));
//             if (onSendInvite) onSendInvite(email);
//             alert(`Demo Mode: Invite sent to ${email}!`);
//             setEmail("");
//             onClose();
//         } catch (error) {
//             alert(error.message);
//         } finally {
//             setLoading(false);
//         }
//     };
//     return (
//         <div className="popup-overlay">
//             <div className="popup">
//                 <div className="assests-modal">
//                     <div className="div">Invite Players</div>
//                     <button className="close-btn" onClick={onClose}>âœ•</button>
//                 </div>
//                 <div className="background">
//                     <div className="invite-by-email">
//                         <div className="select-checkpoint">Invite by email</div>
//                         <input
//                             className="invite-input"
//                             placeholder="Enter email address"
//                             value={email}
//                             onChange={(e) => setEmail(e.target.value)}
//                         />
//                         <button
//                             className="send-btn"
//                             onClick={sendInvite}
//                             disabled={loading}
//                         >
//                             {loading ? "Sending..." : "Send Invite"}
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };
// //  Components
// const ProgressBar = React.memo(({ progress, themeColor }) => (
//     <div className="progress-bar-container">
//         <motion.div
//             className="progress-bar-fill"
//             style={{ backgroundColor: themeColor || '#10b981' }}
//             initial={{ width: 0 }}
//             animate={{ width: `${progress}%` }}
//             transition={{ duration: 0.3 }}
//         />
//     </div>
// ));
// const StatCard = React.memo(({ icon: Icon, label, value, colorClass }) => (
//     <div className="stat-card">
//         <div className={`stat-card-icon-container ${colorClass}`}>
//             <Icon size={20} className="text-white" />
//         </div>
//         <div>
//             <p className="stat-label">{label}</p>
//             <p className="stat-value-white">{value}</p>
//         </div>
//     </div>
// ));
// const TimerDisplay = React.memo(({ time, label, icon: Icon, colorClass = 'text-white' }) => (
//     <div className="timer-display">
//         <p className="timer-display-label">{label}</p>
//         <div className={`timer-display-value ${colorClass}`}>
//             {Icon && <Icon size={20} className="text-emerald-500" />}
//             {typeof time === 'number' ? `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}` : time}
//         </div>
//     </div>
// ));
// const QuestionTimer = React.memo(({ time }) => (
//     <div className="question-timer">
//         <Timer size={16} className={time < 5 ? 'text-red-500' : 'text-emerald-500'} />
//         <span className={`text-sm font-black ${time < 5 ? 'text-red-500' : 'text-white'}`}>{time}s</span>
//     </div>
// ));
// const QuestionImage = React.memo(({ imageUrl, feedback }) => {
//     const [imgError, setImgError] = React.useState(false);
//     return (
//         <div className="question-image-container">
//             <AnimatePresence mode="wait">
//                 {feedback ? (
//                     <motion.div
//                         key="feedback"
//                         initial={{ opacity: 0, scale: 0.5 }}
//                         animate={{ opacity: 1, scale: 1 }}
//                         exit={{ opacity: 0, scale: 1.5 }}
//                         className="question-feedback-overlay"
//                     >
//                         <div className={`question-feedback-text ${feedback === 'correct' ? 'text-emerald-500' : 'text-red-500'}`}>
//                             {feedback === 'correct' ? 'Correct!' : 'Wrong'}
//                         </div>
//                     </motion.div>
//                 ) : imgError ? (
//                     <motion.div
//                         key="img-fallback"
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         className="question-image"
//                         style={{
//                             display: 'flex',
//                             alignItems: 'center',
//                             justifyContent: 'center',
//                             background: 'rgba(255,255,255,0.05)',
//                             borderRadius: '1rem',
//                             color: '#6b7280',
//                             fontSize: '0.875rem',
//                             fontWeight: 600,
//                             letterSpacing: '0.05em',
//                         }}
//                     >
//                         IMAGE UNAVAILABLE
//                     </motion.div>
//                 ) : (
//                     <motion.img
//                         key="question-img"
//                         initial={{ opacity: 0 }}
//                         animate={{ opacity: 1 }}
//                         src={imageUrl}
//                         alt="IQ Question"
//                         className="question-image"
//                         referrerPolicy="no-referrer"
//                         onError={() => setImgError(true)}
//                     />
//                 )}
//             </AnimatePresence>
//         </div>
//     );
// });
// //  Views
// const LobbyView = React.memo(({
//     user,
//     coins,
//     difficulty,
//     setDifficulty,
//     category,
//     setCategory,
//     startMatchmaking,
//     setView,
//     authReady,
//     creating,
//     visiblePlayers,
//     selectedPlayer,
//     setSelectedUid,
//     handleQuickMatch,
//     handleInvite,
//     currentUserForChat,
//     selectedGame,
//     setSelectedGame,
//     themeColor,
//     title,
//     invitedPlayers,
//     setInvitedPlayers,
//     onConfirmInvite,
//     maxPlayers,
//     gameId,
//     step,
//     setStep
// }) => (
//     <div className="TriviaLobby-container">
//         <LobbyHeader
//             title={title}
//             themeColor={themeColor}
//             coins={coins}
//             setView={setView}
//             gameId={gameId}
//         />
//         <div className="TriviaLobby-container-main-content">
//             {/* getLobbyCode */}
//             <LobbySliders
//                 creating={creating}
//                 authReady={authReady}
//                 availablePlayers={visiblePlayers}
//                 selectedPlayer={selectedPlayer}
//                 setSelectedUid={setSelectedUid}
//                 handleInvite={handleInvite}
//                 invitedPlayers={invitedPlayers}
//                 maxPlayers={maxPlayers}
//             />
//             <div className="centerContent">
//                 <div className="Game-image-container">
//                     <img
//                         src={GameData[selectedGame]?.Image || heroImg}
//                         alt={selectedGame}
//                         className="lobbyCard"
//                     />
//                 </div>
//                 <div className="mode-selection-container">
//                     {/* <div className="card center__hero">
//                         <div className="card__title">
//                             <span>Game Mode</span>
//                         </div>
//                         <div className="modeGrid">
//                             <div className="pill__title">Solo vs Bot</div>
//                             <div className="pill__sub">Practice / warm-up</div>
//                             <div className="pill__title">1v1 Match</div>
//                             <div className="pill__sub">Match by XP + Level</div>
//                             <div className="pill__title">Private Room</div>
//                             <div className="pill__sub">Invite only</div>
//                             <div className="pill__title">Ranked Match</div>
//                             <div className="pill__sub">Stricter matchmaking</div>
//                         </div>
//                     </div> */}
//                     {/* <div className="playerGameMode">
//                         <div className="modeGrid">
//                             {Object.keys(GameData).map((key) => (
//                                 <div
//                                     key={key}
//                                     onClick={() => setSelectedGame(key)}
//                                     className={`pill-Container ${selectedGame === key ? 'active' : ''}`}
//                                 >
//                                     <div className="pill__title">{key}</div>
//                                     <div className="pill__sub">{GameData[key].subTitle}</div>
//                                 </div>
//                             ))}
//                         </div>
//                         <div className="TriviaLobby-container-main-content-left-main-content-difficulty-and-category-container">
//                             <div className="difficulty-and-category-container-category">
//                                 <h3 className="difficulty-and-category-container-category-title">Category</h3>
//                                 <select
//                                     value={category}
//                                     onChange={(e) => setCategory(e.target.value)}
//                                     className="difficulty-and-category-container-category-select"
//                                 >
//                                     {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
//                                 </select>
//                             </div>
//                             <div className="TATriviaLobby-container-main-content-left-main-content-difficulty-and-category-container-difficulty">
//                                 <h3 className="TATriviaLobby-container-main-content-left-main-content-difficulty-and-category-container-difficulty-title">Difficulty</h3>
//                                 <div className="TTriviaLobby-container-main-content-left-main-content-difficulty-and-category-container-difficulty-buttons">
//                                     {['easy', 'medium', 'hard'].map(d => (
//                                         <button
//                                             key={d}
//                                             onClick={() => setDifficulty(d)}
//                                             className={`TriviaLobby-container-main-content-left-main-content-difficulty-and-category-container-difficulty-buttons-button ${difficulty === d ? 'active' : ''}`}
//                                         >
//                                             {d}
//                                         </button>
//                                     ))}
//                                 </div>
//                             </div>
//                         </div>
//                     </div> */}
//                     <div className="playerGameMode">
//                         {/* STEP 1: GAME MODE */}
//                         {step === 1 && (
//                             <div className="modeGrid">
//                                 {Object.keys(GameData).map((key) => (
//                                     <div
//                                         key={key}
//                                         onClick={() => {
//                                             setSelectedGame(key);
//                                             setStep(2); // move next
//                                         }}
//                                         className={`pill-Container ${selectedGame === key ? 'active' : ''}`}
//                                     >
//                                         <div className="pill__title">{key}</div>
//                                         <div className="pill__sub">{GameData[key].subTitle}</div>
//                                     </div>
//                                 ))}
//                             </div>
//                         )}
//                         {/* STEP 2: CATEGORY */}
//                         {step === 2 && (
//                             <div className="difficulty-and-category-container-category">
//                                 <h3>Category</h3>
//                                 <div>
//                                     <select
//                                         value={category}
//                                         onChange={(e) => setCategory(e.target.value)}
//                                         className="difficulty-and-category-container-category-select"
//                                     >
//                                         {CATEGORIES.map(c => (
//                                             <option key={c} value={c}>{c}</option>
//                                         ))}
//                                     </select>
//                                 </div>
//                                 <div className="Step-2-button-Selection-container">
//                                     <button onClick={() => setStep(1)} className="backMove">Back</button>
//                                     <button onClick={() => setStep(3)} className="nextMove">Next</button>
//                                 </div>
//                             </div>
//                         )}
//                         {/* STEP 3: DIFFICULTY */}
//                         {step === 3 && (
//                             <div className="difficulty-container">
//                                 <h3 className='difficulty-container-title'>Difficulty</h3>
//                                 <div className="difficulty-btn-row">
//                                     {['easy', 'medium', 'hard'].map(d => (
//                                         <button
//                                             key={d}
//                                             onClick={() => setDifficulty(d)}
//                                             className={difficulty === d ? 'active difficulty-btn' : 'difficulty-btn'}
//                                         >
//                                             {d}
//                                         </button>
//                                     ))}
//                                 </div>
//                                 <div className="Step-3-button-Selection-container">
//                                     <button onClick={() => setStep(2)} className="backMove">Back</button>
//                                     <button onClick={() => setStep(4)} className="nextMove">Next</button>
//                                 </div>
//                             </div>
//                         )}
//                         {/* STEP 4: CONFIRM */}
//                         {step === 4 && (
//                             <div className="step-4-confirm-container">
//                                 <h3>Confirm Selection</h3>
//                                 <p className="confirm-text-title"><strong>Game:</strong> {selectedGame}</p>
//                                 <p className="confirm-text-category"><strong>Category:</strong> {category}</p>
//                                 <p className="confirm-text-difficulty"><strong>Difficulty:</strong> {difficulty}</p>
//                                 <div className="Step-4-button-Selection-container">
//                                     <button onClick={() => setStep(3)} className="backMove">Back</button>
//                                     <button onClick={handleQuickMatch} className="nextMove" disabled={creating || !authReady}>
//                                         {creating ? 'Matchingâ€¦' : 'Start Game'}
//                                     </button>
//                                 </div>
//                             </div>
//                         )}
//                     </div>
//                     <div>
//                         <div className="Chat-card">
//                             <ChatBox lobbyId={category} currentUser={currentUserForChat} />
//                         </div>
//                     </div>
//                 </div>
//             </div>
//             {/* rightSidebar */}
//             <LobbyRightSidebar
//                 user={user}
//                 themeColor={themeColor}
//                 title={title}
//                 invitedPlayers={invitedPlayers}
//                 setInvitedPlayers={setInvitedPlayers}
//                 onConfirmInvite={onConfirmInvite}
//                 maxPlayers={maxPlayers}
//             />
//         </div>
//     </div>
// ));
// const MatchmakingView = React.memo(({ difficulty, category, setView, themeColor }) => (
//     <div className="MatchmakingView-container">
//         <div className="relative">
//             {/* <motion.div
//                 className="MatchmakingView-ring-outer"
//                 style={{ borderColor: `${themeColor}33` }}
//                 animate={{ rotate: 360 }}
//                 transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
//             /> */}
//             <motion.div
//                 className="MatchmakingView-ring-inner"
//                 style={{ borderTopColor: themeColor }}
//                 animate={{ rotate: 360 }}
//                 transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
//             />
//             <div className="MatchmakingView-icon-container" style={{ backgroundColor: themeColor }}>
//                 <Brain className="MatchmakingView-icon text-white" size={40} />
//             </div>
//         </div>
//         <div className="MatchmakingView-content">
//             <h2 className="MatchmakingView-title">Finding Opponent</h2>
//             <p className="MatchmakingView-subtitle">Searching for a {difficulty} level match in {category}...</p>
//         </div>
//         <div className="MatchmakingView-info-box">
//             <div className="MatchmakingView-avatars">
//                 <div className="MatchmakingView-avatar-p1">P</div>
//                 <div className="MatchmakingView-avatar-opponent">?</div>
//             </div>
//             <div className="MatchmakingView-status-container">
//                 <p className="MatchmakingView-status-main">Waiting for player...</p>
//                 <p className="MatchmakingView-status-sub">Matching by skill level</p>
//             </div>
//         </div>
//     </div>
// ));
// const GameView = React.memo(({
//     currentQuestion,
//     user,
//     score,
//     isBotMatch,
//     timeLeft,
//     questionTime,
//     currentQuestionIndex,
//     totalQuestions,
//     matchStats,
//     streak,
//     matchLogs,
//     feedback,
//     handleAnswer,
//     currentPlayerTurn,
//     quitGame
// }) => {
//     if (!currentQuestion) return null;
//     return (
//         <div className="GameView-container">
//             {/* Header */}
//             <div className="GameView-Header-container">
//                 <div className="GameView-Header-Subcontainer">
//                     <div className="GameView-Header-Subcontainer-left flex items-center gap-6">
//                         <div style={{
//                             display: 'flex',
//                             alignItems: 'center',
//                             gap: '0.75rem',
//                             padding: '0.5rem',
//                             borderRadius: '1rem',
//                             transition: 'all 0.2s ease-in-out',
//                             backgroundColor: currentPlayerTurn === 'p1' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
//                             boxShadow: currentPlayerTurn === 'p1' ? '0 0 0 1px #10b981' : 'none',
//                         }}>
//                             <div className="GameView-Header-Subcontainer-left-player-icon">P1</div>
//                             <div>
//                                 <p className="GameView-User-Name">{user?.username}</p>
//                                 <p className="GameView-User-Score">Score: {score.player}</p>
//                             </div>
//                         </div>
//                         <div className="GameView-Header-Subcontainer-right      h-8 w-px bg-zinc-800" />
//                         <div className={`GameView-Header-Subcontainer-playerTurn flex items-center     ${currentPlayerTurn === 'p2' ? 'bg-emerald-500/20 ring-1 ring-emerald-500' : ''}`}>
//                             <div className="GameView-Header-Subcontainer-playerTurn-playerIcon">
//                                 {isBotMatch ? <Bot size={20} /> : 'P2'}
//                             </div>
//                             <div>
//                                 <p className="GameBot-User-Name      ">{isBotMatch ? 'AI Opponent' : 'Player 2'}</p>
//                                 <p className="GameBot-User-Score   ">Score: {score.opponent}</p>
//                             </div>
//                         </div>
//                     </div>
//                     <div className="GameView-TimerContainer">
//                         <TimerDisplay time={timeLeft} label="Match Time" icon={Timer} />
//                         <TimerDisplay time={`${currentQuestionIndex + 1} / ${totalQuestions}`} label="Question" />
//                         <button
//                             onClick={quitGame}
//                             className="GameView-TimerContainer-button"
//                         >
//                             Quit
//                         </button>
//                     </div>
//                 </div>
//             </div>
//             {/* Main Content */}
//             <div className="gamedisplay-container">
//                 <div className="gamedisplay-left">
//                     <div className="relative">
//                         <QuestionImage imageUrl={currentQuestion.imageUrl} feedback={feedback} />
//                         <QuestionTimer time={questionTime} />
//                         {/* Turn Overlay */}
//                         <AnimatePresence>
//                             {currentPlayerTurn === 'p2' && !feedback && (
//                                 <motion.div
//                                     initial={{ opacity: 0 }}
//                                     animate={{ opacity: 1 }}
//                                     exit={{ opacity: 0 }}
//                                     className="game-question-overlay   absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl"
//                                 >
//                                     <div className=" text-center space-y-4">
//                                         <div className="question-overlay-icon w-20 h-20 mx-auto rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 animate-pulse">
//                                             {isBotMatch ? <Bot size={40} /> : <UserIcon size={40} />}
//                                         </div>
//                                         <p className="question-overlay-text text-xl font-black text-white uppercase italic tracking-tighter">
//                                             {isBotMatch ? "AI is thinking..." : "Waiting for Player 2..."}
//                                         </p>
//                                     </div>
//                                 </motion.div>
//                             )}
//                         </AnimatePresence>
//                     </div>
//                     {/* Options Grid */}
//                     <div className="gamedisplay-options">
//                         {currentQuestion.options.map((opt, idx) => (
//                             <button
//                                 key={idx}
//                                 onClick={() => handleAnswer(idx)}
//                                 disabled={currentPlayerTurn !== 'p1' || !!feedback}
//                                 className={`option-btn ${currentPlayerTurn === 'p1' && !feedback
//                                     ? 'clickable'
//                                     : 'disabled'
//                                     }`}
//                             >
//                                 <div className="option-content">
//                                     <div className="option-content-icon">
//                                         {idx + 1}
//                                     </div>
//                                     <div className="option-content-text">
//                                         <span className="option-content-text-small">Select Name</span>
//                                         <span className="option-content-text-large">{opt}</span>
//                                     </div>
//                                 </div>
//                             </button>
//                         ))}
//                     </div>
//                 </div>
//                 <div className="gamedisplay-sidebar">
//                     <div className="performance-card">
//                         <h3 className="performance-title">
//                             <Zap size={18} className="text-amber-400" />
//                             Performance
//                         </h3>
//                         <div className="performance-stats-container">
//                             <div className="stat-row">
//                                 <span className="stat-label">Accuracy</span>
//                                 <span className="stat-value-white">
//                                     {matchStats.correct > 0 ? Math.round((matchStats.correct / Math.ceil((currentQuestionIndex + 1) / 2)) * 100) : 0}%
//                                 </span>
//                             </div>
//                             <ProgressBar progress={matchStats.correct > 0 ? (matchStats.correct / Math.ceil((currentQuestionIndex + 1) / 2)) * 100 : 0} color="bg-amber-400" />
//                             <div className="performance-footer">
//                                 <div className="stat-row">
//                                     <span className="stat-label">Current Streak</span>
//                                     <div className="stat-value-streak">
//                                         <Zap size={14} className="text-amber-400" fill="currentColor" />
//                                         <span>{streak}</span>
//                                     </div>
//                                 </div>
//                                 <div className="stat-row">
//                                     <span className="stat-label">Earned XP</span>
//                                     <span className="stat-value-xp">+{matchStats.xp}</span>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                     <div className="match-log-card">
//                         <h3 className="match-log-title">Match Log</h3>
//                         <div className="match-log-list custom-scrollbar">
//                             {matchLogs.map((log, i) => (
//                                 <div key={i} className="match-log-item">
//                                     <span className="match-log-item-info">
//                                         Q{log.index + 1} - {log.player === 'p1' ? 'You' : 'Opponent'}
//                                     </span>
//                                     <span className={log.correct ? 'match-log-status-correct' : 'match-log-status-wrong'}>
//                                         {log.correct ? 'Correct' : 'Wrong'}
//                                     </span>
//                                 </div>
//                             ))}
//                         </div>
//                     </div>
//                 </div>
//             </div>
//             {/* datanew */}
//         </div>
//     );
// });
// const ResultsView = React.memo(({ score, matchStats, setView, startMatchmaking, themeColor }) => {
//     const isWinner = score.player >= score.opponent;
//     return (
//         <div className="results-view-container">
//             <motion.div
//                 initial={{ opacity: 0, scale: 0.9 }}
//                 animate={{ opacity: 1, scale: 1 }}
//                 className="results-card"
//             >
//                 <div className="results-status-bar" style={{ backgroundColor: isWinner ? '#10b981' : '#ef4444' }} />
//                 <div>
//                     <div className={`results-trophy-container ${isWinner ? 'winner' : 'loser'}`}>
//                         <Trophy size={40} className="text-white" />
//                     </div>
//                     <h2 className="results-title">
//                         {isWinner ? 'Victory!' : 'Defeat'}
//                     </h2>
//                     <p className="results-subtitle">
//                         {isWinner ? 'You outsmarted your opponent' : 'Keep practicing to improve'}
//                     </p>
//                 </div>
//                 <div className="results-stats-grid">
//                     <div className="results-stat-card">
//                         <p className="results-stat-label">XP Earned</p>
//                         <p className="results-stat-value xp">+{matchStats.xp}</p>
//                     </div>
//                     <div className="results-stat-card">
//                         <p className="results-stat-label">Coins Gained</p>
//                         <p className="results-stat-value coins">+{matchStats.coins}</p>
//                     </div>
//                 </div>
//                 <div className="results-actions">
//                     <button
//                         onClick={() => setView('lobby')}
//                         className="results-btn-primary"
//                     >
//                         Return to Lobby
//                         <ChevronRight size={20} />
//                     </button>
//                     <button
//                         onClick={startMatchmaking}
//                         className="results-btn-secondary"
//                     >
//                         Play Again
//                     </button>
//                 </div>
//             </motion.div>
//         </div>
//     );
// });
// const ProfileView = React.memo(({ user, setView }) => {
//     const navigate = useNavigate();
//     return (
//         <div className="profile-container">
//             <header className="profile-header">
//                 <button onClick={() => setView('lobby')} className="profile-header-btn back">
//                     Back to Lobby
//                     <ChevronRight size={16} className="rotate-180" />
//                 </button>
//                 <h1 className="profile-title">Player Profile</h1>
//                 <button className="profile-header-btn logout">
//                     <LogOut size={16} />
//                     Logout
//                 </button>
//             </header>
//             <div className="profile-grid">
//                 <div className="profile-user-card">
//                     <div className="profile-avatar">
//                         {user?.username?.[0]}
//                     </div>
//                     <div>
//                         <h2 className="profile-username">{user?.username}</h2>
//                         <p className="profile-rank">Elite Intelligence Rank</p>
//                     </div>
//                     <div className="profile-level-info">
//                         <div className="profile-level-row">
//                             <span>Level {Math.floor((user?.xp || 0) / 1000) + 1}</span>
//                             <span>{(user?.xp || 0) % 1000} / 1000 XP</span>
//                         </div>
//                         <ProgressBar progress={(user?.xp || 0) % 100} />
//                     </div>
//                     <div className="recent-activities-or">
//                         <div className="heading">
//                             <div className="container">
//                                 <img className="icon" alt="Icon" src={icon4} />
//                             </div>
//                             <div className="text">Active Games</div>
//                         </div>
//                         <div className="background-border-wrapper">
//                             <div className="background-border">
//                                 <div className="total-XP-wrapper">
//                                     <span className="total-XP">TOTAL XP</span>
//                                     <span className="text-wrapper">42k</span>
//                                 </div>
//                                 {/* <div className="div-wrapper">
//                             </div> */}
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//                 <div className="profile-right-content">
//                     <div className='Charge-wallet-container'>
//                         <div className="wallet-section">
//                             <div className="overlay-blur" />
//                             <div className="div" />
//                             <div className="container">
//                                 <div className="container-2">
//                                     <div className="text">AVAILABLE BALANCE</div>
//                                     <div className="container-3">
//                                         <div className="overlay-border">
//                                             <div className="icon-wrapper">
//                                                 <img className="icon" alt="Icon" src={icon5} />
//                                             </div>
//                                         </div>
//                                         <div className="heading">
//                                             <div className="text-wrapper">{(user?.coins || 0).toLocaleString()}</div>
//                                         </div>
//                                     </div>
//                                 </div>
//                                 <button className="button" onClick={() => navigate('/checkout')}>
//                                     <div className="container-4">
//                                         <div className="img-wrapper">
//                                             {/* <img className="img" alt="Icon" src={image} /> */}
//                                         </div>
//                                         <div className="text-wrapper-2">Recharge Wallet</div>
//                                     </div>
//                                 </button>
//                             </div>
//                         </div>
//                     </div>
//                     <div className="profile-stats-grid">
//                         <StatCard icon={Trophy} label="Total Wins" value={user?.wins || 0} colorClass="bg-amber-500" />
//                         <StatCard
//                             icon={Target}
//                             label="Accuracy"
//                             value={user?.total_questions_answered ? `${Math.round((user.wins / user.total_questions_answered) * 100)}%` : "0%"}
//                             colorClass="bg-emerald-500"
//                         />
//                         <StatCard icon={Zap} label="Best Streak" value={user?.daily_streak || 0} colorClass="bg-blue-500" />
//                         <StatCard
//                             icon={Timer}
//                             label="Avg Speed"
//                             value={user?.total_questions_answered ? `${(user.total_time_taken / user.total_questions_answered).toFixed(1)}s` : "0s"}
//                             colorClass="bg-purple-500"
//                         />
//                     </div>
//                     <div className="profile-history-card">
//                         <h3 className="profile-history-title">Performance History</h3>
//                         <div className="profile-history-chart">
//                             {[40, 70, 45, 90, 65, 80, 55, 75, 60, 85].map((h, i) => (
//                                 <div key={i} className="chart-bar">
//                                     <motion.div
//                                         initial={{ height: 0 }}
//                                         animate={{ height: `${h}%` }}
//                                         className="chart-bar-fill"
//                                     />
//                                 </div>
//                             ))}
//                         </div>
//                         <div className="profile-history-footer">
//                             <span>Last 10 Matches</span>
//                             <span>Current Session</span>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     )
// });
// function TriviaLobby() {
//     const { gameId } = useParams();
//     const gameConfig = useMemo(() => getGameConfig(gameId || 'trivia'), [gameId]);
//     const { title, themeColor } = gameConfig;
//     const { user: contextUser, userId, refreshUser, deductCoins } = useUser();
//     // Fallback for when context isn't ready or user is missing
//     const user = contextUser || { id: userId, coins: 0, username: 'Guest', xp: 0 };
//     const [view, setView] = useState('lobby');
//     const [room, setRoom] = useState(null);
//     const [difficulty, setDifficulty] = useState('easy');
//     const [category, setCategory] = useState(gameId === 'math' ? 'Mathematics' : CATEGORIES[0]);
//     const [matchQuestions, setMatchQuestions] = useState([]);
//     const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
//     const [score, setScore] = useState({ player: 0, opponent: 0 });
//     const [matchStats, setMatchStats] = useState({ xp: 0, coins: 0, correct: 0 });
//     const [timeLeft, setTimeLeft] = useState(300);
//     const [questionTime, setQuestionTime] = useState(15);
//     const [streak, setStreak] = useState(0);
//     const [isBotMatch, setIsBotMatch] = useState(false);
//     const [matchLogs, setMatchLogs] = useState([]);
//     const [feedback, setFeedback] = useState(null);
//     const [currentPlayerTurn, setCurrentPlayerTurn] = useState('p1');
//     const matchmakingTimerRef = useRef(null);
//     const isMatchmakingRef = useRef(false);
//     const matchmakingRoomIdRef = useRef(null);
//     const socketRef = useRef(null);
//     const [selectedUid, setSelectedUid] = useState(null);
//     const [selectedGame, setSelectedGame] = useState('Solo vs Bot');
//     const [step, setStep] = useState(1);
//     const gamePlayers = useGamePlayers(gameId || 'trivia');
//     // Minimal fallbacks for lobby UI (demo mode)
//     const creating = false;
//     const authReady = true;
//     const visiblePlayers = gamePlayers.filter(p => p.uid !== userId);
//     const selectedPlayer = (selectedUid && visiblePlayers.find(p => p.uid === selectedUid)) || visiblePlayers[0] || null;
//     const currentUserForChat = useMemo(() => {
//         if (!userId) return null;
//         return {
//             uid: userId,
//             displayName: user?.username || 'Guest',
//             avatar: '/vite.svg',
//         };
//     }, [userId, user]);
//     const [invitedPlayers, setInvitedPlayers] = useState([]);
//     const [showInviteModal, setShowInviteModal] = useState(false);
//     const maxPlayers = useMemo(() => gameConfig.maxPlayers || 2, [gameConfig]);
//     const handleInvite = useCallback((player) => {
//         if (invitedPlayers.some(p => p.uid === player.uid)) return;
//         // Host (user) is 1 player, so we can invite maxPlayers - 1 friends
//         if (invitedPlayers.length >= maxPlayers - 1) {
//             alert(`Maximum ${maxPlayers} players allowed for this game.`);
//             return;
//         }
//         setInvitedPlayers(prev => [...prev, {
//             uid: player.uid,
//             name: player.profile?.displayName || player.uid,
//             avatar: player.profile?.avatar,
//             type: 'friend'
//         }]);
//     }, [invitedPlayers, maxPlayers]);
//     const handleEmailInvite = useCallback((email) => {
//         if (invitedPlayers.some(p => p.email === email)) return;
//         if (invitedPlayers.length >= maxPlayers - 1) {
//             alert(`Maximum ${maxPlayers} players allowed for this game.`);
//             return;
//         }
//         setInvitedPlayers(prev => [...prev, {
//             uid: `email_${Date.now()}`,
//             email: email,
//             name: email,
//             type: 'email'
//         }]);
//     }, [invitedPlayers, maxPlayers]);
//     const handleConfirmInvite = useCallback(async () => {
//         if (invitedPlayers.length === 0) return;
//         try {
//             // 1. Create the lobby in the backend
//             const lobbyResponse = await fetch('/api/lobby/create', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({
//                     ownerUid: userId,
//                     options: {
//                         gameType: gameId || 'trivia',
//                         difficulty,
//                         category,
//                         maxPlayers
//                     }
//                 })
//             });
//             const lobbyData = await lobbyResponse.json();
//             const lobbyId = lobbyData.id;
//             // 2. Send invitations for each invited player
//             await Promise.all(invitedPlayers.map(player =>
//                 fetch('/api/invite/send', {
//                     method: 'POST',
//                     headers: { 'Content-Type': 'application/json' },
//                     body: JSON.stringify({
//                         lobbyId,
//                         invitee: player,
//                         inviterUid: userId
//                     })
//                 })
//             ));
//             alert(`Lobby created and ${invitedPlayers.length} invitations sent!`);
//             // For 1v1, if requested by the user flow, we might still open the email modal
//             // if they want to invite *additional* people via email specifically.
//             // But based on the objective, "Confirm Invite" should process the current invited list.
//             if (maxPlayers === 2) {
//                 // Specific requirement for 1v1: Allow user to enter another player's email
//                 setShowInviteModal(true);
//             }
//         } catch (err) {
//             console.error("Failed to confirm invites:", err);
//             alert("Error creating lobby/sending invites.");
//         }
//     }, [invitedPlayers, maxPlayers, userId, gameId, difficulty, category]);
//     const handleQuickMatch = () => {
//         const opponent = findBestMatch({ uid: userId, profile: user }, visiblePlayers);
//         const match = {
//             id: Date.now(),
//             mode: '1v1',
//             players: [{ uid: userId, profile: user }, opponent],
//             isBotMatch: opponent.isBot || false,
//             createdAt: Date.now(),
//         };
//         // setLastMatch(match); // If you had a lastMatch state
//         console.log('MATCH CREATED (DEMO):', match);
//         startMatchmaking();
//     };
//     useEffect(() => {
//         // Initialize socket connection
//         socketRef.current = io('http://localhost:3000', {
//             reconnectionAttempts: 3,   // stop retrying after 3 fails
//             timeout: 5000,             // 5s connection timeout
//             reconnectionDelay: 2000,   // wait 2s between retries
//         });
//         socketRef.current.on('connect_error', (err) => {
//             console.warn('Socket unavailable (backend offline?):', err.message);
//         });
//         socketRef.current.on('gameStateUpdate', ({ lastActionBy, score: updatedScore, correct, index }) => {
//             if (lastActionBy !== userId) {
//                 // Update opponent's action in our state
//                 setScore(s => ({ ...s, opponent: updatedScore.player }));
//                 setMatchLogs(prev => [...prev, { index, correct, player: 'p2' }]);
//                 // Show feedback for opponent's turn if needed, or just move on
//                 setFeedback(correct ? 'correct' : 'wrong');
//                 setTimeout(() => {
//                     setFeedback(null);
//                     if (currentQuestionIndex < matchQuestions.length - 1) {
//                         setCurrentQuestionIndex(i => i + 1);
//                         setQuestionTime(15);
//                         setCurrentPlayerTurn('p1');
//                     }
//                 }, 1000);
//             }
//         });
//         socketRef.current.on('matchReady', ({ roomId, starterId, questions }) => {
//             if (!isMatchmakingRef.current) return;
//             const startsFirst = starterId === userId;
//             initGame(roomId, false, startsFirst, questions);
//         });
//         socketRef.current.on('gameOver', ({ winnerId, quitBy, scores }) => {
//             setScore({ player: scores.player1, opponent: scores.player2 });
//             setView('results');
//         });
//         return () => {
//             if (socketRef.current) socketRef.current.disconnect();
//         };
//     }, [userId, matchQuestions.length, currentQuestionIndex]);
//     /*
//     useEffect(() => {
//         const auth = getAuth();
//         return onAuthStateChanged(auth, (firebaseUser) => {
//             if (firebaseUser) {
//                 // Handle firebase user
//             }
//         });
//     }, []);
//     */
//     const usedQuestionIds = useRef(new Set());
//     const quitGame = useCallback(async () => {
//         if (room?.id) {
//             const isWinner = score.player > score.opponent;
//             const scoresForSocket = { player1: score.player, player2: score.opponent };
//             socketRef.current?.emit('quitGame', { roomId: room.id, userId, scores: scoresForSocket });
//             await fetch('/api/game/end', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({ userId, roomId: room.id, isWinner })
//             });
//         }
//         setView('lobby');
//         setRoom(null);
//         setMatchQuestions([]);
//         setCurrentQuestionIndex(0);
//         setScore({ player: 0, opponent: 0 });
//         setFeedback(null);
//         setTimeLeft(300);
//         refreshUser();
//     }, [userId, room?.id, score.player, score.opponent, refreshUser]);
//     const initGame = useCallback((roomId, bot, startsFirst = true, syncedQuestions = null) => {
//         if (matchmakingTimerRef.current) {
//             clearTimeout(matchmakingTimerRef.current);
//             matchmakingTimerRef.current = null;
//         }
//         matchmakingRoomIdRef.current = null;
//         setRoom({ id: roomId, player1_id: userId, player2_id: bot ? 'bot' : 'player2', status: 'active', difficulty, category });
//         setIsBotMatch(bot);
//         // State reset
//         const finalQuestions = syncedQuestions || getQuestionsForMatch(category, difficulty);
//         setMatchQuestions(finalQuestions);
//         setCurrentQuestionIndex(0);
//         setScore({ player: 0, opponent: 0 });
//         setMatchStats({ xp: 0, coins: 0, correct: 0 });
//         setTimeLeft(300);
//         setQuestionTime(15);
//         setStreak(0);
//         setMatchLogs([]);
//         setFeedback(null);
//         setCurrentPlayerTurn(startsFirst ? 'p1' : 'p2');
//         setView('game');
//     }, [userId, difficulty, category]);
//     const startMatchmaking = useCallback(async () => {
//         // Step 1: Try coin deduction â€” but NEVER block the game if it fails in demo/dev mode
//         try {
//             await deductCoins(10);
//         } catch (coinErr) {
//             // If the user genuinely has 0 coins AND the API is reachable, warn them.
//             // In demo/dev mode the backend may be unavailable â€” log and continue.
//             console.warn('Coin deduction skipped:', coinErr.message);
//             // Only hard-block if the context user confirms insufficient coins
//             if (coinErr.message === 'Insufficient coins' && (contextUser?.coins ?? 0) < 10) {
//                 alert('Insufficient coins! Please recharge to play.');
//                 return; // Stay on lobby â€” do NOT navigate to /checkout (route does not exist)
//             }
//         }
//         // Step 2: Enter matchmaking view
//         isMatchmakingRef.current = true;
//         setView('matchmaking');
//         // Short-circuit for Solo vs Bot
//         if (selectedGame === "Solo vs Bot") {
//             const soloRoomId = `solo_${userId}_${Date.now()}`;
//             matchmakingTimerRef.current = setTimeout(() => {
//                 if (isMatchmakingRef.current) initGame(soloRoomId, true);
//             }, 1200);
//             return;
//         }
//         try {
//             const res = await fetch('/api/matchmake', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({ userId, difficulty, category })
//                 body: JSON.stringify({ userId, difficulty, category, gameType: gameId || 'trivia' })
//             });
//             if (!isMatchmakingRef.current) return;
//             if (!res.ok) throw new Error('Matchmaking API failed');
//             const data = await res.json();
//             if (!isMatchmakingRef.current) return;
//             matchmakingRoomIdRef.current = data.roomId;
//             let questionsToShare = null;
//             if (data.mode === 'waiting') {
//                 questionsToShare = getQuestionsForMatch(category, difficulty);
//             }
//             socketRef.current?.emit('joinRoom', { roomId: data.roomId, userId, questions: questionsToShare });
//             if (data.mode === 'pvp') {
//                 console.log('Joined existing room, waiting for ready...');
//                 matchmakingTimerRef.current = setTimeout(() => {
//                     if (!isMatchmakingRef.current) return;
//                     console.log('PVP match timeout, falling back to bot...');
//                     initGame(data.roomId, true);
//                 }, 8000);
//             } else {
//                 // 'waiting' mode: give real players 2 seconds to join, then fall back to bot
//                 matchmakingTimerRef.current = setTimeout(async () => {
//                     try {
//                         if (!isMatchmakingRef.current) return;
//                         const roomRes = await fetch(`/api/room/${data.roomId}`);
//                         if (!isMatchmakingRef.current) return;
//                         if (!roomRes.ok) throw new Error('Room check failed');
//                         const roomData = await roomRes.json();
//                         if (!isMatchmakingRef.current) return;
//                         if (roomData.status === 'waiting') {
//                             await fetch('/api/matchmake/bot', {
//                                 method: 'POST',
//                                 headers: { 'Content-Type': 'application/json' },
//                                 body: JSON.stringify({ roomId: data.roomId, userId })
//                             });
//                             if (!isMatchmakingRef.current) return;
//                             initGame(data.roomId, true);
//                         }
//                     } catch (botErr) {
//                         console.warn('Room check failed, starting bot game immediately:', botErr.message);
//                         if (isMatchmakingRef.current) initGame(data.roomId || 'local_bot', true);
//                     }
//                 }, 2000); // 2s window for real players to join, then fall back to bot
//             }
//         } catch (apiErr) {
//             // API is unavailable â€” immediately start a local bot game, don't leave user stuck
//             console.warn('Matchmaking API unavailable, starting local bot game:', apiErr.message);
//             if (isMatchmakingRef.current) {
//                 initGame('local_fallback', true);
//             }
//         }
//     }, [userId, difficulty, category, initGame, deductCoins, contextUser]);
//     const cancelMatchmaking = useCallback(() => {
//         isMatchmakingRef.current = false;
//         if (matchmakingTimerRef.current) {
//             clearTimeout(matchmakingTimerRef.current);
//             matchmakingTimerRef.current = null;
//         }
//         if (matchmakingRoomIdRef.current) {
//             socketRef.current?.emit('leaveRoom', { roomId: matchmakingRoomIdRef.current, userId });
//             matchmakingRoomIdRef.current = null;
//         }
//         setView('lobby');
//     }, [userId]);
//     const endMatch = useCallback(async () => {
//         try {
//             const isWinner = score.player >= score.opponent;
//             await fetch('/api/game/end', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({ userId, roomId: room?.id, isWinner })
//             });
//             const userRes = await fetch(`/api/user/${userId}`);
//             if (userRes.ok) {
//                 const userData = await userRes.json();
//                 setUser(userData);
//             }
//         } catch (err) {
//             console.error('Failed to end match officially:', err);
//         } finally {
//             refreshUser();
//             setView('results');
//         }
//     }, [userId, room?.id, score.player, score.opponent, refreshUser]);
//     const nextQuestion = useCallback(() => {
//         if (currentQuestionIndex < matchQuestions.length - 1) {
//             setCurrentQuestionIndex(i => i + 1);
//             setQuestionTime(15);
//             setCurrentPlayerTurn(prev => prev === 'p1' ? 'p2' : 'p1');
//         } else {
//             endMatch();
//         }
//     }, [currentQuestionIndex, matchQuestions.length, endMatch]);
//     const handleAnswer = useCallback(async (index) => {
//         if (feedback || currentPlayerTurn !== 'p1') return;
//         const timeTaken = 15 - questionTime;
//         const currentQuestion = matchQuestions[currentQuestionIndex];
//         let isCorrect = false; // Local variable to avoid stale feedback closure
//         try {
//             const res = await fetch('/api/game/submit', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify({
//                     userId,
//                     roomId: room?.id,
//                     questionId: currentQuestion.id,
//                     selectedAnswer: index,
//                     correctIndex: currentQuestion.correctIndex,
//                     timeTaken,
//                     streak
//                 })
//             });
//             if (!res.ok) throw new Error('Answer submission failed');
//             const data = await res.json();
//             isCorrect = data.correct; // capture result before any state updates
//             if (data.correct) {
//                 setScore(s => {
//                     const newScore = { ...s, player: s.player + 1 };
//                     if (!isBotMatch) {
//                         socketRef.current?.emit('submitAnswer', {
//                             roomId: room?.id,
//                             userId,
//                             score: newScore,
//                             correct: true,
//                             index
//                         });
//                     }
//                     return newScore;
//                 });
//                 setMatchStats(s => ({
//                     ...s,
//                     xp: s.xp + (data.xp || 0),
//                     coins: s.coins + (data.coins || 0),
//                     correct: s.correct + 1
//                 }));
//                 setStreak(s => s + 1);
//                 setFeedback('correct');
//                 // Sync coins/xp with global context
//                 setTimeout(() => refreshUser(), 500);
//             } else {
//                 if (!isBotMatch) {
//                     socketRef.current?.emit('submitAnswer', {
//                         roomId: room?.id,
//                         userId,
//                         score,
//                         correct: false,
//                         index
//                     });
//                 }
//                 setStreak(0);
//                 setFeedback('wrong');
//                 // Track wrong answer speed as well
//                 fetch('/api/game/submit/wrong', {
//                     method: 'POST',
//                     headers: { 'Content-Type': 'application/json' },
//                     body: JSON.stringify({ userId, timeTaken })
//                 }).catch(console.error);
//             }
//         } catch (err) {
//             console.error('Answer submission error:', err);
//             isCorrect = index === currentQuestion.correctIndex; // fallback: derive locally
//             if (isCorrect) {
//                 setScore(s => ({ ...s, player: s.player + 1 }));
//                 setFeedback('correct');
//             } else {
//                 setFeedback('wrong');
//             }
//         }
//         setMatchLogs(prev => [...prev, { index: currentQuestionIndex, correct: isCorrect, player: 'p1' }]); // use local var, not stale feedback state
//         setTimeout(() => {
//             setFeedback(null);
//             nextQuestion();
//         }, 1000);
//     }, [feedback, currentPlayerTurn, questionTime, matchQuestions, currentQuestionIndex, userId, room?.id, streak, nextQuestion, isBotMatch, score, refreshUser]);
//     // Bot Turn Logic
//     useEffect(() => {
//         if (view === 'game' && isBotMatch && currentPlayerTurn === 'p2' && !feedback) {
//             const botAction = setTimeout(() => {
//                 const botAccuracy = difficulty === 'easy' ? 0.6 : (difficulty === 'medium' ? 0.75 : 0.9);
//                 const isCorrect = Math.random() < botAccuracy;
//                 if (isCorrect) {
//                     setScore(s => ({ ...s, opponent: s.opponent + 1 }));
//                     setFeedback('correct');
//                 } else {
//                     setFeedback('wrong');
//                 }
//                 setMatchLogs(prev => [...prev, { index: currentQuestionIndex, correct: isCorrect, player: 'p2' }]);
//                 setTimeout(() => {
//                     setFeedback(null);
//                     nextQuestion();
//                 }, 1000);
//             }, 2000);
//             // Bot takes 2 seconds to "think"
//             return () => clearTimeout(botAction);
//         }
//     }, [view, isBotMatch, currentPlayerTurn, feedback, difficulty, currentQuestionIndex, nextQuestion]);
//     useEffect(() => {
//         if (view !== 'game') return;
//         const timer = setInterval(() => {
//             setTimeLeft(t => {
//                 if (t <= 1) {
//                     clearInterval(timer);
//                     endMatch();
//                     return 0;
//                 }
//                 return t - 1;
//             });
//             setQuestionTime(t => {
//                 if (t <= 1) {
//                     nextQuestion();
//                     return 15;
//                 }
//                 return t - 1;
//             });
//         }, 1000);
//         return () => clearInterval(timer);
//     }, [view, nextQuestion, endMatch]);
//     return (
//         <Layout>
//             <div className="TopLobby-container ">
//                 <AnimatePresence mode="wait">
//                     <motion.div
//                         key={view}
//                         initial={{ opacity: 0, y: 10 }}
//                         animate={{ opacity: 1, y: 0 }}
//                         exit={{ opacity: 0, y: -10 }}
//                         transition={{ duration: 0.2 }}
//                     >
//                         {view === 'lobby' && (
//                             <LobbyView
//                                 user={user}
//                                 coins={user?.coins}
//                                 difficulty={difficulty}
//                                 setDifficulty={setDifficulty}
//                                 category={category}
//                                 setCategory={setCategory}
//                                 startMatchmaking={startMatchmaking}
//                                 setView={setView}
//                                 authReady={authReady}
//                                 creating={creating}
//                                 visiblePlayers={visiblePlayers}
//                                 selectedPlayer={selectedPlayer}
//                                 setSelectedUid={setSelectedUid}
//                                 handleQuickMatch={handleQuickMatch}
//                                 handleInvite={handleInvite}
//                                 currentUserForChat={currentUserForChat}
//                                 selectedGame={selectedGame}
//                                 setSelectedGame={setSelectedGame}
//                                 themeColor={themeColor}
//                                 title={title}
//                                 invitedPlayers={invitedPlayers}
//                                 setInvitedPlayers={setInvitedPlayers}
//                                 onConfirmInvite={handleConfirmInvite}
//                                 maxPlayers={maxPlayers}
//                                 gameId={gameId || 'trivia'}
//                                 step={step}
//                                 setStep={setStep}
//                             />
//                         )}
//                         {view === 'matchmaking' && (
//                             <MatchmakingView
//                                 difficulty={difficulty}
//                                 category={category}
//                                 setView={cancelMatchmaking}
//                                 themeColor={themeColor}
//                             />
//                         )}
//                         {view === 'game' && (
//                             <GameView
//                                 currentQuestion={matchQuestions[currentQuestionIndex]}
//                                 user={user}
//                                 score={score}
//                                 isBotMatch={isBotMatch}
//                                 timeLeft={timeLeft}
//                                 questionTime={questionTime}
//                                 currentQuestionIndex={currentQuestionIndex}
//                                 totalQuestions={matchQuestions.length}
//                                 matchStats={matchStats}
//                                 streak={streak}
//                                 matchLogs={matchLogs}
//                                 feedback={feedback}
//                                 handleAnswer={handleAnswer}
//                                 currentPlayerTurn={currentPlayerTurn}
//                                 quitGame={quitGame}
//                             />
//                         )}
//                         {view === 'results' && (
//                             <ResultsView
//                                 score={score}
//                                 matchStats={matchStats}
//                                 setView={setView}
//                                 startMatchmaking={startMatchmaking}
//                                 themeColor={themeColor}
//                             />
//                         )}
//                         {view === 'profile' && (
//                             <ProfileView user={user} setView={setView} />
//                         )}
//                     </motion.div>
//                 </AnimatePresence>
//             </div>
//             {showInviteModal && <Popup onClose={() => setShowInviteModal(false)} onSendInvite={handleEmailInvite} />}
//         </Layout>
//     );
// }
// export default TriviaLobby;
