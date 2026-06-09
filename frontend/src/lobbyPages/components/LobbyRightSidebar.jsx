import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    Lightbulb,
    BarChart3,
    Trophy,
    Flame,
    Coins,
    Target,
    Timer,
    Award,
    ExternalLink,
    ChevronRight,
} from 'lucide-react';
import '../triviaGame.css';
import '../PlayersLobby.css';

/**
 * Default progress bar (matches the existing TriviaLobby design when the parent
 * doesn't pass a custom one).
 */
const DefaultProgressBar = ({ progress, themeColor }) => (
    <div className="progress-bar-container">
        <div
            className="progress-bar-fill"
            style={{
                backgroundColor: themeColor || '#10b981',
                width: `${Math.max(0, Math.min(100, progress))}%`,
                transition: 'width 0.3s ease',
            }}
        />
    </div>
);

const DEFAULT_TIPS = [
    'Read all four options before answering.',
    'Use easy mode to warm up and build streak.',
    'In 1v1, speed matters when scores are tied.',
    'Invite mode is best for private practice with friends.',
];

/** Same level formula the server uses (`backend/src/services/userFirestoreAdmin.levelFromXp`). */
function deriveLevelFromXp(xp) {
    const x = Math.max(0, Number(xp) || 0);
    return Math.max(1, 1 + Math.floor(x / 1000));
}

/**
 * Map a lobby `gameId` prop to the canonical Firestore key under `users/{uid}.games`.
 * Returns `null` for games that don't have a per-game bucket yet (Enigma, NeuroChain) —
 * we fall back to the global `stats` totals in that case.
 */
function gameKeyFor(gameId) {
    switch (String(gameId || '').toLowerCase()) {
        case 'ludo':
            return 'ludo';
        case 'trivia':
            return 'trivia';
        case 'math':
        case 'mathrush':
            return 'mathRush';
        default:
            return null;
    }
}

/**
 * Pretty label per game so the same tile slot reads naturally in every lobby.
 */
function tileLabelsFor(gameId) {
    switch (String(gameId || '').toLowerCase()) {
        case 'ludo':
            return { matches: 'Ludo Matches', wins: 'Ludo Wins', extra: 'Daily Streak' };
        case 'trivia':
            return { matches: 'Trivia Matches', wins: 'Trivia Wins', extra: 'Accuracy' };
        case 'math':
        case 'mathrush':
            return { matches: 'Math Matches', wins: 'Best Score', extra: 'Avg Speed' };
        case 'enigma':
            return { matches: 'Total Matches', wins: 'Total Wins', extra: 'Daily Streak' };
        case 'neurochain':
            return { matches: 'Total Matches', wins: 'Total Wins', extra: 'Daily Streak' };
        default:
            return { matches: 'Matches', wins: 'Wins', extra: 'Daily Streak' };
    }
}

/**
 * Build the read-only stats view-model for the sidebar.
 *
 * Reads the live Firestore-mirrored Redux state (`state.user`) which is updated
 * by `frontend/src/Components/UserSync.jsx`. The optional `userOverride` prop
 * is only used as a fallback for `displayName` / `avatar` so legacy callers
 * that pass a custom user object still work.
 */
