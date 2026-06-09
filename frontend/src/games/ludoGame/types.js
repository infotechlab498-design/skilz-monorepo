export const GameStatus = {
  LOBBY: 'LOBBY',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED'
};

export const PlayerType = {
  HUMAN: 'HUMAN',
  BOT: 'BOT',
  EMPTY: 'EMPTY'
};

export const PlayerColor = {
  RED: 'RED',
  BLUE: 'BLUE',
  YELLOW: 'YELLOW',
  GREEN: 'GREEN'
};

export const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD'
};

export const MoveType = {
  NORMAL: 'NORMAL',
  ENTER: 'ENTER',
  FINISH: 'FINISH',
  CAPTURE: 'CAPTURE'
};

export const GameMode = {
  VS_BOT: 'VS_BOT',
  LOCAL_1V1: 'LOCAL_1V1',
  LOCAL_4P: 'LOCAL_4P',
  /** Matchmaking vs platform players (socket `ludo:queueJoin` → `ludo:matchFound`). */
  ONLINE_MATCH: 'ONLINE_MATCH',
};
