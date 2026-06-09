
import { RULES_CONFIG } from '../rules/rulesConfig.js';

export class EconomyService {
  /**
   * XP Formula: xp = progress + (captures * 20) + (finishes * 50) + (goodMoves * 10)
   */
  static calculateXP(stats) {
    const { progress = 0, captures = 0, finishes = 0, goodMoves = 0 } = stats;
    return progress + (captures * 20) + (finishes * 50) + (goodMoves * 10);
  }

  /**
   * Tournament prize calculation
   */
  static calculatePrize(rank, entryFee) {
    if (rank === 1) return entryFee * 2;
    if (rank === 2) return entryFee * 1.5;
    return 0; // Standard 2-player or 4-player logic
  }

  /**
   * Quitter Penalty: Deduct 2x entry fee or fixed amount
   */
  static getQuitterPenalty(entryFee) {
    return entryFee * 2;
  }
}
