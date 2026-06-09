import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../firebaseAdmin.js';

function dbOrThrow() {
  const db = getAdminFirestore();
  if (!db) throw new Error('Firestore Admin is not configured');
  return db;
}

export async function getUserByUid(uid) {
  const db = dbOrThrow();
  const snap = await db.collection('users').doc(String(uid)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function getQuestions({ category, difficulty, count }) {
  const db = dbOrThrow();
  const snap = await db
    .collection('questions')
    .where('category', '==', category)
    .where('difficulty', '==', difficulty)
    .where('active', '==', true)
    .limit(Math.max(40, count * 4))
    .get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log('Questions fetched:', rows.length);
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}

export async function recordTransaction({
  txId,
  uid,
  roomId,
  type,
  amount,
  currency = 'coins',
  meta = {},
}) {
  const db = dbOrThrow();
  const ref = db.collection('transactions').doc(String(txId));
  await ref.set(
    {
      uid,
      roomId,
      type,
      amount,
      currency,
      meta,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function recordRoomSummary(summary) {
  const db = dbOrThrow();
  const participantUids = Array.isArray(summary.players)
    ? summary.players.map((p) => p.uid).filter(Boolean)
    : [];
  await db.collection('gameRooms').doc(String(summary.roomId)).set(
    {
      ...summary,
      participantUids,
      gameType: 'enigma_pulse',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function upsertLeaderboardEntry({ seasonId = 'current', uid, scoreDelta = 0, win = false }) {
  const db = dbOrThrow();
  const ref = db.collection('leaderboard').doc(seasonId).collection('entries').doc(String(uid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    tx.set(
      ref,
      {
        uid,
        score: Number(prev?.score || 0) + Number(scoreDelta || 0),
        wins: Number(prev?.wins || 0) + (win ? 1 : 0),
        matches: Number(prev?.matches || 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

function rankFromXp(xpValue) {
  const xp = Math.max(0, Number(xpValue || 0));
  if (xp >= 8000) return 'Diamond';
  if (xp >= 5000) return 'Platinum';
  if (xp >= 3000) return 'Gold';
  if (xp >= 1500) return 'Silver';
  return 'Bronze';
}

export async function updateEnigmaPlayerProgress({ uid, won = false, draw = false, xpDelta = 0 }) {
  const db = dbOrThrow();
  const ref = db.collection('users').doc(String(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() : {};
    const nextXp = Math.max(0, Number(prev?.xp || 0) + Number(xpDelta || 0));
    const rank = rankFromXp(nextXp);
    const nextSyllogismMatches = Number(prev?.stats?.syllogismMatches || 0) + 1;
    const nextSyllogismWins = Number(prev?.stats?.syllogismWins || 0) + (won ? 1 : 0);
    const syllogismAccuracy = nextSyllogismMatches > 0 ? Math.round((nextSyllogismWins / nextSyllogismMatches) * 100) : 0;
    tx.set(
      ref,
      {
        xp: nextXp,
        rank,
        stats: {
          totalMatches: Number(prev?.stats?.totalMatches || 0) + 1,
          wins: Number(prev?.stats?.wins || 0) + (won ? 1 : 0),
          losses: Number(prev?.stats?.losses || 0) + (!won && !draw ? 1 : 0),
          draws: Number(prev?.stats?.draws || 0) + (draw ? 1 : 0),
          syllogismMatches: nextSyllogismMatches,
          syllogismWins: nextSyllogismWins,
          syllogismAccuracy,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { xp: nextXp, rank };
  });
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value || 0);
}

export async function listRecentEnigmaResultsForUser({ uid, gameKey = 'syllogism', limit = 10 }) {
  const db = dbOrThrow();
  const cap = Math.min(50, Math.max(1, Number(limit) || 10));
  const rows = [];
  let snap;
  try {
    snap = await db
      .collection('gameRooms')
      .where('gameType', '==', 'enigma_pulse')
      .where('gameKey', '==', String(gameKey || 'syllogism'))
      .where('participantUids', 'array-contains', String(uid))
      .orderBy('endedAtMs', 'desc')
      .limit(cap)
      .get();
  } catch {
    snap = await db
      .collection('gameRooms')
      .where('gameType', '==', 'enigma_pulse')
      .where('gameKey', '==', String(gameKey || 'syllogism'))
      .where('participantUids', 'array-contains', String(uid))
      .limit(cap * 3)
      .get();
  }

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const players = Array.isArray(d.players) ? d.players : [];
    const me = players.find((p) => String(p?.uid || '') === String(uid));
    const opponent = players.find((p) => String(p?.uid || '') !== String(uid));
    const progression = Array.isArray(d.progression) ? d.progression : [];
    const myProgress = progression.find((p) => String(p?.uid || '') === String(uid)) || null;
    rows.push({
      roomId: doc.id,
      gameKey: String(d.gameKey || ''),
      winnerUid: String(d.winnerUid || 'draw'),
      endReason: String(d.endReason || ''),
      category: String(d.category || ''),
      difficulty: String(d.difficulty || ''),
      endedAtMs: toMillis(d.endedAtMs || d.updatedAt),
      myScore: Number(me?.score || 0),
      opponentScore: Number(opponent?.score || 0),
      xpGained: Number(myProgress?.xpGained || 0),
      bonusXp: Number(myProgress?.bonusXp || 0),
      bonusCoins: Number(myProgress?.bonusCoins || 0),
      rank: String(myProgress?.rank || ''),
    });
  }
  rows.sort((a, b) => Number(b.endedAtMs || 0) - Number(a.endedAtMs || 0));
  return rows.slice(0, cap);
}

export async function settleEnigmaMatchReward({
  roomId,
  uid,
  won = false,
  draw = false,
  coinsDelta = 0,
  xpDelta = 0,
  baseXp = 0,
  baseCoins = 0,
  bonusXp = 0,
  bonusCoins = 0,
  performanceBreakdown = [],
}) {
  const db = dbOrThrow();
  const rewardRef = db.collection('enigmaSettlements').doc(`${String(roomId)}_${String(uid)}`);
  const userRef = db.collection('users').doc(String(uid));
  return db.runTransaction(async (tx) => {
    const rewardSnap = await tx.get(rewardRef);
    if (rewardSnap.exists) {
      const prev = rewardSnap.data() || {};
      return {
        rewarded: false,
        xp: Number(prev?.xpAfter || 0),
        rank: String(prev?.rankAfter || 'Bronze'),
        coins: Number(prev?.coinsAfter || 0),
      };
    }
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};
    const nextCoins = Math.max(0, Number(user?.coins || 0) + Number(coinsDelta || 0));
    const nextXp = Math.max(0, Number(user?.xp || 0) + Number(xpDelta || 0));
    const nextRank = rankFromXp(nextXp);
    const nextMatches = Number(user?.stats?.syllogismMatches || 0) + 1;
    const nextWins = Number(user?.stats?.syllogismWins || 0) + (won ? 1 : 0);
    const nextAccuracy = nextMatches > 0 ? Math.round((nextWins / nextMatches) * 100) : 0;

    tx.set(
      userRef,
      {
        coins: nextCoins,
        xp: nextXp,
        rank: nextRank,
        stats: {
          totalMatches: Number(user?.stats?.totalMatches || 0) + 1,
          wins: Number(user?.stats?.wins || 0) + (won ? 1 : 0),
          losses: Number(user?.stats?.losses || 0) + (!won && !draw ? 1 : 0),
          draws: Number(user?.stats?.draws || 0) + (draw ? 1 : 0),
          syllogismMatches: nextMatches,
          syllogismWins: nextWins,
          syllogismAccuracy: nextAccuracy,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      rewardRef,
      {
        roomId: String(roomId),
        uid: String(uid),
        won: Boolean(won),
        draw: Boolean(draw),
        coinsDelta: Number(coinsDelta || 0),
        xpDelta: Number(xpDelta || 0),
        baseXpDelta: Number(baseXp || 0),
        baseCoinsDelta: Number(baseCoins || 0),
        bonusXpDelta: Number(bonusXp || 0),
        bonusCoinsDelta: Number(bonusCoins || 0),
        performanceBreakdown: Array.isArray(performanceBreakdown) ? performanceBreakdown : [],
        coinsAfter: nextCoins,
        xpAfter: nextXp,
        rankAfter: nextRank,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { rewarded: true, xp: nextXp, rank: nextRank, coins: nextCoins };
  });
}
