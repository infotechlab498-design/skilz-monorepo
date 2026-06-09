export function buildOneVsOneQueuePayload({ user, category, difficulty, gameKey }) {
  return {
    displayName: user?.displayName || 'Player',
    photoURL: user?.photoURL || '',
    category,
    difficulty,
    gameKey,
    soloBot: false,
    xp: Number(user?.xp || 0),
  };
}
