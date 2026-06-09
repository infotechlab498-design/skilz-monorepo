const counters = {
  staleSnapshotWriteRejected: 0,
  joinLockContention: 0,
  timerActionLockSkips: 0,
  walletJoinChargeFailures: 0,
  queueMatchesCreated: 0,
  queueSoloFallbackMatches: 0,
  queueFlushContention: 0,
};

export function incMetric(name) {
  if (Object.prototype.hasOwnProperty.call(counters, name)) {
    counters[name] += 1;
  }
}

export function getLudoMetricsSnapshot() {
  return {
    ...counters,
    at: Date.now(),
    queueBackend: String(process.env.LUDO_QUEUE_BACKEND || 'memory').toLowerCase(),
    roomStateBackend: String(process.env.LUDO_ROOM_STATE_BACKEND || 'memory').toLowerCase(),
    redisUrlConfigured: Boolean(String(process.env.REDIS_URL || '').trim()),
  };
}

/**
 * Prometheus exposition format (counters + info labels). Scrape with Prometheus or pushgateway.
 */
export function formatLudoMetricsPrometheus() {
  const m = getLudoMetricsSnapshot();
  const qBackend = m.queueBackend.replace(/[^a-z0-9_]/g, '_');
  const rBackend = m.roomStateBackend.replace(/[^a-z0-9_]/g, '_');
  const lines = [
    '# HELP skilz_ludo_stale_snapshot_write_rejected_total Rejected stale Ludo snapshot writes',
    '# TYPE skilz_ludo_stale_snapshot_write_rejected_total counter',
    `skilz_ludo_stale_snapshot_write_rejected_total ${m.staleSnapshotWriteRejected}`,
    '# HELP skilz_ludo_join_lock_contention_total Join lock contention events',
    '# TYPE skilz_ludo_join_lock_contention_total counter',
    `skilz_ludo_join_lock_contention_total ${m.joinLockContention}`,
    '# HELP skilz_ludo_timer_action_lock_skips_total Timer action lock skips',
    '# TYPE skilz_ludo_timer_action_lock_skips_total counter',
    `skilz_ludo_timer_action_lock_skips_total ${m.timerActionLockSkips}`,
    '# HELP skilz_ludo_wallet_join_charge_failures_total Wallet join charge failures',
    '# TYPE skilz_ludo_wallet_join_charge_failures_total counter',
    `skilz_ludo_wallet_join_charge_failures_total ${m.walletJoinChargeFailures}`,
    '# HELP skilz_ludo_queue_matches_created_total Queue flush matches created',
    '# TYPE skilz_ludo_queue_matches_created_total counter',
    `skilz_ludo_queue_matches_created_total ${m.queueMatchesCreated}`,
    '# HELP skilz_ludo_queue_solo_fallback_matches_total Solo fallback matches from classic queue',
    '# TYPE skilz_ludo_queue_solo_fallback_matches_total counter',
    `skilz_ludo_queue_solo_fallback_matches_total ${m.queueSoloFallbackMatches}`,
    '# HELP skilz_ludo_queue_flush_contention_total Redis queue flush WATCH contention',
    '# TYPE skilz_ludo_queue_flush_contention_total counter',
    `skilz_ludo_queue_flush_contention_total ${m.queueFlushContention}`,
    '# HELP skilz_ludo_info Process info (value 1)',
    '# TYPE skilz_ludo_info gauge',
    `skilz_ludo_info{queue_backend="${qBackend}",room_state_backend="${rBackend}",redis_url_configured="${m.redisUrlConfigured ? 'true' : 'false'}"} 1`,
  ];
  return `${lines.join('\n')}\n`;
}
