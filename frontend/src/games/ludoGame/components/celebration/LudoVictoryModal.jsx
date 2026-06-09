import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLOR_CLASSES } from '../../constants.js';
import { rankMedal, rankPrizeCoins, rankTitle } from '../../utils/ludoStandings.js';
import './LudoVictoryModal.css';

const rankRowClass = (rank) => {
  if (rank === 1) return 'ludo-victory-rank-row--gold';
  if (rank === 2) return 'ludo-victory-rank-row--silver';
  if (rank === 3) return 'ludo-victory-rank-row--bronze';
  return '';
};

export function LudoVictoryModal({
  open,
  mode = 'match',
  title,
  subtitle,
  focusEntry,
  standings = [],
  showRankReveal = true,
  myPlayerId,
  isSeatedMe,
  onContinue,
  continueLabel = 'Continue',
  reactions = [],
  onReaction,
}) {
  if (!open || !focusEntry) return null;

  const isPersonal = mode === 'personal';
  const colorClass = COLOR_CLASSES[focusEntry.color] || 'bg-green';
  const panelWinnerClass = `ludo-victory-modal__panel--winner-${String(focusEntry.color || 'GREEN').toLowerCase()}`;
  const rank = focusEntry.rank || 1;
  const isMe =
    (focusEntry.playerId && isSeatedMe?.(focusEntry.playerId)) ||
    (myPlayerId && focusEntry.playerId === myPlayerId);
  const displayTitle = title || rankTitle(rank, isMe);
  const coins = rankPrizeCoins(rank);
  const xp = focusEntry.xp ?? (rank === 1 ? 100 : rank === 2 ? 75 : 50);
  const initial = (focusEntry.name || focusEntry.color || '?')[0]?.toUpperCase() || '?';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ludo-victory-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ludo-victory-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`ludo-victory-modal__panel ${panelWinnerClass} ${isPersonal ? 'ludo-victory-personal' : ''}`}
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            <div className="ludo-victory-trophy" aria-hidden="true">
              🏆
            </div>
            <h2 id="ludo-victory-title" className="ludo-victory-title">
              {displayTitle}
            </h2>
            {subtitle && <p className="ludo-victory-subtitle">{subtitle}</p>}

            <div className="ludo-victory-avatar-wrap">
              {rank === 1 && (
                <span className="ludo-victory-crown" aria-hidden="true">
                  👑
                </span>
              )}
              <div className={`ludo-victory-avatar ${colorClass}`}>{initial}</div>
            </div>

            <p className="ludo-victory-subtitle">
              {focusEntry.name || focusEntry.color} · Rank #{rank}
            </p>

            {isMe && (
              <div className="ludo-victory-stats">
                <div className="ludo-victory-stat ludo-victory-stat--coins">
                  <span className="ludo-victory-stat-label">Coins</span>
                  <span className="ludo-victory-stat-value">+{coins}</span>
                </div>
                <div className="ludo-victory-stat ludo-victory-stat--xp">
                  <span className="ludo-victory-stat-label">XP</span>
                  <span className="ludo-victory-stat-value">+{xp}</span>
                </div>
              </div>
            )}

            {showRankReveal && !isPersonal && standings.length > 0 && (
              <div className="ludo-victory-ranks" role="list" aria-label="Final standings">
                {standings.map((row, idx) => {
                  const rowMe =
                    (row.playerId && isSeatedMe?.(row.playerId)) ||
                    (myPlayerId && row.playerId === myPlayerId);
                  return (
                    <div
                      key={`${row.color}-${row.rank}`}
                      className={[
                        'ludo-victory-rank-row',
                        rankRowClass(row.rank),
                        rowMe ? 'ludo-victory-rank-row--me' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ animationDelay: `${idx * 0.15}s` }}
                      role="listitem"
                    >
                      <span className="ludo-victory-rank-medal">{rankMedal(row.rank)}</span>
                      <span className={`player-status-dot ${COLOR_CLASSES[row.color]}`} />
                      <span className="ludo-victory-rank-name">
                        {row.name || row.color}
                        {row.eliminated ? ' (Eliminated)' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {mode === 'match' && onReaction && (
              <div className="ludo-victory-reactions" aria-label="Send reaction">
                {['👏', '🔥', '🎉', '❤️'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`ludo-victory-reaction-btn ${reactions.includes(emoji) ? 'ludo-victory-reaction-btn--active' : ''}`}
                    onClick={() => onReaction(emoji)}
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <button type="button" className="ludo-victory-continue" onClick={onContinue}>
              {continueLabel}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
