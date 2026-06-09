
/**
 * FIRESTORE DATA STRUCTURE
 * 
 * Collection: games
 * Document: {gameId}
 * {
 *   status: "LOBBY" | "PLAYING" | "FINISHED",
 *   currentTurn: "RED" | "BLUE" | "YELLOW" | "GREEN",
 *   diceValue: number | null,
 *   consecutiveSixes: number,
 *   winners: string[], // Array of PlayerColor strings
 *   lastUpdated: timestamp,
 *   
 *   // Players Map
 *   players: {
 *     RED: { uid: string, name: string, type: "HUMAN" | "BOT", difficulty: "EASY" | "MEDIUM" | "HARD" },
 *     BLUE: { ... },
 *     YELLOW: { ... },
 *     GREEN: { ... }
 *   },
 * 
 *   // Tokens Map (Arrays of positions)
 *   tokens: {
 *     RED: [0, 0, 0, 0], // Position 0 = Yard, 58 = Home
 *     BLUE: [0, 0, 0, 0],
 *     YELLOW: [0, 0, 0, 0],
 *     GREEN: [0, 0, 0, 0]
 *   },
 * 
 *   logs: [
 *     "Game started",
 *     "RED rolled a 6",
 *     "RED captured BLUE's token"
 *   ]
 * }
 */

export const FIRESTORE_GAME_TEMPLATE = {
  status: 'LOBBY',
  currentTurn: 'RED',
  diceValue: null,
  consecutiveSixes: 0,
  winners: [],
  players: {
    RED: null,
    BLUE: null,
    YELLOW: null,
    GREEN: null,
  },
  tokens: {
    RED: [0, 0, 0, 0],
    BLUE: [0, 0, 0, 0],
    YELLOW: [0, 0, 0, 0],
    GREEN: [0, 0, 0, 0],
  },
  logs: []
};
