export function buildPracticeQueuePayload({ user, category, difficulty, gameKey }) {
  return {
    displayName: user?.displayName || 'Player',
    photoURL: user?.photoURL || '',
    category,
    difficulty,
    gameKey,
    soloBot: true,
    xp: Number(user?.xp || 0),
  };
}
