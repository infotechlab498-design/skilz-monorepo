/** Normalize winners from server (objects) or legacy (color strings). */
export function standingsList(state) {
  const w = state?.winners || [];
  if (!w.length) return [];
  if (typeof w[0] === 'object' && w[0]?.color) {
    return [...w].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }
  return w.map((color, i) => ({
    color,
    rank: i + 1,
    playerId: state.players?.[color]?.id,
    name: state.players?.[color]?.name,
  }));
}

export function rankPrizeCoins(rank) {
  if (rank === 1) return 20;
  if (rank === 2) return 15;
  if (rank === 3) return 10;
  if (rank === 4) return 5;
  return 0;
}

export function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export function rankTitle(rank, isMe) {
  if (rank === 1 && isMe) return 'Victory!';
  if (rank === 1) return 'Champion!';
  if (rank === 2 && isMe) return 'Great Job!';
  if (rank === 3 && isMe) return 'Well Played!';
  if (isMe) return 'Match Over';
  return 'Player Finished';
}

export function isPlayerMe(entry, authUid, isSeatedMe) {
  if (!entry) return false;
  if (entry.playerId && isSeatedMe?.(entry.playerId)) return true;
  if (entry.playerId && authUid && entry.playerId === authUid) return true;
  return false;
}

export function findMyColor(state, authUid, isSeatedMe) {
  if (!state?.players) return null;
  for (const [color, p] of Object.entries(state.players)) {
    if (p?.type === 'EMPTY') continue;
    if (isSeatedMe?.(p?.id) || (authUid && p?.id === authUid)) return color;
  }
  return null;
}