function useLobbyStatsViewModel(gameId, userOverride) {
    const authUser = useSelector((state) => state.auth?.user);
    const userSlice = useSelector((state) => state.user);

    return useMemo(() => {
        const profile = userSlice?.profile || {};
        const games = userSlice?.games || {};
        const stats = userSlice?.stats || {};

        const signedIn = Boolean(authUser?.uid);

        const displayName =
            profile.displayName ||
            profile.username ||
            userOverride?.displayName ||
            userOverride?.username ||
            authUser?.displayName ||
            authUser?.username ||
            authUser?.email?.split('@')[0] ||
            'Player';

        const avatar =
            profile.avatar ||
            profile.photoURL ||
            userOverride?.avatar ||
            userOverride?.photoURL ||
            authUser?.photoURL ||
            null;

        const xp = Number(userSlice?.xp ?? profile.xp ?? 0);
        const level = Number(userSlice?.level ?? profile.level ?? deriveLevelFromXp(xp));
        const xpInLevel = xp % 1000;
        const xpToNext = 1000;
        const xpProgressPct = (xpInLevel / xpToNext) * 100;

        const coins = Number(userSlice?.coins ?? profile.coins ?? 0);

        // Global (cross-game) stats
        const globalMatches = Number(stats.totalMatches ?? 0);
        const globalWins = Number(stats.wins ?? 0);
        const globalLosses = Number(stats.losses ?? 0);
        const dailyStreak = Number(userSlice?.dailyStreak ?? profile.dailyStreak ?? 0);
        const dailyStreakBest = Number(stats.dailyStreakBest ?? 0);
        const avgMoveSpeedMs = Number(stats.avgMoveSpeedMs ?? 0);
        const avgSpeedSec = avgMoveSpeedMs > 0 ? (avgMoveSpeedMs / 1000).toFixed(1) : '0.0';

        let globalAccuracy = Number(stats.accuracy ?? 0);
        if (globalAccuracy > 0 && globalAccuracy <= 1) globalAccuracy *= 100;
        if (!globalAccuracy && globalMatches > 0) {
            globalAccuracy = (globalWins / globalMatches) * 100;
        }
        globalAccuracy = Math.max(0, Math.min(100, Math.round(globalAccuracy)));

        /**
         * Per-game slice — sources by `gameKey`:
         *   • ludo      → `games.ludo.{matches, wins, xp}`        (server: ludoFirestoreSync)
         *   • trivia    → `games.trivia.{matches, wins, accuracy}` (callable: updateGameStats)
         *   • mathRush  → `games.mathRush.{matches, xp, bestScore}`
         *                 + `stats.{mathRushWins, mathRushMatches}` (NO `wins` under games.mathRush)
         *   • enigma / neurochain → no per-game bucket exists yet → fall back to global stats.*
         */
        const gKey = gameKeyFor(gameId);
        const gameRow = (gKey && games[gKey]) || {};

        let gameMatches = Number(gameRow.matches ?? 0);
        let gameWins = Number(gameRow.wins ?? 0);
        const gameXp = Number(gameRow.xp ?? 0);
        const gameAccuracyRaw = Number(gameRow.accuracy ?? 0);
        const gameBestScore = Number(gameRow.bestScore ?? 0);

        if (gKey === 'mathRush') {
            // `games.mathRush.wins` is not a documented field — wins live under stats.mathRushWins.
            gameWins = Number(stats.mathRushWins ?? gameWins ?? 0);
            if (!gameMatches) {
                gameMatches = Number(stats.mathRushMatches ?? 0);
            }
        }

        let gameWinRate = 0;
        if (gameMatches > 0) gameWinRate = Math.round((gameWins / gameMatches) * 100);
        else if (globalMatches > 0) gameWinRate = Math.round((globalWins / globalMatches) * 100);

        // Game-specific "extra" tile value (the third metric on the bottom row)

        let extraValue = '0';
        const labels = tileLabelsFor(gameId);
        switch (labels.extra) {
            case 'Accuracy': {
                let acc = gameAccuracyRaw > 0 && gameAccuracyRaw <= 1 ? gameAccuracyRaw * 100 : gameAccuracyRaw;
                if (!acc) acc = globalAccuracy;
                extraValue = `${Math.round(Math.max(0, Math.min(100, acc)))}%`;
                break;
            }
            case 'Avg Speed':
                extraValue = `${avgSpeedSec}s`;
                break;
            case 'Daily Streak':
            default:
                extraValue = `${dailyStreak}🔥`;
                break;
        }

        // For MathRush we surface "Best Score" instead of wins in the top row

        const useBestScore = labels.wins === 'Best Score';

        return {
            signedIn,
            displayName,
            avatar,
            level,
            xp,
            xpInLevel,
            xpToNext,
            xpProgressPct,
            coins,
            // Per-game tiles
            gameKey: gKey,
            gameMatches: gKey ? gameMatches : globalMatches,
            gameWins: useBestScore ? gameBestScore : (gKey ? gameWins : globalWins),
            gameWinRate,
            extraValue,
            extraLabel: labels.extra,
            matchesLabel: labels.matches,
            winsLabel: labels.wins,
            // Footer chips
            globalMatches,
            globalWins,
            globalLosses,
            dailyStreak,
            dailyStreakBest,
            gameXp,
        };
    }, [authUser, userSlice, gameId, userOverride]);
}

