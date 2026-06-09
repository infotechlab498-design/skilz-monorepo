export const TRACK_LENGTH = 52;
export const HOME_STRETCH_START = 53;
export const HOME_POSITION = 58;

// Red starts bottom, Green left, Yellow top, Blue right (standard flow)
export const START_POSITIONS = {
  RED: 1,
  GREEN: 14,
  YELLOW: 27,
  BLUE: 40
};

export const END_TRACK_POSITIONS = {
  RED: 51,
  GREEN: 12,
  YELLOW: 25,
  BLUE: 38
};

// Start squares (1, 14, 27, 40) and safe stars (9, 22, 35, 48)
export const GLOBAL_SAFE_SQUARES = [1, 9, 14, 22, 27, 35, 40, 48];

export const COLOR_CLASSES = {
  RED: 'bg-red',
  BLUE: 'bg-blue',
  YELLOW: 'bg-yellow',
  GREEN: 'bg-green',
  EMPTY: 'bg-slate-200'
};

export const COLOR_TEXT = {
  RED: 'text-red',
  BLUE: 'text-blue',
  GREEN: 'text-green',
  YELLOW: 'text-yellow'
}

// 15x15 grid coordinates for the 52 common track squares
export const POSITION_MAP = {
  1: [13, 6], 2: [12, 6], 3: [11, 6], 4: [10, 6], 5: [9, 6],       // Red lane up
  6: [8, 5], 7: [8, 4], 8: [8, 3], 9: [8, 2], 10: [8, 1], 11: [8, 0], // Green lane left-out
  12: [7, 0], 13: [6, 0], // Green corner
  14: [6, 1], 15: [6, 2], 16: [6, 3], 17: [6, 4], 18: [6, 5],       // Green lane right-in
  19: [5, 6], 20: [4, 6], 21: [3, 6], 22: [2, 6], 23: [1, 6], 24: [0, 6], // Yellow lane up-out
  25: [0, 7], 26: [0, 8], // Yellow corner
  27: [1, 8], 28: [2, 8], 29: [3, 8], 30: [4, 8], 31: [5, 8],       // Yellow lane down-in
  32: [6, 9], 33: [6, 10], 34: [6, 11], 35: [6, 12], 36: [6, 13], 37: [6, 14], // Blue lane right-out
  38: [7, 14], 39: [8, 14], // Blue corner
  40: [8, 13], 41: [8, 12], 42: [8, 11], 43: [8, 10], 44: [8, 9],       // Blue lane left-in
  45: [9, 8], 46: [10, 8], 47: [11, 8], 48: [12, 8], 49: [13, 8], 50: [14, 8], // Red lane down-out
  51: [14, 7], 52: [14, 6] // Red corner / wrap back to 1
};

export const HOME_STRETCH_MAP = {
  RED: { 53: [13, 7], 54: [12, 7], 55: [11, 7], 56: [10, 7], 57: [9, 7] },
  GREEN: { 53: [7, 1], 54: [7, 2], 55: [7, 3], 56: [7, 4], 57: [7, 5] },
  YELLOW: { 53: [1, 7], 54: [2, 7], 55: [3, 7], 56: [4, 7], 57: [5, 7] },
  BLUE: { 53: [7, 13], 54: [7, 12], 55: [7, 11], 56: [7, 10], 57: [7, 9] }
};

export const YARD_COORDINATES = {
  GREEN: [[2.5, 2.5], [2.5, 4.5], [4.5, 2.5], [4.5, 4.5]],   // Top Left
  YELLOW: [[2.5, 10.5], [2.5, 12.5], [4.5, 10.5], [4.5, 12.5]], // Top Right
  RED: [[10.5, 2.5], [10.5, 4.5], [12.5, 2.5], [12.5, 4.5]],   // Bottom Left
  BLUE: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]] // Bottom Right
};

/** Winning-area slots inside each player's center triangle (slot 1–4). */
export const FINISH_ZONE_COORDINATES = {
  GREEN: [[6.65, 6.55], [6.65, 7.45], [6.85, 6.7], [6.85, 7.3]],
  YELLOW: [[6.35, 6.55], [6.35, 7.45], [6.55, 6.7], [6.55, 7.3]],
  RED: [[7.35, 6.55], [7.35, 7.45], [7.55, 6.7], [7.55, 7.3]],
  BLUE: [[6.55, 7.65], [7.45, 7.65], [6.7, 7.85], [7.3, 7.85]],
};
