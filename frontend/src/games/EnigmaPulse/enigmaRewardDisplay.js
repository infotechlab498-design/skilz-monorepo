/**
 * Format hybrid base + performance bonus rewards for result screens.
 * @param {{ baseCoins?: number, bonusCoins?: number, coinsGained?: number }} row
 */
export function formatMatchCoins(row) {
  if (!row || row.isBot) return '—';
  const total = Number(row.coinsGained ?? 0);
  const base = Number(row.baseCoins ?? total);
  const bonus = Number(row.bonusCoins ?? 0);
  if (bonus > 0) return `+${base} (+${bonus} bonus)`;
  return `+${total}`;
}

/**
 * @param {{ baseXp?: number, bonusXp?: number, xpGained?: number }} row
 */
export function formatMatchXp(row) {
  if (!row || row.isBot) return '—';
  const total = Number(row.xpGained ?? 0);
  const base = Number(row.baseXp ?? total);
  const bonus = Number(row.bonusXp ?? 0);
  if (bonus > 0) return `+${base} (+${bonus} bonus)`;
  return `+${total}`;
}

/**
 * @param {object} prog — progression entry from MATCH_END
 */
export function mapProgressionFields(prog = {}) {
  const xpGained = Number(prog?.xpGained || 0);
  const coinsGained = Number(prog?.coinsGained || 0);
  const baseXp = prog?.baseXp != null ? Number(prog.baseXp) : xpGained;
  const baseCoins = prog?.baseCoins != null ? Number(prog.baseCoins) : coinsGained;
  const bonusXp = Number(prog?.bonusXp || 0);
  const bonusCoins = Number(prog?.bonusCoins || 0);
  const performanceBreakdown = Array.isArray(prog?.performanceBreakdown)
    ? prog.performanceBreakdown
    : [];
  return {
    xpGained,
    coinsGained,
    baseXp,
    baseCoins,
    bonusXp,
    bonusCoins,
    performanceBreakdown,
    rank: String(prog?.rank || '—'),
  };
}
