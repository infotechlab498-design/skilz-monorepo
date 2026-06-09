import { LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE } from './ludoMatchVariants.js';

/**
 * Pure matchmaking dequeue plan (must stay in sync with Redis atomic path).
 * @param {Array<{ criteria: object, joinedAt?: number }>} tickets oldest-first (index 0 = longest waiting)
 * @param {number} nowMs
 * @returns {null | { take: number, crit: object, classic?: { needsVote: boolean, soloFallback1v1: boolean }, default?: { fallbackToBot: boolean } }}
 */
export function computeMatchmakingDequeue(tickets, nowMs) {
  if (!tickets?.length) return null;
  const crit = tickets[0].criteria;
  const now = Number(nowMs) || Date.now();

  if (crit.matchVariant === LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE) {
    const waitMs = Math.min(120000, Math.max(1000, Number(crit.waitWindowMs) || 12000));
    const oldestJoinedAt = Number(tickets[0].joinedAt || now);
    const waitedEnough = now - oldestJoinedAt >= waitMs;

    let take = 0;
    let needsVote = false;
    let soloFallback1v1 = false;

    if (tickets.length >= 4) {
      take = 4;
    } else if (tickets.length === 1 && waitedEnough) {
      take = 1;
      needsVote = false;
      soloFallback1v1 = true;
    } else if (tickets.length >= 2 && waitedEnough) {
      take = Math.min(4, tickets.length);
      needsVote = take < 4;
    } else {
      return null;
    }

    return { take, crit, classic: { needsVote, soloFallback1v1 } };
  }

  const oldestJoinedAt = Number(tickets[0].joinedAt || now);
  const botFallbackMs = Math.max(0, Number(crit.botFallbackMs) || 0);
  const fallbackEligible =
    !crit.fillBots && botFallbackMs > 0 && now - oldestJoinedAt >= botFallbackMs;
  const minHumans = crit.fillBots || fallbackEligible ? 1 : 2;
  if (tickets.length < minHumans) return null;

  const take = Math.min(crit.maxPlayers, tickets.length);
  const fallbackToBot = fallbackEligible && take < crit.maxPlayers;
  return { take, crit, default: { fallbackToBot } };
}
