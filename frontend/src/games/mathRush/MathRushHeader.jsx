import React, { useContext } from 'react'
import { motion } from 'motion/react';
import { Star, Menu, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AuthContext, GameContext } from './contexts';
import {
  navigateToCheckoutOrGate,
  useMergedPlayerProfile,
} from '../../hooks/useBillingAccess.js';
import './styles/lobby.css';

export default function MathRushHeader({ lobbyMode = false }) {
    const navigate = useNavigate();
    const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
    const mergedProfile = useMergedPlayerProfile();
    const authContext = useContext(AuthContext);
    const gameContext = useContext(GameContext);
    if (!authContext || !gameContext) return null;
    const { user, profile } = authContext;
    const { match } = gameContext;

    const opponent =
        match?.player1 && match?.player2
            ? match.player1.uid === user?.uid
                ? match.player2
                : match.player1
            : null;
    const currentPlayer =
        match?.player1 && match?.player2
            ? match.player1.uid === user?.uid
                ? match.player1
                : match.player2
            : null;
    return (

       
        <header className={`Math-Rush-header${lobbyMode ? ' Math-Rush-header--lobby' : ''}`}>
            <div className="Math-Rush-header-left">

                {lobbyMode ? (
                    <Link to="/player/dashboard" className="Math-Rush-menu-btn" aria-label="Open menu">
                        <Menu size={20} />
                    </Link>
                ) : null}

                <div className="Math-Rush-logo-wrapper">
                    <h1 className="Math-Rush-logo-text">
                        <span className="Math-Rush-logo-sub">Math Rush</span>
                    </h1>
                </div>

                {profile && (
                    <div className="Math-Rush-p-stats">

                        <div className="Math-Rush-coins-box">
                            <Star className="Math-Rush-coin-icon" />
                            <span className="Math-Rush-coin-v">{profile?.coins ?? 0}</span>
                        </div>

                        {lobbyMode ? (
                            <button
                                type="button"
                                className="Math-Rush-recharge-btn"
                                title="Recharge coins"
                                onClick={() =>
                                  navigateToCheckoutOrGate(navigate, isAuthenticated, mergedProfile)
                                }
                            >
                                <Plus size={14} />
                                <span>Recharge</span>
                            </button>
                        ) : null}

                        <div className="Math-Rush-xp-box">
                            <div className="Math-Rush-xp-header">
                                <span className="Math-Rush-xp-level">Level {profile?.level ?? 1}</span>
                                <span className="Math-Rush-xp-percent">{(profile?.xp ?? 0) % 100}%</span>
                            </div>

                            <div className="Math-Rush-xp-bar">
                                <motion.div
                                    className="Math-Rush-xp-fill"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(profile?.xp ?? 0) % 100}%` }}
                                    transition={{ type: "spring", stiffness: 50, damping: 20 }}
                                />
                            </div>
                        </div>

                    </div>
                )}
            </div>

            <div className="Math-Rush-score-board">
                <div className="Math-Rush-score-card">

                    <div className="Math-Rush-score-player">
                        <span className="Math-Rush-score-value">
                            {currentPlayer?.score || profile?.highScore || "0"}
                        </span>
                        <span className="Math-Rush-score-ve">YOU</span>
                    </div>

                    <div className="Math-Rush-divider" />

                    <div className="Math-Rush-score-player">
                        <span className="score-value muted">
                            {opponent?.score || "0"}
                        </span>
                        <span className="score-label">OPPONENT</span>
                    </div>

                </div>
            </div>

            <div className="Math-Rush-header-right">
                {user && (
                    <div className="Math-Rush-user-section">

                        <div className="Math-Rush-user-info">
                            <span className="Math-Rush-user-name">{profile?.displayName}</span>
                            <div className="Math-Rush-user-status">
                                <span className="Math-Rush-status-text">Online</span>
                                <div className="Math-Rush-status-dot" />
                            </div>
                        </div>

                        {/* <div className="Math-Rush-avatar-wrapper">
                            <img
                                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`}
                                className="Math-Rush-avatar-img"
                                alt=""
                                referrerPolicy="no-referrer"
                            />
                            <div className="Math-Rush-avatar-status">
                                <div className="Math-Rush-status-dot-inner" />
                            </div>
                        </div> */}

                        {/* <button onClick={signOut} className="Math-Rush-logout-btn" title="Sign Out">
                            <LogOut className="Math-Rush-logout-icon" />
                        </button> */}

                    </div>
                )}
            </div>
        </header>



    );
}

//  MathRushHeader



