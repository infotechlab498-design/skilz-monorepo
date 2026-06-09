export function createUserModel(row = {}) {
  return {
    uid: String(row.uid || ''),
    displayName: String(row.displayName || 'Player'),
    xp: Number(row.xp || 0),
    level: Number(row.level || 1),
    stats: {
      totalMatches: Number(row?.stats?.totalMatches || 0),
      wins: Number(row?.stats?.wins || 0),
      losses: Number(row?.stats?.losses || 0),
      accuracy: Number(row?.stats?.accuracy || 0),
    },
  };
}

export function createQuestionModel(row = {}) {
  return {
    id: String(row.id || ''),
    text: String(row.text || ''),
    options: Array.isArray(row.options) ? row.options.map((x) => String(x)) : [],
    correctIndex: Number(row.correctIndex),
    category: String(row.category || 'General Knowledge'),
    difficulty: String(row.difficulty || 'easy'),
    active: Boolean(row.active ?? true),
  };
}

export function createGameRoomModel(row = {}) {
  return {
    roomId: String(row.roomId || ''),
    gameType: 'enigma_pulse',
    status: String(row.status || 'ended'),
    category: String(row.category || 'General Knowledge'),
    difficulty: String(row.difficulty || 'easy'),
    participantUids: Array.isArray(row.participantUids) ? row.participantUids : [],
    players: Array.isArray(row.players) ? row.players : [],
    createdAtMs: Number(row.createdAtMs || Date.now()),
    endedAtMs: Number(row.endedAtMs || Date.now()),
  };
}

export function createTransactionModel(row = {}) {
  return {
    txId: String(row.txId || ''),
    uid: String(row.uid || ''),
    roomId: String(row.roomId || ''),
    type: String(row.type || 'entry_fee'),
    amount: Number(row.amount || 0),
    currency: String(row.currency || 'coins'),
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
  };
}
