/**
 * Plain defaults for Firestore `users/{uid}` (no Timestamp values).
 * Use with `serverTimestamp()` from the client on create.
 */

export const DEFAULT_USER_STATS = {
  totalMatches: 0,
  wins: 0,
  losses: 0,
  accuracy: 0,
  avgMoveSpeedMs: 0,
};

export const DEFAULT_USER_GAMES = {
  ludo: {
    matches: 0,
    wins: 0,
    xp: 0,
  },
  trivia: {
    matches: 0,
    wins: 0,
    accuracy: 0,
  },
  mathRush: {
    matches: 0,
    xp: 0,
    bestScore: 0,
  },
};

/** Optional legacy fields some code paths still read */
export const DEFAULT_USER_STATS_EXTRA = {
  ludoMatches: 0,
  dailyStreakBest: 0,
};
