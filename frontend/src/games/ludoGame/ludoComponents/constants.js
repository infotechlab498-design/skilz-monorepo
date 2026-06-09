
export const BOARD_SIZE = 15;
export const TRACK_LENGTH = 52;
export const HOME_STRETCH_START = 53;
export const HOME_POSITION = 58;

// Starting track positions for each color
// Corrected to match POSITION_MAP: RED(1), GREEN(14), YELLOW(27), BLUE(40)

export const START_POSITIONS = {
  RED: 1,
  BLUE: 40,
  YELLOW: 27,
  GREEN: 14,
};

/**
 * The last square on the common track before entering the home stretch.
 * For each color, this is roughly 2 squares behind their starting square.
 */
export const END_TRACK_POSITIONS = {
  RED: 51,
  BLUE: 38,
  YELLOW: 25,
  GREEN: 12,
};

// Standard safe spots (stars) on a classic board
export const GLOBAL_SAFE_SQUARES = [1, 9, 14, 22, 27, 35, 40, 48];

export const COLOR_HEX = {
  RED: '#e74c3c',
  BLUE: '#3498db',
  YELLOW: '#f1c40f',
  GREEN: '#27ae60',
};

export const COLOR_CLASSES = {
  RED: 'bg-red',
  BLUE: 'bg-blue',
  YELLOW: 'bg-yellow',
  GREEN: 'bg-green',
};

export const COLOR_LIGHT_CLASSES = {
  RED: 'bg-red-50',
  BLUE: 'bg-blue-50',
  YELLOW: 'bg-yellow-50',
  GREEN: 'bg-green-50',
};

/**
 * Maps a relative position (1-52) to grid [row, col] coordinates
 * This is the core logic for rendering the "circular" path on a 15x15 grid.
 */
export const POSITION_MAP = {
  // Red side path (starting bottom-left arm)
  1: [13, 6], 2: [12, 6], 3: [11, 6], 4: [10, 6], 5: [9, 6],
  6: [8, 5], 7: [8, 4], 8: [8, 3], 9: [8, 2], 10: [8, 1], 11: [8, 0],
  12: [7, 0], 13: [6, 0],
  // Green side path (top-left arm)
  14: [6, 1], 15: [6, 2], 16: [6, 3], 17: [6, 4], 18: [6, 5],
  19: [5, 6], 20: [4, 6], 21: [3, 6], 22: [2, 6], 23: [1, 6], 24: [0, 6],
  25: [0, 7], 26: [0, 8],
  // Yellow side path (top-right arm)
  27: [1, 8], 28: [2, 8], 29: [3, 8], 30: [4, 8], 31: [5, 8],
  32: [6, 9], 33: [6, 10], 34: [6, 11], 35: [6, 12], 36: [6, 13], 37: [6, 14],
  38: [7, 14], 39: [8, 14],
  // Blue side path (bottom-right arm)
  40: [8, 13], 41: [8, 12], 42: [8, 11], 43: [8, 10], 44: [8, 9],
  45: [9, 8], 46: [10, 8], 47: [11, 8], 48: [12, 8], 49: [13, 8], 50: [14, 8],
  51: [14, 7], 52: [14, 6],
};

/**
 * Home stretches mapping
 */
export const HOME_STRETCH_MAP = {
  RED: { 53: [13, 7], 54: [12, 7], 55: [11, 7], 56: [10, 7], 57: [9, 7] },
  BLUE: { 53: [7, 13], 54: [7, 12], 55: [7, 11], 56: [7, 10], 57: [7, 9] },
  YELLOW: { 53: [1, 7], 54: [2, 7], 55: [3, 7], 56: [4, 7], 57: [5, 7] },
  GREEN: { 53: [7, 1], 54: [7, 2], 55: [7, 3], 56: [7, 4], 57: [7, 5] },
};

export const YARD_COORDINATES = {
  RED: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
  GREEN: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  YELLOW: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  BLUE: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
};
