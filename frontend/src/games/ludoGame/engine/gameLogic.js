
import { PlayerColor } from '../types';
import { MoveValidator } from '@game-engine/services/MoveValidator.js';
import { RULES_CONFIG } from '@game-engine/rules/rulesConfig.js';

/**
 * Calculates the next position for a token given a dice roll.
 * Proxies to the central MoveValidator.
 */
export const calculateNextPosition = (token, roll) => {
  return MoveValidator.calculateNextPosition(token.position, roll, token.color);
};

/**
 * Determines if a move captures an opponent's token.
 * Proxies to the central MoveValidator.
 */
export const checkCapture = (color, pos, tokens) => {
  return MoveValidator.checkCapture(color, pos, tokens);
};

/**
 * Helper to get all squares that have 2+ tokens of the SAME color (forming a block).
 * Proxies to the central MoveValidator.
 */
export const getBlocks = (tokens) => {
  return MoveValidator.getBlocks(tokens);
};

/**
 * Gets all valid moves for the current player based on the dice roll.
 * Re-implemented using MoveValidator for authoritative consistency.
 */
export const getValidMoves = (state) => {
  const { currentTurn, tokens, diceValue } = state;
  if (diceValue === null || diceValue === undefined) return [];

  const roll = Math.floor(Number(diceValue));
  if (!Number.isFinite(roll) || roll < 1) return [];

  const playerTokens = tokens[currentTurn];
  if (!Array.isArray(playerTokens)) return [];

  const moves = [];

  playerTokens.forEach((token) => {
    const validMove = MoveValidator.validateMove(currentTurn, token.id, roll, state);

    if (validMove) {
      moves.push({
        tokenId: token.id,
        playerColor: currentTurn,
        targetPosition: validMove.to,
        type: validMove.type,
      });
    }
  });

  return moves;
};

/**
 * Utility to get next turn color
 */
export const getNextTurn = (currentColor) => {
  const order = [PlayerColor.RED, PlayerColor.BLUE, PlayerColor.YELLOW, PlayerColor.GREEN];
  const idx = order.indexOf(currentColor);
  return order[(idx + 1) % 4];
};

/**
 * Checks if a player has won (all 4 tokens at HOME_POSITION).
 */
export const checkWinner = (playerTokens) => {
  const { HOME_POSITION } = RULES_CONFIG.BOARD;
  return playerTokens.every(t => t.position === HOME_POSITION);
};
