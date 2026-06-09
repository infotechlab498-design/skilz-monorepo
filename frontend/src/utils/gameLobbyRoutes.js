/**
 * Build lobby URL for a friend challenge after accept (`gameId` from InviteModal / invites).
 * @param {string} gameId - trivia | mathrush | ludo | enigma_pulse | enigmapulse
 * @param {string} matchId - Firestore matches/{matchId}
 * @returns {string} path + query for react-router navigate()
 */
export function buildLobbyPathWithMatch(gameId, matchId) {
  const g = String(gameId || '').toLowerCase();
  const m = String(matchId || '').trim();
  const q = m ? `?matchId=${encodeURIComponent(m)}` : '';
  if (g === 'trivia') return `/triviaLobby/trivia${q}`;
  if (g === 'mathrush') return `/mathRushLobby${q}`;
  if (g === 'ludo') return `/ludoLobby${q}`;
  if (g === 'enigmapulse' || g === 'enigma_pulse' || g === 'enigma') return `/enigmaPulseLobby${q}`;
  if (g === 'neurochain' || g === 'neuro_chain') return `/neurochainLobby${q}`;
  return `/triviaLobby/trivia${q}`;
}
