/**
 * Stable bucket key for Ludo matchmaking (must match client payload fields).
 * @param {object} criteria
 */
export function ludoQueueBucketKey(criteria) {
  const maxPlayers = Math.min(4, Math.max(2, Number(criteria.maxPlayers) || 4));
  const fillBots = Boolean(criteria.fillBots);
  const entryFee = Number(criteria.entryFee) || 10;
  const turnTimerSec = Number(criteria.turnTimerSec) || 30;
  const botFallbackMs = Math.max(0, Number(criteria.botFallbackMs) || 0);
  const matchVariant =
    typeof criteria.matchVariant === 'string' && criteria.matchVariant.trim()
      ? criteria.matchVariant.trim()
      : 'DEFAULT';
  const waitWindowMs = Math.max(0, Number(criteria.waitWindowMs) || 0);
  const settings =
    criteria.settings && typeof criteria.settings === 'object' && !Array.isArray(criteria.settings)
      ? criteria.settings
      : {};
  return JSON.stringify({
    maxPlayers,
    fillBots,
    entryFee,
    turnTimerSec,
    botFallbackMs,
    matchVariant,
    waitWindowMs,
    settings,
  });
}
