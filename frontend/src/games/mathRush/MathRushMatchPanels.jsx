import React, { useState, useContext } from 'react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import {
    Trophy,
    LogOut,
    RotateCcw,
    Zap,
    Activity,
    User as UserIcon,
} from 'lucide-react';
import { AuthContext, GameContext } from './contexts.jsx';

export const QuitConfirmationModal = ({ onConfirm, onCancel }) => (
    <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="quite-verlay"
    >
        <Motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="quite-card-1"
        >
            <div className="quite-container-1">
                <div className="quite-icon-box-1">
                    <LogOut className="quite-icon-1" />
                </div>
                <div className="quite-text-1">
                    <h2 className="quite-title-1">Quit match?</h2>
                    <p className="quite-subtitle-1">
                        You will forfeit this duel. The other player wins unless they also leave.
                    </p>
                </div>
                <div className="quit-actions-1">
                    <button type="button" onClick={onCancel} className="btn-cancel-1">
                        Cancel
                    </button>
                    <button type="button" onClick={onConfirm} className="btn-confirm-1">
                        Quit now
                    </button>
                </div>
            </div>
        </Motion.div>
    </Motion.div>
);

export const StatsPanel = () => {
    const gameContext = useContext(GameContext);
    const authContext = useContext(AuthContext);
    if (!gameContext || !authContext) return null;
    const { timeLeft } = gameContext;
    const { profile } = authContext;

    return (
        <div className="stats-wrapper-1">
            <div className="timer-card-1">
                <div className="timer-svg-wrapper-1">
                    <svg className="timer-svg-1">
                        <circle cx="104" cy="104" r="90" className="timer-bg-circle-1" />
                        <Motion.circle
                            cx="104"
                            cy="104"
                            r="90"
                            fill="transparent"
                            stroke={timeLeft < 5 ? '#EA4335' : '#4285F4'}
                            strokeWidth="8"
                            strokeDasharray="565.5"
                            strokeLinecap="round"
                            animate={{ strokeDashoffset: 565.5 - (565.5 * timeLeft) / 15 }}
                            transition={{ duration: 1, ease: 'linear' }}
                            className={`timer-progress-1 ${timeLeft < 5 ? 'danger' : 'normal'}`}
                        />
                    </svg>
                </div>
                <div className="timer-content-1">
                    <Motion.span
                        key={timeLeft}
                        initial={{ scale: 1.1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`timer-value-1 ${timeLeft < 5 ? 'danger' : ''}`}
                    >
                        {timeLeft}
                    </Motion.span>
                    <span className="timer-label-1">Seconds Left</span>
                </div>
            </div>
            <div className="stat-card-2">
                <div className="stat-header-2">
                    <span className="stat-title-2">Personal Best</span>
                    <div className="stat-icon-2 yellow">
                        <Trophy className="stat-icon-svg-2" />
                    </div>
                </div>
                <span className="stat-value-2">{(profile?.highScore ?? 0).toLocaleString()}</span>
            </div>
            <div className="stat-card">
                <div className="stat-header">
                    <span className="stat-title">Win Rate</span>
                    <div className="stat-icon green">
                        <Activity className="stat-icon-svg" />
                    </div>
                </div>
                <div className="stat-row-2">
                    <span className="stat-value-2">78%</span>
                    <span className="stat-growth-2">
                        <Zap className="stat-growth-icon-2" />
                        +2.4%
                    </span>
                </div>
            </div>
        </div>
    );
};

export const GamePanel = () => {
    const gameContext = useContext(GameContext);
    const authContext = useContext(AuthContext);
    const [showQuitModal, setShowQuitModal] = useState(false);
    if (!gameContext || !authContext) return null;
    const { match, currentInput, setCurrentInput, submitAnswer, quitMatch, timeLeft } = gameContext;
    const { user } = authContext;

    const isMyTurn = match?.turn === user?.uid;
    const question = match?.currentProblem?.question || '0 + 0';

    const handleNumClick = (val) => {
        if (!isMyTurn) return;
        if (val === 'CLR') setCurrentInput('');
        else if (val === '=') {
            if (currentInput) submitAnswer(currentInput);
        } else if (currentInput.length < 8) {
            setCurrentInput((prev) => prev + val);
        }
    };

    return (
        <div className="MR-game-container custom-scrollbar">
            <div className="MR-match-status">
                <button
                    type="button"
                    onClick={() => setShowQuitModal(true)}
                    className="MR-quit-btn"
                    title="Quit match"
                    aria-label="Quit match"
                >
                    <LogOut className="quit-icon" />
                </button>
                <div className={`MR-player-card ${match?.turn === user?.uid ? 'active' : 'inactive'}`}>
                    <div className={`MR-player-avatar ${match?.turn === user?.uid ? 'blue' : ''}`}>
                        <img src={user?.photoURL || ''} alt="" />
                    </div>
                    <span className={`MR-player-label ${match?.turn === user?.uid ? 'blue-text' : ''}`}>You</span>
                </div>
                <div className="MR-round-box">
                    <span className="MR-round-label">Round</span>
                    <div className="MR-round-value">
                        <span>{match?.round || 1}</span>
                        <small>/10</small>
                    </div>
                    <div className="MR-mobile-timer">
                        <span className={timeLeft < 5 ? 'danger' : 'primary'}>{timeLeft}s</span>
                    </div>
                </div>
                <div className={`MR-player-card ${match?.turn !== user?.uid ? 'active red' : 'inactive'}`}>
                    <div className={`MR-player-avatar ${match?.turn !== user?.uid ? 'red' : ''}`}>
                        <img
                            src={match?.player1?.uid === user?.uid ? match?.player2?.photoURL : match?.player1?.photoURL}
                            alt=""
                        />
                    </div>
                    <span className={`MR-player-label ${match?.turn !== user?.uid ? 'red-text' : ''}`}>
                        {match?.player1?.uid === user?.uid ? match?.player2?.displayName : match?.player1?.displayName}
                    </span>
                </div>
            </div>
            <div className="MR-problem-card">
                <div className="MR-problem-overlay" />
                <div className="MR-problem-content">
                    {!isMyTurn ? (
                        <div className="MR-thinking">
                            <div className="MR-thinking-dots">
                                <div className="MR-dot red" />
                                <div className="MR-dot blue" />
                                <div className="MR-dot yellow" />
                            </div>
                            <span className="MR-thinking-text">Opponent is calculating...</span>
                        </div>
                    ) : (
                        <>
                            <span className="MR-problem-label">Solve this problem</span>
                            <h2 className="MR-problem-question">{question}</h2>
                        </>
                    )}
                </div>
                <div className={`MR-turn-indicator ${isMyTurn ? 'active' : ''}`}>
                    {isMyTurn ? 'Your Turn' : 'Opponent is thinking...'}
                </div>
            </div>
            <div className="MR-input-section">
                <div className="MR-answer-box">
                    <span className={`MR-answer-text ${currentInput ? 'filled' : ''}`}>
                        {currentInput || 'ANSWER'}
                    </span>
                    {isMyTurn && (
                        <div
                            className="MR-answer-progress"
                            style={{ width: `${(currentInput.length / 8) * 100}%` }}
                        />
                    )}
                </div>
                <div className="MR-keypad">
                    {['7', '8', '9', 'CLR', '4', '5', '6', '0', '1', '2', '3', '='].map((btn) => (
                        <button
                            type="button"
                            key={btn}
                            onClick={() => handleNumClick(btn)}
                            disabled={!isMyTurn}
                            className={`MR-key ${btn === '=' ? 'equal' : btn === 'CLR' ? 'clear' : ''} ${!isMyTurn ? 'disabled' : ''}`}
                        >
                            {btn}
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence>
                {showQuitModal && (
                    <QuitConfirmationModal
                        key="quit-modal"
                        onConfirm={() => {
                            setShowQuitModal(false);
                            quitMatch?.();
                        }}
                        onCancel={() => setShowQuitModal(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export const MatchStatsPanel = () => {
    const gameContext = useContext(GameContext);
    const authContext = useContext(AuthContext);
    if (!gameContext || !authContext) return null;
    const { match } = gameContext;
    const { user } = authContext;
    if (!match) return null;

    return (
        <div className="stats-panel">
            <div className="stats-header">
                <h3 className="stats-title">
                    <div className="stats-icon-box">
                        <Activity className="stats-icon" />
                    </div>
                    Live Match Stats
                </h3>
            </div>
            <div className="stats-body">
                <div className="player-stats blue-theme">
                    <div className="player-info">
                        <div className="avatar blue-border">
                            <img
                                src={match.player1.uid === user?.uid ? match.player1.photoURL : match.player2.photoURL}
                                alt=""
                            />
                        </div>
                        <div>
                            <h4 className="player-name">You</h4>
                            <p className="player-score blue-text">
                                Score: {match.player1.uid === user?.uid ? match.player1.score : match.player2.score}
                            </p>
                        </div>
                    </div>
                    <div className="stats-grid">
                        <div>
                            <span className="stat-label">Correct</span>
                            <span className="stat-value green">
                                {match.player1.uid === user?.uid ? match.player1.successCount : match.player2.successCount}
                            </span>
                        </div>
                        <div>
                            <span className="stat-label">Wrong</span>
                            <span className="stat-value red">
                                {match.player1.uid === user?.uid ? match.player1.failureCount : match.player2.failureCount}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="player-stats red-theme">
                    <div className="player-info">
                        <div className="avatar red-border">
                            <img
                                src={match.player1.uid === user?.uid ? match.player2.photoURL : match.player1.photoURL}
                                alt=""
                            />
                        </div>
                        <div>
                            <h4 className="player-name truncate">
                                {match.player1.uid === user?.uid ? match.player2.displayName : match.player1.displayName}
                            </h4>
                            <p className="player-score red-text">
                                Score: {match.player1.uid === user?.uid ? match.player2.score : match.player1.score}
                            </p>
                        </div>
                    </div>
                    <div className="stats-grid">
                        <div>
                            <span className="stat-label">Correct</span>
                            <span className="stat-value green">
                                {match.player1.uid === user?.uid ? match.player2.successCount : match.player1.successCount}
                            </span>
                        </div>
                        <div>
                            <span className="stat-label">Wrong</span>
                            <span className="stat-value red">
                                {match.player1.uid === user?.uid ? match.player2.failureCount : match.player1.failureCount}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="match-progress">
                <span className="progress-title">Match Progress</span>
                <div className="progress-content">
                    <div className="progress-row">
                        <span>Round</span>
                        <span className="progress-value">
                            {match.round} / {match.maxRounds}
                        </span>
                    </div>
                    <div className="progress-bar">
                        <Motion.div
                            className="progress-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${(match.round / match.maxRounds) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SignInModal = ({ onSignIn, onClose }) => {
    const [name, setName] = useState('');
    return (
        <Motion.div className="name-modal-overlay">
            <Motion.div className="name-modal">
                <div className="name-modal-topbar" />
                <div className="name-modal-content">
                    <div className="name-icon-box">
                        <UserIcon className="name-icon" />
                    </div>
                    <h2 className="name-title">Welcome, Player!</h2>
                    <p className="name-subtitle">Enter your name to start your math journey.</p>
                    <div className="name-form">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your name..."
                            className="name-input"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && name.trim()) onSignIn(name.trim());
                            }}
                        />
                        <div className="name-actions">
                            <button type="button" onClick={onClose} className="btn-cancel">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => name.trim() && onSignIn(name.trim())}
                                disabled={!name.trim()}
                                className="btn-start"
                            >
                                Start Playing
                            </button>
                        </div>
                    </div>
                </div>
            </Motion.div>
        </Motion.div>
    );
};
