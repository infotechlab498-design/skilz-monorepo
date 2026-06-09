/**
 * Legacy fallback constants — server settles via shared/trivia (triviaRealtime).
 * Kept for any loading-state estimates; result screen uses `endedMatch.progression`.
 */
export const TRIVIA_REWARD_WIN_COINS = 50;
export const TRIVIA_REWARD_LOSE_COINS = 10;
export const TRIVIA_REWARD_DRAW_COINS = 10;

/**
 * @deprecated Use server `progression` from `trivia_game_ended`.
 */
export function inferOpponentCoinsEarned({ winnerUid, myUid, opponentIsBot }) {
    if (opponentIsBot) return null;
    if (!winnerUid || winnerUid === 'draw') return TRIVIA_REWARD_DRAW_COINS;
    if (winnerUid === myUid) return TRIVIA_REWARD_LOSE_COINS;
    return TRIVIA_REWARD_WIN_COINS;
}

/**
 * @deprecated Use server `progression` from `trivia_game_ended`.
 */
export function predictMyCoinsEarned(winnerUid, myUid) {
    if (!winnerUid || winnerUid === 'draw') return TRIVIA_REWARD_DRAW_COINS;
    if (winnerUid === myUid) return TRIVIA_REWARD_WIN_COINS;
    return TRIVIA_REWARD_LOSE_COINS;
}
