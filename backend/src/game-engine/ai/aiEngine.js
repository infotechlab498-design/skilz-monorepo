
import { MoveValidator } from '../services/MoveValidator.js';
import { RULES_CONFIG } from '../rules/rulesConfig.js';

const PERSONALITY_WEIGHTS = {
  EASY: { mistakeProbability: 0.22 },
  MEDIUM: { mistakeProbability: 0.12 },
  HARD: { mistakeProbability: 0.04 },
};

/**
 * One-roll threat: opponent tokens that could land on `targetPos` this turn.
 */
function threatCountForLanding(playerColor, targetPos, gameState) {
  if (targetPos == null) return 0;
  if (RULES_CONFIG.SAFE_CELLS.includes(targetPos)) return 0;
  const hs = RULES_CONFIG.BOARD.HOME_STRETCH_START;
  if (targetPos >= hs) return 0;

  let threats = 0;
  for (const [oc, tokens] of Object.entries(gameState.tokens || {})) {
    if (oc === playerColor) continue;
    for (const t of tokens) {
      if (!t || t.position <= 0 || t.position >= hs) continue;
      for (let r = 1; r <= 6; r++) {
        const np = MoveValidator.calculateNextPosition(t.position, r, oc);
        if (np === targetPos) {
          threats++;
          break;
        }
      }
    }
  }
  return threats;
}

function moveTarget(move) {
  return move?.to ?? move?.targetPosition ?? 0;
}

function pickFromSortedPool(sortedMoves, mistakeProbability) {
  if (!sortedMoves?.length) return null;
  if (sortedMoves.length === 1) return sortedMoves[0];
  const p = Math.max(0, Math.min(1, Number(mistakeProbability) || 0));
  if (p > 0 && Math.random() < p) return sortedMoves[1];
  return sortedMoves[0];
}

function sortMovesBySafetyThenProgress(playerColor, gameState, moves) {
  return [...moves].sort((a, b) => {
    const ta = moveTarget(a);
    const tb = moveTarget(b);
    const ra = threatCountForLanding(playerColor, ta, gameState);
    const rb = threatCountForLanding(playerColor, tb, gameState);
    if (ra !== rb) return ra - rb;
    return tb - ta;
  });
}

/**
 * Server + client: single source of truth for bot moves.
 * Priority (strict): 1) capture 2) finish 3) land on safe square 4) furthest progress 5) any remaining (tie-break by safety).
 */
export class AIEngine {
  static evaluateMove(move, gameState, difficulty = 'MEDIUM', weightsOverride = null) {
    const w =
      weightsOverride && typeof weightsOverride === 'object'
        ? { ...PERSONALITY_WEIGHTS[difficulty], ...weightsOverride }
        : PERSONALITY_WEIGHTS[difficulty] || PERSONALITY_WEIGHTS.MEDIUM;
    const target = moveTarget(move);
    const th = threatCountForLanding(gameState.currentTurn, target, gameState);
    let score = target * 2 - th * 40;
    if (move.type === 'CAPTURE') score += 500;
    if (move.type === 'FINISH') score += 400;
    if (move.type === 'ENTER') score += 80;
    if (RULES_CONFIG.SAFE_CELLS.includes(target)) score += 60;
    score += (Math.random() - 0.5) * 20 * (w.mistakeProbability || 0.1);
    return score;
  }

  /**
   * @param {object[]} validMoves — shapes from MoveValidator or client getValidMoves
   * @param {object} gameState
   * @param {string} [difficulty]
   * @param {{ weightsOverride?: object, mistakeProbability?: number }} [opts]
   */
  static getBestMove(validMoves, gameState, difficulty = 'MEDIUM', opts = {}) {
    if (!validMoves || validMoves.length === 0) return null;
    if (validMoves.length === 1) return validMoves[0];

    const base = PERSONALITY_WEIGHTS[difficulty] || PERSONALITY_WEIGHTS.MEDIUM;
    const mistakeP =
      typeof opts.mistakeProbability === 'number'
        ? opts.mistakeProbability
        : base.mistakeProbability;

    const playerColor = gameState.currentTurn;

    const captures = validMoves.filter((m) => m.type === 'CAPTURE');
    if (captures.length) {
      const sorted = sortMovesBySafetyThenProgress(playerColor, gameState, captures);
      return pickFromSortedPool(sorted, mistakeP);
    }

    const finishes = validMoves.filter((m) => m.type === 'FINISH');
    if (finishes.length) {
      const sorted = sortMovesBySafetyThenProgress(playerColor, gameState, finishes);
      return pickFromSortedPool(sorted, mistakeP);
    }

    const safeLands = validMoves.filter((m) => {
      const pos = moveTarget(m);
      return RULES_CONFIG.SAFE_CELLS.includes(pos);
    });
    if (safeLands.length) {
      const sorted = sortMovesBySafetyThenProgress(playerColor, gameState, safeLands);
      return pickFromSortedPool(sorted, mistakeP);
    }

    const maxProg = Math.max(...validMoves.map((m) => moveTarget(m)));
    const furthest = validMoves.filter((m) => moveTarget(m) === maxProg);
    if (furthest.length) {
      const sorted = sortMovesBySafetyThenProgress(playerColor, gameState, furthest);
      return pickFromSortedPool(sorted, mistakeP + 0.05);
    }

    const sorted = sortMovesBySafetyThenProgress(playerColor, gameState, validMoves);
    return pickFromSortedPool(sorted, mistakeP + 0.08);
  }
}

export { threatCountForLanding };
