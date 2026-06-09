import { EconomyService } from './economyService.js';

/**
 * Integer coin prize for a podium rank after a Ludo match.
 * Delegates to {@link EconomyService.calculatePrize} and rounds for wallet/Firestore.
 *
 * @param {number} rank — 1-based finish rank
 * @param {number} entryFee
 * @returns {number}
 */
export function ludoRankPrizeCoins(rank, entryFee) {
  const fee = Number(entryFee) || 0;
  return Math.round(EconomyService.calculatePrize(rank, fee));
}

/**
 * XP grant for Firestore `syncLudoMatchEnd` user patches (post-game only).
 *
 * @param {number} rank — 1-based
 * @returns {number}
 */
export function ludoRankXpFirestore(rank) {
  if (rank === 1) return 100;
  if (rank <= 3) return 50;
  return 25;
}
