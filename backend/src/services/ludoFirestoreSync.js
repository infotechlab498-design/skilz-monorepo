import { getAdminFirestore } from './firebaseAdmin.js';
import { updatePlayerStatsCanonical } from './userFirestoreAdmin.js';

function isFirebaseHumanId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.startsWith('bot_')) return false;
  if (id.startsWith('devotp_')) return true;
  return true;
}

/** Server may send `winners` as color strings (legacy) or `{ playerId, rank, color }[]`. */
function normalizeLudoStandings(winners, players) {
  if (!Array.isArray(winners) || winners.length === 0) return [];
  if (typeof winners[0] === 'string') {
    return winners.map((color, i) => ({
      color,
      playerId: players[color]?.id || `bot_${color}`,
      rank: i + 1,
    }));
  }
  return [...winners]
    .filter((w) => w && w.color)
    .sort((a, b) => (a.rank || 0) - (b.rank || 0));
}

/**
 * After a Ludo room ends: write `matches/{matchId}` and merge human `users/{uid}` **stats only**.
 * Coins and rank XP are applied during the match (`ludoFirestoreWallet` / `registerMoveToken`) — not here
 * (avoids double payout).
 *
 * @param {{ matchId: string, state: object, entryFee?: number }} p
 */
export async function syncLudoMatchEnd({ matchId, state, entryFee = 10 }) {
  const adb = getAdminFirestore();
  if (!adb || !matchId || !state) return;

  const players = state.players || {};
  const winners = state.winners || [];
  const standings = normalizeLudoStandings(winners, players);

  const humanRows = Object.entries(players)
    .map(([color, p]) => ({ color, p }))
    .filter(({ p }) => p && p.type === 'HUMAN' && isFirebaseHumanId(p.id));

  const playerIds = [...new Set(humanRows.map(({ p }) => p.id))];

  const rankings = [];
  for (const row of standings) {
    const pl = players[row.color];
    if (pl?.type === 'HUMAN' && pl.id && isFirebaseHumanId(pl.id)) {
      rankings.push({ uid: pl.id, rank: row.rank, color: row.color });
    }
  }

  const podiumColors = new Set(standings.map((r) => r.color));
  for (const { color, p } of humanRows) {
    if (!podiumColors.has(color)) {
      rankings.push({ uid: p.id, rank: standings.length + 1, color });
    }
  }

  const top = standings[0];
  const finishedAt = new Date().toISOString();
  const matchPayload = {
    game: 'ludo',
    roomId: matchId,
    playerIds,
    status: 'finished',
    winnerUid:
      rankings.find((r) => r.rank === 1)?.uid ||
      (top && players[top.color]?.type === 'HUMAN' ? players[top.color].id : null),
    rankings: rankings.map((r) => ({ uid: r.uid, rank: r.rank })),
    entryFee: Number(entryFee) || 0,
    createdAt: state.meta?.createdAt || finishedAt,
    finishedAt,
    meta: {
      fillBots: Boolean(state.meta?.fillBots),
      matchVariant: state.meta?.matchVariant || 'DEFAULT',
      autofillAggressiveBots: Boolean(state.meta?.autofillAggressiveBots),
      turnTimerSec: state.turnTimerSec ?? state.settings?.turnTimerSec,
    },
  };

  try {
    await adb.collection('matches').doc(matchId).set(matchPayload, { merge: true });
  } catch (e) {
    console.error('[ludoFirestoreSync] match write failed:', e.message);
    return;
  }

  for (const r of rankings) {
    const winIncr = r.rank === 1 ? 1 : 0;
    const lossIncr = r.rank === 1 ? 0 : 1;
    try {
      await updatePlayerStatsCanonical({
        uid: r.uid,
        winsDelta: winIncr,
        lossesDelta: lossIncr,
        matchesDelta: 1,
        gameKey: 'ludo',
        gameMatchesDelta: 1,
        gameWinsDelta: winIncr,
        touchStreak: true,
        increments: { 'stats.ludoMatches': 1 },
      });
    } catch (e) {
      console.error('[ludoFirestoreSync] user', r.uid, e.message);
    }
  }
}
