import { MoveType, Difficulty } from '../types';

/**
 * AI Adaptive Engine v1.0
 * Monitors player efficiency and adjusts bot strategy mid-game.
 */

const HEURISTICS = {
  CAPTURE: 100,
  FINISH: 80,
  ENTER: 60,
  SAFE_SPOT: 40,
  PROGRESS: 1 // per unit of distance
};

/**
 * Scores a move based on strategic value.
 */
export const scoreMove = (move, _state) => {
  let score = 0;
  if (move.type === MoveType.CAPTURE) score += HEURISTICS.CAPTURE;
  if (move.type === MoveType.FINISH) score += HEURISTICS.FINISH;
  if (move.type === MoveType.ENTER) score += HEURISTICS.ENTER;
  
  // Progress bonus
  score += move.targetPosition * HEURISTICS.PROGRESS;
  
  return score;
};

/**
 * Assess how "optimal" the player's choice was compared to other valid moves.
 * Returns a value between 0 (random) and 1 (perfect).
 */
export const evaluateSkill = (chosenMoveId, validMoves, state) => {
  if (!validMoves || validMoves.length <= 1) return 1.0; // No choice, assume optimal

  const scoredMoves = validMoves.map(m => ({
    tokenId: m.tokenId,
    score: scoreMove(m, state)
  })).sort((a, b) => b.score - a.score);

  const bestScore = scoredMoves[0].score;
  const worstScore = scoredMoves[scoredMoves.length - 1].score;
  
  const chosenMove = scoredMoves.find(m => m.tokenId === chosenMoveId);
  const chosenScore = chosenMove ? chosenMove.score : 0;

  if (bestScore === worstScore) return 1.0;
  
  // Normalized score: 1.0 = best available, 0.0 = worst available
  return (chosenScore - worstScore) / (bestScore - worstScore);
};

/**
 * Calculates a new difficulty level based on rolling performance.
 */
export const calculateNewDifficulty = (currentDifficulty, history = []) => {
  if (history.length === 0) return currentDifficulty;

  const avgPerformance = history.reduce((a, b) => a + b, 0) / history.length;
  const recentPerformance = history[history.length - 1]; // Last turn's skill

  // [EXPLOITATION GUARD]: If a player in an EASY room performs perfectly (>0.9) 
  // for even ONE high-stakes move, instantly bump them to MEDIUM.
  if (currentDifficulty === Difficulty.EASY && recentPerformance > 0.9) {
    console.warn("🛡️ Exploitation Guard: High skill detected! Bumping to MEDIUM.");
    return Difficulty.MEDIUM;
  }

  // Standard Rolling Thresholds
  if (history.length < 3) return currentDifficulty;

  if (avgPerformance > 0.85) {
    if (currentDifficulty === Difficulty.EASY) return Difficulty.MEDIUM;
    if (currentDifficulty === Difficulty.MEDIUM) return Difficulty.HARD;
  } else if (avgPerformance < 0.35) {
    if (currentDifficulty === Difficulty.HARD) return Difficulty.MEDIUM;
    if (currentDifficulty === Difficulty.MEDIUM) return Difficulty.EASY;
  }

  return currentDifficulty;
};
