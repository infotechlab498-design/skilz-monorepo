/**
 * @deprecated Use `AIEngine.getBestMove` from `game-engine/ai/aiEngine.js` only.
 * This module re-exports the server-authoritative bot for any legacy imports.
 */
import { AIEngine } from '../../../../game-engine/ai/aiEngine.js';
import { Difficulty } from '../types';

export const getBotMove = (validMoves, state, difficulty = Difficulty.MEDIUM) =>
  AIEngine.getBestMove(validMoves, state, difficulty, {});

/** @deprecated No longer used — kept to avoid import errors. */
export const botStrategies = {
  [Difficulty.EASY]: getBotMove,
  [Difficulty.MEDIUM]: getBotMove,
  [Difficulty.HARD]: getBotMove,
};
