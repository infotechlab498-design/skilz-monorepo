export const COGNITIVE_BOT_UID = 'cognitive_bot_practice';

export const COGNITIVE_MAX_ROUNDS = 10;
export const COGNITIVE_ROUND_MS = 30_000;
export const COGNITIVE_ANSWER_GRACE_MS = 2_500;
export const COGNITIVE_MATCH_WINDOW_MS = 12_000;
export const COGNITIVE_USED_PATTERNS_CAP = 60;

export const COGNITIVE_COLLECTIONS = {
  ROOMS: 'cognitive_game_rooms',
  SECRETS: 'cognitive_game_secrets',
  QUEUE: 'cognitive_matchmaking_queue',
  SESSIONS: 'cognitive_sessions',
};

export const COGNITIVE_CALLABLES = {
  START_PRACTICE: 'cognitiveStartPractice',
  ENQUEUE_1V1: 'cognitiveEnqueue1v1',
  LEAVE_QUEUE: 'cognitiveLeaveQueue',
  TRY_MATCH: 'cognitiveTryMatch',
  SUBMIT_ANSWER: 'cognitiveSubmitAnswer',
  PROCESS_BOT_TURN: 'cognitiveProcessBotTurn',
  RESOLVE_ROUND_IF_STALE: 'cognitiveResolveRoundIfStale',
};

export const COGNITIVE_CATEGORIES = ['syllogism', 'numerical', 'spatial'];
export const COGNITIVE_DIFFICULTIES = ['easy', 'medium', 'hard'];

export function difficultyFromStreak(streak) {
  const n = Math.max(0, Number(streak) || 0);
  if (n <= 2) return 'easy';
  if (n <= 5) return 'medium';
  return 'hard';
}

export function streakMultiplier(streak) {
  const n = Math.max(0, Number(streak) || 0);
  if (n >= 6) return 1.5;
  if (n >= 3) return 1.25;
  return 1;
}
