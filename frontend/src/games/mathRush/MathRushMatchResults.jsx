import React, { useMemo } from 'react';
import { motion as Motion } from 'motion/react';
import {
  Trophy,
  RotateCcw,
  Zap,
  User,
  Home,
  RefreshCw,
  Star,
  Coins,
  CircleX,
} from 'lucide-react';
import copy from '@truthpack/copy.json';
import './mathRushMatchResults.css';

function pickStrings() {
  return copy?.games?.mathRush?.matchResults ?? {};
}

function orderPlayers(match, winnerUid) {
  const a = match?.player1;
  const b = match?.player2;
  if (!a || !b) return [];
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

function accuracyPercent(successCount, failureCount) {
  const c = Math.max(0, Number(successCount) || 0);
  const f = Math.max(0, Number(failureCount) || 0);
  const attempts = c + f;
  const denom = Math.max(1, attempts);
  return Math.round((1000 * c) / denom) / 10;
}

function formatDifficulty(d) {
  const s = String(d || '').trim();
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Math Rush match results — dark arena layout; copy from truthpack `games.mathRush.matchResults`.
 */
export default function MathRushMatchResults({
  match,
  myUid,
  profile = null,
  rewardLoading = false,
  rewardError = null,
  onPlayAgain,
  onExitToLobby,
}) {
  const t = pickStrings();
  const label = (key, fallback) => t[key] ?? fallback;

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const winnerUid = match?.winner ?? null;
  const isDraw = winnerUid === 'draw';
  const iWon = !isDraw && winnerUid === myUid;
  const endReason = match?.endReason === 'forfeit' ? 'forfeit' : 'score';

  const subtitle =
    endReason === 'forfeit'
      ? label('subtitleForfeit', 'Match ended by forfeit')
      : label('subtitleScore', 'Match complete');

  const ordered = useMemo(() => orderPlayers(match, winnerUid), [match, winnerUid]);
  const left = ordered[0];
  const right = ordered[1];

  const headline = isDraw
    ? label('headlineDraw', 'Draw')
    : iWon
      ? label('headlineVictory', 'Victory')
      : label('headlineDefeat', 'Defeat');

  const tone = isDraw ? 'draw' : iWon ? 'win' : 'lose';

  const self =
    match?.player1?.uid === myUid ? match.player1 : match?.player2?.uid === myUid ? match.player2 : null;
  const opponent =
    match?.player1?.uid === myUid ? match.player2 : match?.player1?.uid === myUid ? match.player1 : null;
  const opponentIsBot = Boolean(opponent?.isBot);
  const iAmBot = Boolean(self?.isBot);

  const showHumanRewards = Boolean(self && !iAmBot);

  const animProps = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
      };

  const renderCard = (player) => {
    if (!player) return null;
    const mine = player.uid === myUid;
    const isWinner = !isDraw && winnerUid === player.uid;
    const isLoser = !isDraw && !isWinner;
    let cardMod = '';
    if (isDraw) cardMod = 'mrr-card--draw';
    else if (isWinner) cardMod = 'mrr-card--winner';
    else if (isLoser) cardMod = 'mrr-card--loser';

    const displayName = mine ? label('you', 'You') : player.displayName || label('opponent', 'Opponent');
    const acc = accuracyPercent(player.successCount, player.failureCount);
    const hasPhoto = Boolean(player.photoURL && String(player.photoURL).trim());

    let badge = null;
    if (isDraw) {
      badge = (
        <span className="mrr-badge mrr-badge--draw" aria-label={label('badgeDraw', 'Draw')}>
          {label('badgeDraw', 'Draw')}
        </span>
      );
    } else if (isWinner) {
      badge = (
        <span className="mrr-badge mrr-badge--winner" aria-label={label('badgeWinner', 'Winner')}>
          <Trophy className="mrr-badge-icon" strokeWidth={2.5} aria-hidden />
          {label('badgeWinner', 'Winner')}
        </span>
      );
    } else {
      badge = (
        <span className="mrr-badge mrr-badge--runner" aria-label={label('badgeRunnerUp', 'Runner-up')}>
          {label('badgeRunnerUp', 'Runner-up')}
        </span>
      );
    }

    return (
      <article key={player.uid} className={`mrr-card ${cardMod}`} aria-labelledby={`mrr-name-${player.uid}`}>
        {badge}
        <div className="mrr-card-head">
          {hasPhoto ? (
            <img className="mrr-avatar" src={player.photoURL} alt="" />
          ) : (
            <div className="mrr-avatar mrr-avatar--placeholder" aria-hidden>
              <User className="mrr-avatar-svg" strokeWidth={1.75} />
            </div>
          )}
          <div className="mrr-name-block">
            <h2 id={`mrr-name-${player.uid}`} className="mrr-name">
              {displayName}
            </h2>
            {player.isBot && <span className="mrr-bot-pill">{label('botLabel', 'MathBot')}</span>}
          </div>
        </div>
        <div className="mrr-score-big" aria-label={`${label('score', 'Score')}: ${player.score ?? 0}`}>
          {player.score ?? 0}
        </div>
        <div className="mrr-stats-grid">
          <div className="mrr-stat">
            <span className="mrr-stat-label">{label('correct', 'Correct')}</span>
            <span className="mrr-stat-value mrr-stat-value--ok">{player.successCount ?? 0}</span>
          </div>
          <div className="mrr-stat">
            <span className="mrr-stat-label">{label('wrong', 'Wrong')}</span>
            <span className="mrr-stat-value mrr-stat-value--bad">{player.failureCount ?? 0}</span>
          </div>
          <div className="mrr-stat">
            <span className="mrr-stat-label">{label('accuracy', 'Accuracy')}</span>
            <span className="mrr-stat-value mrr-stat-value--acc">{acc}%</span>
          </div>
        </div>
      </article>
    );
  };

  const xp = match?.rewards?.xp ?? 0;
  const coins = match?.rewards?.coins ?? 0;

  const heroIcon =
    tone === 'win' ? <Trophy className="mrr-hero-svg" /> : tone === 'draw' ? <RotateCcw className="mrr-hero-svg" /> : <Zap className="mrr-hero-svg" />;

  const rewardErrText =
    rewardError === 'Not authenticated'
      ? label('notAuthenticatedRewards', 'Sign in to earn coins and XP.')
      : rewardError;

  return (
    <main className="mrr-root" aria-labelledby="mrr-headline">
      <div className="mrr-atmosphere" aria-hidden>
        <div className="mrr-atmosphere-photo" />
        <div className="mrr-atmosphere-sky" />
        <div className="mrr-atmosphere-castle mrr-atmosphere-castle--l" />
        <div className="mrr-atmosphere-castle mrr-atmosphere-castle--r" />
        <div className="mrr-atmosphere-embers" />
      </div>

      <div className="mrr-inner">
        <Motion.div className="mrr-hero" {...animProps}>
          <p className="mrr-kicker">{label('pageTitle', 'Match results')}</p>
          <div className={`mrr-hero-ring mrr-hero-ring--${tone}`} aria-hidden>
            <span className="mrr-hero-ring-inner">{heroIcon}</span>
          </div>
          <h1 id="mrr-headline" className={`mrr-headline mrr-headline--${tone}`}>
            {headline}
          </h1>
          <p className="mrr-subline">{subtitle}</p>
        </Motion.div>

        <p className="mrr-meta" role="group" aria-label={label('subtitleDefault', 'Match details')}>
          <span>
            {label('difficulty', 'Difficulty')}:{' '}
            <span className="mrr-meta-strong">{formatDifficulty(match?.difficulty)}</span>
          </span>
          <span className="mrr-meta-sep" aria-hidden>
            |
          </span>
          <span>
            {label('rounds', 'Rounds')}:{' '}
            <span className="mrr-meta-strong">
              {match?.round ?? 0} / {match?.maxRounds ?? 10}
            </span>
          </span>
        </p>

        <div className="mrr-cards">
          {renderCard(left)}
          <div className="mrr-vs" aria-hidden>
            <span className="mrr-vs-inner">{label('versus', 'vs')}</span>
          </div>
          {renderCard(right)}
        </div>

        {opponentIsBot && (
          <p className="mrr-bot-footnote">{label('noRewardsVsBot', 'Practice vs MathBot — no ranked coin rewards.')}</p>
        )}

        <section className="mrr-rewards-wrap" aria-label={label('xpEarned', 'Rewards')}>
          {rewardError && (
            <div className="mrr-alert" role="alert">
              <CircleX className="mrr-alert-icon" strokeWidth={2} aria-hidden />
              <span>{rewardErrText}</span>
            </div>
          )}

          <div className="mrr-rewards">
            {showHumanRewards && (
              <>
                <div className="mrr-reward-card mrr-reward-card--xp">
                  <div className="mrr-reward-card-inner">
                    <Star className="mrr-reward-deco mrr-reward-deco--tl" strokeWidth={1.5} aria-hidden />
                    <div className="mrr-reward-body">
                      <div className="mrr-reward-label">{label('xpEarned', 'XP earned')}</div>
                      {rewardLoading ? (
                        <div
                          className="mrr-reward-skel"
                          aria-busy="true"
                          aria-label={label('claimingRewards', 'Claiming rewards…')}
                        />
                      ) : (
                        <div className="mrr-reward-value">+{xp}</div>
                      )}
                    </div>
                    <div className="mrr-reward-chip" aria-hidden>
                      XP
                    </div>
                  </div>
                </div>
                <div className="mrr-reward-card mrr-reward-card--coins">
                  <div className="mrr-reward-card-inner">
                    <Coins className="mrr-reward-deco mrr-reward-deco--tl" strokeWidth={1.5} aria-hidden />
                    <div className="mrr-reward-body">
                      <div className="mrr-reward-label">{label('coinsEarned', 'Coins earned')}</div>
                      {rewardLoading ? (
                        <div
                          className="mrr-reward-skel"
                          aria-busy="true"
                          aria-label={label('claimingRewards', 'Claiming rewards…')}
                        />
                      ) : (
                        <div className="mrr-reward-value mrr-reward-value--coins">+{coins}</div>
                      )}
                      {!rewardLoading && !rewardError && (
                        <p className="mrr-reward-wallet">
                          {label('totalCoins', 'Wallet')}: {profile?.coins ?? '—'}
                        </p>
                      )}
                    </div>
                    <div className="mrr-reward-coins-stack" aria-hidden />
                  </div>
                </div>
              </>
            )}
            {!showHumanRewards && (
              <p className="mrr-reward-unavailable">{label('rewardUnavailable', 'Rewards unavailable for this match.')}</p>
            )}
          </div>
        </section>

        <div className="mrr-actions">
          <button type="button" className="mrr-btn mrr-btn--primary" onClick={onPlayAgain}>
            <RefreshCw className="mrr-btn-icon" strokeWidth={2.2} aria-hidden />
            {label('playAgain', 'Play again')}
          </button>
          <button type="button" className="mrr-btn mrr-btn--ghost" onClick={onExitToLobby}>
            <Home className="mrr-btn-icon" strokeWidth={2.2} aria-hidden />
            {label('backToLobby', 'Back to lobby')}
          </button>
        </div>
      </div>
    </main>
  );
}
