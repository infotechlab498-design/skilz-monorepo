import React from 'react';
import { Coins } from 'lucide-react';
import '../styles/gameEntryFeeBadge.css';

/**
 * Lobby display for entry fee and optional match meta (questions, timer).
 * UX pre-check only — server deducts authoritatively.
 */
export default function GameEntryFeeBadge({
  entryFee,
  questionCount = null,
  questionSeconds = null,
  maxRounds = null,
  className = '',
}) {
  const parts = [];
  if (entryFee != null && Number.isFinite(Number(entryFee))) {
    parts.push(`${entryFee} coins to play`);
  }
  if (questionCount != null) {
    parts.push(`${questionCount} questions`);
  }
  if (maxRounds != null) {
    parts.push(`${maxRounds} rounds`);
  }
  if (questionSeconds != null) {
    parts.push(`${questionSeconds}s per question`);
  }

  if (!parts.length) return null;

  return (
    <p className={`game-entry-fee-badge ${className}`.trim()} role="status">
      <Coins size={16} className="game-entry-fee-badge__icon" aria-hidden />
      <span>{parts.join(' · ')}</span>
    </p>
  );
}

export function canAffordEntryFee(coins, entryFee) {
  return Number(coins ?? 0) >= Number(entryFee ?? 0);
}
