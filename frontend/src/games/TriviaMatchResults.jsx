import React, { useMemo } from 'react';
import { Target, Gauge, Flame, Coins, CheckCircle2, XCircle } from 'lucide-react';
import {
    findTriviaProgression,
    formatAccuracyPct,
    formatAvgSpeed,
    formatLongestStreak,
    formatTriviaMatchCoins,
    formatTriviaMatchXp,
    resolvePlayerPerformanceDisplay,
} from './triviaRewardDisplay.js';
import './triviaMatchResults.css';

function formatPts(score) {

    const n = Number(score) || 0;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

}

/** Winner first (left); on draw, higher score left, then uid. */

function orderPlayers(players, winnerUid) {
    const list = (Array.isArray(players) ? players : []).filter(Boolean).slice(0, 2);
    if (list.length === 0) return [];
    if (list.length === 1) return list;
    const [a, b] = list;
    if (winnerUid === 'draw') {
        const byScore = (b.score ?? 0) - (a.score ?? 0);
        if (byScore !== 0) return byScore > 0 ? [b, a] : [a, b];
        return String(a.uid).localeCompare(String(b.uid)) <= 0 ? [a, b] : [b, a];
    }
    if (a.uid === winnerUid) return [a, b];
    if (b.uid === winnerUid) return [b, a];
    const byScore = (b.score ?? 0) - (a.score ?? 0);
    return byScore > 0 ? [b, a] : [a, b];

}

/**
 * @param {object} props
 * @param {object} props.endedMatch — `publicMatch` from `trivia_game_ended`
 * @param {string} props.myUid
 * @param {() => void} props.onPlayAgain
 * @param {() => void} props.onExitToLobby
 * @param {{ coinsEarned?: number, xpEarned?: number } | null} [props.reward]
 * @param {boolean} [props.rewardLoading]
 * @param {'idle'|'waiting'|'pending'|'starting'|'failed'} [props.rematchStatus]
 * @param {string|null} [props.rematchError]
 * @param {{ displayName?: string }|null} [props.rematchFromOpponent]
 */


