
import { RULES_CONFIG } from '../rules/rulesConfig.js';

export const MoveType = {
  NORMAL: 'NORMAL',
  ENTER: 'ENTER',
  FINISH: 'FINISH',
  CAPTURE: 'CAPTURE',
  INVALID: 'INVALID'
};

export class MoveValidator {
  
  /**
   * Calculates the target position for a token given a dice roll.
   * Returns null if moving is impossible (e.g., overshoot Finish).
   */
  static calculateNextPosition(tokenPos, roll, color) {
    const { TRACK_LENGTH, HOME_STRETCH_START, HOME_POSITION, YARD_POSITION } = RULES_CONFIG.BOARD;
    const endPos = RULES_CONFIG.END_TRACK_POSITIONS[color];
    const startPos = RULES_CONFIG.START_POSITIONS[color];

    // From Yard: Requires Activation Roll (6)
    if (tokenPos === YARD_POSITION) {
      if (roll === RULES_CONFIG.MOVEMENTS.ACTIVATION_ROLL) {
        return startPos;
      }
      return null;
    }

    // Already finished
    if (tokenPos === HOME_POSITION) return null;

    // Inside Home Stretch (53–57)
    if (tokenPos >= HOME_STRETCH_START) {
      const nextPos = tokenPos + roll;
      if (RULES_CONFIG.MOVEMENTS.REQUIRE_EXACT_FINISH) {
        return nextPos <= HOME_POSITION ? nextPos : null;
      }
      return nextPos >= HOME_POSITION ? HOME_POSITION : nextPos;
    }

    // On Common Track (1–52)
    // Distance to the individual player's home stretch entrance (exit square)
    // Distance = (target - current + length) % length
    const stepsToExit = (endPos - tokenPos + TRACK_LENGTH) % TRACK_LENGTH;

    if (roll > stepsToExit) {
      const remainingSteps = roll - stepsToExit;
      // Index 52 is the last common square. Home stretch starts at index 53 (HOME_STRETCH_START).
      const finalPos = HOME_STRETCH_START + remainingSteps - 1;
      return finalPos <= HOME_POSITION ? finalPos : null;
    }

    // Standard move on track (handles cyclic wrap-around 52 -> 1)
    const nextPos = ((tokenPos + roll - 1) % TRACK_LENGTH) + 1;
    return nextPos;
  }

  /**
   * Internal checker for blocks (2+ opponent tokens on same cell).
   */
  static getBlocks(allTokens) {
    const blocksByPosition = {};
    const { TRACK_LENGTH } = RULES_CONFIG.BOARD;

    for (const [color, tokens] of Object.entries(allTokens)) {
      const posCounts = {};
      tokens.forEach(t => {
        if (t.position > 0 && t.position <= TRACK_LENGTH) {
          posCounts[t.position] = (posCounts[t.position] || 0) + 1;
        }
      });

      for (const [pos, count] of Object.entries(posCounts)) {
        if (count >= RULES_CONFIG.FEATURES.BLOCK_SIZE) {
          blocksByPosition[parseInt(pos)] = color;
        }
      }
    }
    return blocksByPosition;
  }

  /**
   * Cannot finish a move ON the common track landing on an opponent "brick" (2+ on same cell).
   * Passing through such a cell is allowed (no intermediate path blocking).
   * Safe/star cells: multiple opponents may share — do not treat as illegal brick landing.
   */
  static cannotLandOnOpponentBrick(playerColor, nextPos, allTokens) {
    const { TRACK_LENGTH, HOME_STRETCH_START } = RULES_CONFIG.BOARD;
    const safe = RULES_CONFIG.SAFE_CELLS || [];
    if (nextPos <= 0 || nextPos > TRACK_LENGTH || nextPos >= HOME_STRETCH_START) {
      return false;
    }
    if (safe.includes(nextPos)) return false;

    const minBlock = RULES_CONFIG.FEATURES.BLOCK_SIZE;
    for (const [oc, tokens] of Object.entries(allTokens)) {
      if (oc === playerColor) continue;
      const onCell = tokens.filter((t) => t.position === nextPos).length;
      if (onCell >= minBlock) return true;
    }
    return false;
  }

  /**
   * Final validation: Checks if move is legal.
   * Returns metadata about the move if valid, else null.
   */
  static validateMove(playerId, tokenId, roll, gameState) {
    const { tokens, currentTurn } = gameState;
    if (playerId !== currentTurn) return null;

    const r = Math.floor(Number(roll));
    if (
      !Number.isFinite(r) ||
      r < 1 ||
      r > (RULES_CONFIG.MOVEMENTS.MAX_ROLL ?? 6)
    ) {
      return null;
    }

    const playerTokens = tokens[playerId];
    if (!Array.isArray(playerTokens)) return null;

    const targetToken = playerTokens.find((t) => t.id === tokenId);
    if (!targetToken) return null;

    // Token bucket is keyed by color; reject corrupt tokens that carry a different color.
    if (targetToken.color != null && targetToken.color !== playerId) return null;

    // 1. Calculate Target Position (always use board owner `playerId`, not a mismatched token.color)
    const nextPos = this.calculateNextPosition(targetToken.position, r, playerId);
    if (nextPos === null) return null;

    // 2. Collision only at destination / entry — no intermediate path blocking
    if (targetToken.position === 0) {
      const blocks = this.getBlocks(gameState.tokens);
      const startPos = RULES_CONFIG.START_POSITIONS[playerId];
      const safe = RULES_CONFIG.SAFE_CELLS || [];
      if (blocks[startPos] && blocks[startPos] !== playerId && !safe.includes(startPos)) {
        return null;
      }
    } else if (this.cannotLandOnOpponentBrick(playerId, nextPos, tokens)) {
      return null;
    }

    // 3. Determine Move Type & Capture
    let type = MoveType.NORMAL;
    if (targetToken.position === 0 && nextPos === RULES_CONFIG.START_POSITIONS[playerId]) {
      type = MoveType.ENTER;
    } else if (nextPos === RULES_CONFIG.BOARD.HOME_POSITION) {
      type = MoveType.FINISH;
    } else {
      const victim = this.checkCapture(playerId, nextPos, tokens);
      if (victim) {
        type = MoveType.CAPTURE;
      }
    }

    return { tokenId, from: targetToken.position, to: nextPos, type };
  }

  /**
   * Checks if move results in a capture.
   */
  static checkCapture(color, pos, tokens) {
    const { HOME_STRETCH_START } = RULES_CONFIG.BOARD;
    const isSafe = RULES_CONFIG.SAFE_CELLS.includes(pos);
    
    // Cannot capture in: Yard (0), Home Stretch (53+), or Safe Spots
    if (pos === 0 || pos >= HOME_STRETCH_START || isSafe) return null;

    for (const [opponentColor, opponentTokens] of Object.entries(tokens)) {
      if (opponentColor === color) continue;
      
      const victims = opponentTokens.filter(t => t.position === pos);
      
      // Captures only if exactly one opponent token (pair blocks landing via cannotLandOnOpponentBrick).
      if (victims.length === 1) {
        return { color: opponentColor, id: victims[0].id };
      }
    }
    return null;
  }
}
