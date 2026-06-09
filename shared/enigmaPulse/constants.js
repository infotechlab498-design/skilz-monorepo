export const ENIGMA_PULSE = {
  GAME_TYPE: 'enigma_pulse',
  INVITE_TTL_MS: 30 * 60 * 1000,
  MAX_ATTEMPTS_PER_QUESTION: 2,
  RANK_BUCKET_MAX_DELTA: 1,
  ENTRY_FEE: 10,
  QUESTION_COUNT: 10,
  /**
   * Sequence IQ (pattern_recognition): alternating turns — each human answers this many nodes per match.
   * Shared `questionIndex` runs 0 .. SEQUENCE_IQ_SHARED_ROUNDS - 1 (20 rounds = 10 per player).
   */
  SEQUENCE_IQ_QUESTIONS_PER_PLAYER: 10,
  SEQUENCE_IQ_SHARED_ROUNDS: 20,
  /**
   * Word Cipher: alternating turns — each human answers this many riddles per match.
   * Shared `questionIndex` runs 0 .. WORD_CIPHER_SHARED_ROUNDS - 1 (20 rounds = 10 per player).
   */
  WORD_CIPHER_QUESTIONS_PER_PLAYER: 10,
  WORD_CIPHER_SHARED_ROUNDS: 20,
  QUESTION_SECONDS: 15,
  /** Solo 1v1 bot fallback after this window (was 12s — lowered for faster starts). */
  MATCHMAKING_TIMEOUT_MS: 4000,
  RECONNECT_GRACE_MS: 10000,
  WIN_COINS_REWARD: 20,
  LOSS_COINS_REWARD: 10,
  WIN_XP_REWARD: 25,
  LOSS_XP_REWARD: 20,
  DRAW_REFUND_COINS: 10,
  DRAW_XP_REWARD: 10,
  BOT_MIN_MS: 1500,
  BOT_MAX_MS: 6000,
  /** Pattern Recognition / Sequence IQ uses `QUESTION_SECONDS` per round (see enigmaPulseRealtime `startQuestion`). */
  SEQUENCE_IQ_TIMER_SECONDS: {
    easy: 15,
    medium: 15,
    hard: 15,
  },
  SEQUENCE_IQ_REWARDS: {
    winCoins: 20,
    lossCoins: 10,
    winXp: 40,
    lossXp: 20,
  },
};

export const EnigmaPulseEvents = {
  JOIN_QUEUE: 'ep_join_queue',
  LEAVE_QUEUE: 'ep_leave_queue',
  CREATE_PRIVATE: 'ep_create_private',
  JOIN_PRIVATE: 'ep_join_private',
  CANCEL_PRIVATE: 'ep_cancel_private',
  /** Namespaced so MathRush `submit_answer` is never crossed. */
  SUBMIT_ANSWER: 'ep_submit_answer',
  USE_HINT: 'ep_use_hint',
  SKIP_QUESTION: 'ep_skip_question',
  REQUEST_SYNC_STATE: 'ep_request_sync_state',
  SYNC_STATE: 'ep_sync_state',
  CREATE_INVITE: 'ep_create_invite',
  ACCEPT_INVITE_LINK: 'ep_accept_invite_link',
  MARK_NOTIFICATION_READ: 'ep_mark_notification_read',
  LIST_NOTIFICATIONS: 'ep_list_notifications',
  RECONNECT: 'ep_reconnect_user',
  RETURN_TO_LOBBY: 'ep_return_to_lobby',
  LEAVE_MATCH: 'ep_leave_match',

  MATCH_FOUND: 'ep_match_found',
  /** Emitted after sockets join roomId, before Firestore deck build completes (UX: show preparing). */
  MATCH_PREPARING: 'ep_match_preparing',
  QUESTION_START: 'ep_question_start',
  TIMER_SYNC: 'ep_timer_sync',
  ANSWER_RESULT: 'ep_answer_result',
  OPPONENT_ANSWERED: 'ep_opponent_answered',
  OPPONENT_USED_HINT: 'ep_opponent_used_hint',
  OPPONENT_SKIPPED: 'ep_opponent_skipped',
  NEXT_QUESTION: 'ep_next_question',
  MATCH_END: 'ep_match_end',
  WAITING: 'ep_waiting',
  ERROR: 'ep_error',
  PRIVATE_CREATED: 'ep_private_created',
  PRIVATE_CANCELLED: 'ep_private_cancelled',
  RECONNECT_GRACE: 'ep_reconnect_grace',
  RECONNECT_CLEARED: 'ep_reconnect_cleared',
  INVITE_CREATED: 'ep_invite_created',
  INVITE_ACCEPTED: 'ep_invite_accepted',
  NOTIFICATION_PUSH: 'ep_notification',
  NOTIFICATIONS_LIST: 'ep_notifications_list',

  /** In-match admin (Syllogism): edit/delete Firestore questions + sync active deck */
  ADMIN_EDIT_QUESTION: 'ep_admin_edit_question',
  ADMIN_DELETE_QUESTION: 'ep_admin_delete_question',
  ADMIN_ACTION_SUCCESS: 'ep_admin_action_success',
  ADMIN_ERROR: 'ep_admin_error',
};