const LobbyRightSidebar = ({
    user = null,
    gameId = 'trivia',
    selectedMode = '',
    themeColor = '#10b981',
    ProgressBar,
    invitedPlayers = [],
    setInvitedPlayers,
    onConfirmInvite,
    maxPlayers = 2,
    /** When `gameId` is `ludo`, controls the Invited Players panel. Ignored for all other games (panel is Ludo-only). */
    showInviteSection = undefined,
    tips = DEFAULT_TIPS,
    /**
     * "View full stats" link visibility.
     * Default policy (Apr 2026): only Ludo has a dedicated profile page (`/profile`,
     * `Components/Profile.jsx` is Ludo-themed). Other games will get their own
     * dashboards later; pass `showFullStatsLink` and `fullStatsHref` to opt in.
     */
    showFullStatsLink = undefined,
    fullStatsHref = undefined,
    /** When false, hides the stats block (mobile split layouts). Default true. */
    showStatsSection = true,
    /** When false, hides the tips / game guide block. Default true. */
    showGuideSection = true,
}) => {
    const navigate = useNavigate();
    const ActualProgressBar = ProgressBar || DefaultProgressBar;
    const [tipsOpen, setTipsOpen] = useState(false);

    const vm = useLobbyStatsViewModel(gameId, user);

    /** Resolve where the link should go and whether it should be visible at all. */
    const fullStatsLink = useMemo(() => {
        const explicit = typeof showFullStatsLink === 'boolean' ? showFullStatsLink : null;
        const isLudo = String(gameId || '').toLowerCase() === 'ludo';
        const visible = explicit ?? isLudo;
        if (!visible) return { visible: false, href: null };
        const href = fullStatsHref || (isLudo ? '/profile' : null);
        return { visible: Boolean(href), href };
    }, [gameId, showFullStatsLink, fullStatsHref]);

    const shouldShowInvites = useMemo(() => {
        const gid = String(gameId || '').toLowerCase();
        // Invited-players list in this sidebar is Ludo-only; Enigma / Math Rush / Trivia / etc. use sliders or modals.
        if (gid !== 'ludo') return false;
        if (typeof showInviteSection === 'boolean') return showInviteSection;
        return true;
    }, [showInviteSection, gameId]);

    return (
        <div className="lobby-right-sidebar">
            <div className="TriviaLobby-container-main-content-right">
                {showStatsSection ? (
                <div className="TriviaLobby-container-main-content-right-stats-container">
                    <h3 className="TriviaLobby-container-main-content-right-stats-container-title">
                        <BarChart3 size={18} className="TriviaLobby-container-main-content-right-stats-container-title-icon" />
                        Your Stats
                        {fullStatsLink.visible && (
                            <button
                                type="button"
                                className="lobby-stats-link"
                                style={{
                                    marginLeft: 'auto',
                                    background: 'transparent',
                                    border: 0,
                                    color: themeColor,
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                onClick={() => navigate(fullStatsLink.href)}
                                title="Open full profile"
                            >
                                View full stats <ExternalLink size={12} />
                            </button>
                        )}
                    </h3>

                    {!vm.signedIn && (
                        <div className="muted" style={{ marginBottom: 8 }}>
                            Sign in to track your stats.
                        </div>
                    )}

                    <div className="TriviaLobby-container-main-content-right-stats-container-stats">
                        <div className="mr-stats-level-tile" aria-hidden="false">
                            <p className="mr-stats-level-tile__label">Level</p>
                            <p className="mr-stats-level-tile__value">{vm.level}</p>
                        </div>

                        <div className="TriviaLobby-container-main-content-right-stats-container-stats-level">
                            <span className="TriviaLobby-container-main-content-right-stats-container-stats-level-text">
                                <Trophy size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                                Level {vm.level}
                            </span>
                            <span className="TriviaLobby-container-main-content-right-stats-container-stats-level-xp">
                                {vm.xpInLevel} / {vm.xpToNext} XP
                            </span>
                        </div>

                        <ActualProgressBar progress={vm.xpProgressPct} themeColor={themeColor} />

                        <div className="TriviaLobby-container-main-content-right-stats-container-stats-matches-and-win-rate">
                            <div className="TriviaLobby-container-main-content-right-stats-container-stats-matches">
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-matches-text">
                                    {vm.matchesLabel}
                                </p>
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-matches-count">
                                    {vm.gameMatches}
                                </p>
                            </div>
                            <div className="TriviaLobby-container-main-content-right-stats-container-stats-win-rate">
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-win-rate-text">
                                    Win Rate
                                </p>
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-win-rate-count">
                                    {vm.gameWinRate}%
                                </p>
                            </div>
                        </div>

                        <div className="TriviaLobby-container-main-content-right-stats-container-stats-matches-and-win-rate">
                            <div className={`TriviaLobby-container-main-content-right-stats-container-stats-matches${vm.winsLabel === 'Best Score' ? ' mr-stats-elo-label' : ''}`}>
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-matches-text">
                                    <Award size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                                    {vm.winsLabel}
                                </p>
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-matches-count">
                                    {vm.gameWins}
                                </p>
                            </div>
                            <div className="TriviaLobby-container-main-content-right-stats-container-stats-win-rate">
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-win-rate-text">
                                    {vm.extraLabel === 'Avg Speed' ? <Timer size={12} style={{ verticalAlign: -1, marginRight: 4 }} /> : null}
                                    {vm.extraLabel === 'Accuracy' ? <Target size={12} style={{ verticalAlign: -1, marginRight: 4 }} /> : null}
                                    {vm.extraLabel === 'Daily Streak' ? <Flame size={12} style={{ verticalAlign: -1, marginRight: 4 }} /> : null}
                                    {vm.extraLabel}
                                </p>
                                <p className="TriviaLobby-container-main-content-right-stats-container-stats-win-rate-count">
                                    {vm.extraValue}
                                </p>
                            </div>
                        </div>

                        {/* Footer chips: cross-game totals + wallet */}

                        <div
                            style={{
                                display: 'flex',
                                gap: 8,
                                marginTop: 10,
                                flexWrap: 'wrap',
                                fontSize: 12,
                                opacity: 0.85,
                            }}
                        >
                            <span
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                title="Total matches across every game"
                            >
                                <BarChart3 size={12} /> {vm.globalMatches} total
                            </span>
                            <span
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                title="Total wins across every game"
                            >
                                <Trophy size={12} /> {vm.globalWins} wins
                            </span>
                            <span
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                }}
                                title="Wallet balance (live)"
                            >
                                <Coins size={12} /> {vm.coins}
                            </span>
                        </div>
                    </div>
                </div>
                ) : null}

                {showGuideSection ? (
                <div className="TriviaLobby-container-main-content-right-daily-streak-container TriviaLobby-container-main-content-right-guide-card">
                    <div className="TriviaLobby-container-main-content-right-daily-streak-container-title trivia-guide-title--desktop">
                        <Lightbulb className="TriviaLobby-container-main-content-right-daily-streak-container-title-icon" size={20} />
                        <h3 className="TriviaLobby-container-main-content-right-daily-streak-container-title-text">Tips</h3>
                    </div>
                    <button
                        type="button"
                        className="trivia-mobile-guide-card"
                        onClick={() => setTipsOpen(true)}
                    >
                        <div className="trivia-mobile-guide-card__head">
                            <Lightbulb className="TriviaLobby-container-main-content-right-daily-streak-container-title-icon" size={20} />
                            <h3 className="TriviaLobby-container-main-content-right-daily-streak-container-title-text">Game Guide</h3>
                            <ChevronRight size={18} className="trivia-mobile-guide-card__chevron" aria-hidden />
                        </div>
                        <p className="trivia-mobile-guide-card__sub">Learn rules, tips &amp; more!</p>
                    </button>
                    <div className="content-right-daily-streak-container-days content-right-daily-streak-container-days--desktop">
                        <div className="mr-guide-row">
                            <p className="mr-guide-tip-text">{tips[0]}</p>
                            <span className="mr-guide-trophy" aria-hidden>🏆</span>
                        </div>
                        <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => setTipsOpen(true)}
                        >
                            Open Game Guide
                        </button>
                    </div>
                </div>
                ) : null}
            </div>

            {tipsOpen ? (
                <div className="popup-overlay" role="dialog" aria-modal="true">
                    <div className="popup popup--tips">
                        <div className="popup-header">
                            <h3 className="popup-title">Game Guide</h3>
                            <button className="close-btn" onClick={() => setTipsOpen(false)} aria-label="Close game guide">x</button>
                        </div>
                        <div className="popup-body">
                            <ul className="tips-list">
                                {tips.map((tip, idx) => (
                                    <li key={`${idx}-${tip}`} className="muted tips-list-item">
                                        {idx + 1}. {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            ) : null}

            {shouldShowInvites ? (
                <div className="lobby-right-sidebar-invites">
                    <div className="card-invitee">
                        <div className="card__title">
                            <span>Invited Players</span>
                            <span className="muted">{invitedPlayers.length} / {maxPlayers - 1} invited</span>
                        </div>

                        <div className="invited-list" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {invitedPlayers.length === 0 && (
                                <div className="muted" style={{ textAlign: 'center', padding: '10px 0' }}>No players invited yet</div>
                            )}

                            {invitedPlayers.map((player) => (
                                <div className="row" key={player.uid} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 8 }}>
                                    <div className="row__avatar">
                                        {player.type === 'email' ? (
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: themeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                                                ✉️
                                            </div>
                                        ) : (
                                            <img src={player.avatar || '/player1.png'} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                                        )}
                                    </div>

                                    <div className="row__main" style={{ marginLeft: 12 }}>
                                        <div className="row__name" style={{ fontSize: 14 }}>{player.name}</div>
                                        <div className="row__stat" style={{ fontSize: 12, opacity: 0.6 }}>
                                            {player.type === 'email' ? 'Invited via Email' : 'Friend Invited'}
                                        </div>
                                    </div>

                                    <button
                                        className="btn btn--danger"
                                        style={{ padding: '4px 8px', fontSize: 12 }}
                                        onClick={() =>
                                            setInvitedPlayers((prev) =>
                                                prev.filter((p) => p.uid !== player.uid)
                                            )
                                        }
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ))}
                        </div>

                        {invitedPlayers.length > 0 && (
                            <button
                                className="btn btn--primary"
                                style={{ marginTop: 16, width: '100%', background: themeColor }}
                                onClick={onConfirmInvite}
                            >
                                Confirm Invite
                            </button>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default LobbyRightSidebar;
