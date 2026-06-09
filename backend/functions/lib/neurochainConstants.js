/** NeuroChain — Cloud Functions copy (keep in sync with shared/neurochain/constants.js). */

module.exports = {
  NODES_PER_MATCH: 10,
  NC_BOT_UID: 'nc_bot_practice',
  COLLECTIONS: {
    GAMES: 'neurochain_games',
    SECRETS: 'neurochain_game_secrets',
    QUEUE: 'neurochain_matchmaking_queue',
  },
  DEFAULT_QUESTION_MS: 30_000,
  ANSWER_GRACE_MS: 2_500,
  USED_QUESTION_IDS_CAP: 1500,
  MATCH_WINDOW_MS: 12_000,
  BOT_CORRECT_PROBABILITY: 0.8,
  nodeTier(nodeIndex) {
    const i = Math.max(0, Math.min(9, Math.floor(nodeIndex)));
    if (i <= 2) return 'easy';
    if (i <= 6) return 'medium';
    return 'hard';
  },
  botUiDelayRangeMs(tier) {
    if (tier === 'easy') return { min: 400, max: 1200 };
    if (tier === 'medium') return { min: 800, max: 2000 };
    return { min: 1200, max: 3500 };
  },
};
