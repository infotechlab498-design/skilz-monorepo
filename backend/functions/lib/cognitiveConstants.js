module.exports = {
  COGNITIVE_BOT_UID: 'cognitive_bot_practice',
  COGNITIVE_MAX_ROUNDS: 10,
  COGNITIVE_ROUND_MS: 30_000,
  COGNITIVE_ANSWER_GRACE_MS: 2_500,
  COGNITIVE_MATCH_WINDOW_MS: 12_000,
  COGNITIVE_USED_PATTERNS_CAP: 60,
  COGNITIVE_COLLECTIONS: {
    ROOMS: 'cognitive_game_rooms',
    SECRETS: 'cognitive_game_secrets',
    QUEUE: 'cognitive_matchmaking_queue',
    SESSIONS: 'cognitive_sessions',
  },
  COGNITIVE_CATEGORIES: ['syllogism', 'numerical', 'spatial'],
  COGNITIVE_DIFFICULTIES: ['easy', 'medium', 'hard'],
  difficultyFromStreak(streak) {
    const n = Math.max(0, Number(streak) || 0);
    if (n <= 2) return 'easy';
    if (n <= 5) return 'medium';
    return 'hard';
  },
  streakMultiplier(streak) {
    const n = Math.max(0, Number(streak) || 0);
    if (n >= 6) return 1.5;
    if (n >= 3) return 1.25;
    return 1;
  },
};
