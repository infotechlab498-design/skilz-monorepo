
/**
 
 * Ludo Master Engine: Central Rule Configuration
 * Defines the core mechanics and boundaries of the game.
 
*/

export const RULES_CONFIG = {
  BOARD: {
    SIZE: 15,
    TRACK_LENGTH: 52,
    HOME_POSITION: 58,
    HOME_STRETCH_START: 53,
    YARD_POSITION: 0
  },

  PLAYERS: {
    MAX_COUNT: 4,
    MIN_COUNT: 2,
    TOKENS_PER_PLAYER: 4
  },

  MOVEMENTS: {
    ACTIVATION_ROLL: 6,         // Roll required to move token out of yard
    REQUIRE_EXACT_FINISH: true, // token must land exactly on HOME_POSITION
    ALLOW_BACKWARD: false,      // Ludo tokens only move forward
    TRIPLE_SIX_PENALTY: true,   // 3 sixes in a row = turn lost
    MAX_ROLL: 6
  },

  FEATURES: {
    CAPTURE_ENABLED: true,
    ALLOW_STACKING: true,       // Same-color tokens can occupy same square
    BLOCK_FORMATION: true,      // 2 same-color tokens = block (opponent cannot pass)
    BLOCK_SIZE: 2,
    EXTRA_TURN_ON_SIX: true,
    EXTRA_TURN_ON_CAPTURE: true,
    EXTRA_TURN_ON_FINISH: true,
    SAFE_SQUARES_ENABLED: true
  },

  SAFE_CELLS: [1, 9, 14, 22, 27, 35, 40, 48], // Common safe spots on track

  // Must match board `POSITION_MAP` / `src/games/ludoGame/constants.js` (RED bottom, GREEN left, YELLOW top, BLUE right).
  START_POSITIONS: {
    RED: 1,
    GREEN: 14,
    YELLOW: 27,
    BLUE: 40
  },

  END_TRACK_POSITIONS: {
    RED: 51,
    GREEN: 12,
    YELLOW: 25,
    BLUE: 38
  }
};
