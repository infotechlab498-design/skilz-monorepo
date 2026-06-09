/**
 * Trivia match economy — base rewards before performance bonuses.
 * Server-authoritative; keep frontend display helpers aligned with these values.
 */
export const TRIVIA_REWARDS = {
  WIN_COINS: 50,
  WIN_XP: 30,
  LOSE_COINS: 10,
  LOSE_XP: 5,
  DRAW_COINS: 10,
  DRAW_XP: 10,
};

/** Max performance bonus on top of base (anti-inflation cap). */
export const TRIVIA_BONUS_CAPS = {
  maxBonusCoins: 15,
  maxBonusXp: 10,
};

/** Fast-answer threshold for Quick Thinker bonus (milliseconds). */
export const TRIVIA_QUICK_ANSWER_MS = 8000;