export default function TriviaMatchResults({
    endedMatch,
    myUid,
    onPlayAgain,
    onExitToLobby,
    reward = null,
    rewardLoading = false,
    rematchStatus = 'idle',
    rematchError = null,
    rematchFromOpponent = null,
}) {
    const winnerUid = endedMatch?.gameState?.winner ?? null;
    const playersRaw = endedMatch?.players ?? [];
    const totalQ = endedMatch?.gameState?.questions?.length ?? 10;
    const progression = endedMatch?.progression ?? [];

    const ordered = useMemo(() => orderPlayers(endedMatch?.players ?? [], winnerUid), [endedMatch, winnerUid]);
    const left = ordered[0];
    const right = ordered[1];

    const isDraw = winnerUid === 'draw';
    const leftIsWinner = !isDraw && left && winnerUid === left.uid;
    const rightIsWinner = !isDraw && right && winnerUid === right.uid;
    const showMvp = !isDraw && leftIsWinner && right && (left.score ?? 0) > (right.score ?? 0);

    const coinsLabel = (player) => {
        if (player?.isBot) return '—';
        const prog = findTriviaProgression(progression, player?.uid);
        if (prog.coinsGained > 0 || prog.baseCoins > 0) {
            return formatTriviaMatchCoins({ ...prog, isBot: false });
        }
        return rewardLoading ? '…' : '—';
    };

    const xpLabel = (player) => {
        if (player?.isBot) return null;
        const prog = findTriviaProgression(progression, player?.uid);
        return formatTriviaMatchXp({ ...prog, isBot: false });
    };

    const statRow = (label, value, Icon, muted, type = null) => {
        let customClass = 'trivia-match-results-stat';
        if (muted) {
            customClass += ' trivia-match-results-stat--muted';
        } else if (type === 'correct') {
            customClass += ' trivia-match-results-stat--correct';
        } else if (type === 'wrong') {
            customClass += ' trivia-match-results-stat--wrong';
        }

        return (
            <div className={customClass}>
                <span className="trivia-match-results-stat__accent" aria-hidden />
                <Icon className="trivia-match-results-stat__icon" strokeWidth={2} aria-hidden />
                <div className="trivia-match-results-stat__body">
                    <span className="trivia-match-results-stat__label">{label}</span>
                    <span className="trivia-match-results-stat__value">{value}</span>
                </div>
            </div>
        );
    };

    const renderCard = (player, { winner, defeated }) => {
        if (!player) return null;
        const muted = defeated || isDraw;
        const idx = playersRaw.findIndex((p) => p.uid === player.uid);
        const playerIndex = idx >= 0 ? idx : 0;
        const stats = resolvePlayerPerformanceDisplay(player, totalQ, playerIndex);
        const { attempts, correct: correctAnswers, wrong: wrongAnswers } = stats;
        const accuracyStr = formatAccuracyPct(stats.accuracyPct);
        const avgSpeedStr = formatAvgSpeed(stats.avgAnswerMs);
        const streakStr = formatLongestStreak(stats.maxStreak);
        const prog = findTriviaProgression(progression, player.uid);
        const xpStr = xpLabel(player);

        const cardClass = [
            'trivia-match-results-card',
            winner ? 'trivia-match-results-card--winner' : '',
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <div className={cardClass}>
                {winner ? (
                    <span className="trivia-match-results-card__badge trivia-match-results-card__badge--winner">
                        Winner
                    </span>
                ) : null}
                {defeated ? (
                    <span className="trivia-match-results-card__badge trivia-match-results-card__badge--defeated">
                        Defeated
                    </span>
                ) : null}

                <div className="trivia-match-results-card__hero">
                    {winner && showMvp ? (
                        <span className="trivia-match-results-card__mvp">MVP</span>
                    ) : (
                        <span className="trivia-match-results-card__mvp-spacer" aria-hidden />
                    )}
                    <div
                        className={
                            winner
                                ? 'trivia-match-results-card__avatar-wrap trivia-match-results-card__avatar-wrap--winner'
                                : 'trivia-match-results-card__avatar-wrap trivia-match-results-card__avatar-wrap--loser'
                        }
                    >
                        <img
                            src={
                                player.photoURL ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.uid)}`
                            }
                            alt=""
                            className="trivia-match-results-card__avatar"
                        />
                    </div>
                    <div className="trivia-match-results-card__identity">
                        <h2
                            className={
                                muted
                                    ? 'trivia-match-results-card__name trivia-match-results-card__name--muted'
                                    : 'trivia-match-results-card__name'
                            }
                        >
                            {player.displayName || 'Player'}
                            {player.isBot ? (
                                <span className="trivia-match-results-card__bot">Bot</span>
                            ) : null}
                        </h2>
                        <p
                            className={
                                muted
                                    ? 'trivia-match-results-card__pts trivia-match-results-card__pts--muted'
                                    : 'trivia-match-results-card__pts'
                            }
                        >
                            {formatPts(player.score)} PTS
                        </p>
                    </div>
                </div>

                <div className="trivia-match-results-card__stats">
                    {statRow('Accuracy', accuracyStr, Target, muted)}
                    {statRow('Correct answers', `${correctAnswers} / ${attempts}`, CheckCircle2, muted, 'correct')}
                    {statRow('Wrong answers', `${wrongAnswers} / ${attempts}`, XCircle, muted, 'wrong')}
                    {statRow('Avg speed', avgSpeedStr, Gauge, muted)}
                    {statRow('Longest streak', streakStr, Flame, muted)}
                    {statRow('Coins earned', coinsLabel(player), Coins, muted)}
                </div>
                {!player.isBot && prog.performanceBreakdown?.length > 0 ? (
                    <ul className="trivia-match-results-perf" aria-label="Performance bonuses">
                        {prog.performanceBreakdown.map((b) => (
                            <li key={b.id} className="trivia-match-results-perf__chip">
                                {b.label}
                                {Number(b.coins || 0) > 0 ? ` +${b.coins} coins` : ''}
                                {Number(b.xp || 0) > 0 ? ` +${b.xp} XP` : ''}
                            </li>
                        ))}
                    </ul>
                ) : null}
                {!player.isBot && xpStr && xpStr !== '—' ? (
                    <p className="trivia-match-results-card__xp">{xpStr}</p>
                ) : null}
            </div>
        );
    };

    const playAgainDisabled = rematchStatus === 'waiting' || rematchStatus === 'starting';
    const playAgainLabel =
        rematchStatus === 'waiting'
            ? 'Waiting for opponent…'
            : rematchStatus === 'starting'
              ? 'Starting rematch…'
              : rematchStatus === 'pending'
                ? 'Accept rematch'
                : 'Play again';

    return (
        <div className="trivia-match-results">
            <div className="trivia-match-results__ambient" aria-hidden />

            <div className="trivia-match-results__inner">
                <header className="trivia-match-results__header">
                    <h1 className="trivia-match-results__title">Match over</h1>
                    <div className="trivia-match-results__accent-bar" aria-hidden />
                    {isDraw ? <p className="trivia-match-results__draw-note">Final scores tied — draw</p> : null}
                </header>

                <div className="trivia-match-results__grid">
                    <div className="trivia-match-results__col">
                        {renderCard(left, { winner: leftIsWinner, defeated: !!right && !isDraw && !leftIsWinner })}
                        {left?.uid === myUid ? <p className="trivia-match-results__you">You</p> : null}
                    </div>
                    <div className="trivia-match-results__col">
                        {renderCard(right, { winner: rightIsWinner, defeated: !!left && !isDraw && !rightIsWinner })}
                        {right?.uid === myUid ? <p className="trivia-match-results__you">You</p> : null}
                    </div>
                </div>

                <div className="trivia-match-results__reward-zone">
                    {rewardLoading ? (
                        <p className="trivia-match-results__reward-loading">Syncing rewards…</p>
                    ) : null}
                    {!rewardLoading && reward?.xpEarned ? (
                        <p className="trivia-match-results__reward-xp">
                            Match reward applied — {formatTriviaMatchXp({ ...reward, xpGained: reward.xpEarned, isBot: false })}
                        </p>
                    ) : null}
                </div>

                <div className="trivia-match-results__actions">
                    {rematchStatus === 'pending' && rematchFromOpponent?.displayName ? (
                        <p className="trivia-match-results__rematch-prompt">
                            {rematchFromOpponent.displayName} wants a rematch
                        </p>
                    ) : null}
                    {rematchError ? (
                        <p className="trivia-match-results__rematch-error" role="alert">
                            {rematchError}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={onPlayAgain}
                        disabled={playAgainDisabled}
                        className={
                            playAgainDisabled
                                ? 'trivia-match-results__btn-primary trivia-match-results__btn-primary--disabled'
                                : 'trivia-match-results__btn-primary'
                        }
                    >
                        {playAgainLabel}
                    </button>
                    <button type="button" onClick={onExitToLobby} className="trivia-match-results__btn-secondary">
                        Exit to lobby
                    </button>
                </div>
            </div>
        </div>
    );
}
