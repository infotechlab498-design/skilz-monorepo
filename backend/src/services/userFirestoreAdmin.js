import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin.js';
import {
  DEFAULT_USER_GAMES,
  DEFAULT_USER_STATS,
  DEFAULT_USER_STATS_EXTRA,
} from '../../../frontend/src/constants/userProfileDefaults.js';

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

export function utcYesterday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Derive display level from total XP (single formula for server updates). */
export function levelFromXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return Math.max(1, 1 + Math.floor(x / 1000));
}

function assertAdmin() {
  const adb = getAdminFirestore();
  if (!adb) {
    const err = new Error('FIRESTORE_ADMIN_UNAVAILABLE');
    err.code = 'FIRESTORE_ADMIN_UNAVAILABLE';
    throw err;
  }
  return adb;
}

/**
 * @param {Record<string, unknown>} d
 * @returns {{ dailyStreak: number, dailyStreakBest: number, lastPlayedDate: string }}
 */
export function computeStreakFromDoc(d) {
  const last = d.lastPlayedDate || '';
  const today = utcToday();
  const yest = utcYesterday();
  let dailyStreak = Number(d.dailyStreak ?? d.stats?.dailyStreak ?? 0);
  let dailyStreakBest = Number(d.stats?.dailyStreakBest ?? dailyStreak);
  if (last !== today) {
    if (last === yest) dailyStreak += 1;
    else dailyStreak = 1;
    if (dailyStreak > dailyStreakBest) dailyStreakBest = dailyStreak;
  }
  return { dailyStreak, dailyStreakBest, lastPlayedDate: today };
}

/**
 * @param {string} uid
 * @param {number} amount
 */
export async function addCoins(uid, amount) {
  const adb = assertAdmin();
  const n = Math.floor(Number(amount) || 0);
  if (!uid || n <= 0) throw new Error('INVALID_ARGS');
  const ref = adb.collection('users').doc(uid);
  await adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error('USER_NOT_FOUND');
    t.set(
      ref,
      {
        coins: FieldValue.increment(n),
        earnedCoins: FieldValue.increment(n),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  const after = await ref.get();
  return after.data();
}

/**
 * @param {string} uid
 * @param {number} amount
 */
export async function deductCoins(uid, amount) {
  const adb = assertAdmin();
  const n = Math.floor(Number(amount) || 0);
  if (!uid || n <= 0) throw new Error('INVALID_ARGS');
  const ref = adb.collection('users').doc(uid);
  await adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error('USER_NOT_FOUND');
    const coins = Number(snap.data()?.coins ?? 0);
    if (coins < n) throw new Error('INSUFFICIENT_COINS');
    t.set(
      ref,
      {
        coins: FieldValue.increment(-n),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  const after = await ref.get();
  return after.data();
}

/**
 * @param {string} uid
 * @param {number} amount
 */
export async function addXP(uid, amount) {
  const adb = assertAdmin();
  const n = Math.floor(Number(amount) || 0);
  if (!uid || n <= 0) throw new Error('INVALID_ARGS');
  const ref = adb.collection('users').doc(uid);
  await adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error('USER_NOT_FOUND');
    const prev = Number(snap.data()?.xp ?? 0);
    const level = levelFromXp(prev + n);
    t.set(
      ref,
      {
        xp: FieldValue.increment(n),
        level,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  const after = await ref.get();
  return after.data();
}

/**
 * Bump daily streak using same rules as Ludo sync (play counted for “today”).
 * @param {string} uid
 */
export async function updateDailyStreak(uid) {
  const adb = assertAdmin();
  if (!uid) throw new Error('INVALID_ARGS');
  const ref = adb.collection('users').doc(uid);
  let streak = 0;
  await adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error('USER_NOT_FOUND');
    const d = snap.data() || {};
    const { dailyStreak, dailyStreakBest, lastPlayedDate } = computeStreakFromDoc(d);
    streak = dailyStreak;
    t.set(
      ref,
      {
        lastPlayedDate,
        dailyStreak,
        'stats.dailyStreakBest': dailyStreakBest,
        lastLogin: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  const after = await ref.get();
  return { ...after.data(), dailyStreak: streak };
}

/**
 * Canonical player stats updater used by server-side game flows.
 * Keeps wallet/xp/global stats/game stats updates in one transaction path.
 * @param {{
 *  uid: string,
 *  coinsDelta?: number,
 *  xpDelta?: number,
 *  winsDelta?: number,
 *  lossesDelta?: number,
 *  matchesDelta?: number,
 *  gameKey?: 'ludo' | 'trivia' | 'mathRush',
 *  gameMatchesDelta?: number,
 *  gameWinsDelta?: number,
 *  touchStreak?: boolean,
 *  monthlyKey?: string,
 *  monthlyWinsDelta?: number,
 *  monthlyChallengesDelta?: number,
 *  increments?: Record<string, number>,
 *  patch?: Record<string, unknown>,
 * }} args
 */
export async function updatePlayerStatsCanonical(args) {
  const adb = assertAdmin();
  const uid = String(args?.uid || '');
  if (!uid) throw new Error('INVALID_ARGS');
  const ref = adb.collection('users').doc(uid);

  const coinsDelta = Math.trunc(Number(args?.coinsDelta) || 0);
  const xpDelta = Math.max(0, Math.trunc(Number(args?.xpDelta) || 0));
  const winsDelta = Math.max(0, Math.trunc(Number(args?.winsDelta) || 0));
  const lossesDelta = Math.max(0, Math.trunc(Number(args?.lossesDelta) || 0));
  const matchesDelta = Math.max(0, Math.trunc(Number(args?.matchesDelta) || 0));
  const gameMatchesDelta = Math.max(0, Math.trunc(Number(args?.gameMatchesDelta) || 0));
  const gameWinsDelta = Math.max(0, Math.trunc(Number(args?.gameWinsDelta) || 0));
  const monthlyWinsDelta = Math.max(0, Math.trunc(Number(args?.monthlyWinsDelta) || 0));
  const monthlyChallengesDelta = Math.max(0, Math.trunc(Number(args?.monthlyChallengesDelta) || 0));
  const increments = args?.increments && typeof args.increments === 'object' ? args.increments : {};
  const gameKey = args?.gameKey;
  const touchStreak = Boolean(args?.touchStreak);
  const monthlyKey = String(args?.monthlyKey || '');
  const patch = args?.patch && typeof args.patch === 'object' ? args.patch : {};

  await adb.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error('USER_NOT_FOUND');
    const d = snap.data() || {};
    const currentCoins = Number(d.coins || 0);
    if (currentCoins + coinsDelta < 0) throw new Error('INSUFFICIENT_COINS');

    /** @type {Record<string, unknown>} */
    const writePatch = { updatedAt: FieldValue.serverTimestamp(), ...patch };
    if (coinsDelta) writePatch.coins = FieldValue.increment(coinsDelta);
    if (xpDelta) {
      writePatch.xp = FieldValue.increment(xpDelta);
      writePatch.level = levelFromXp((Number(d.xp) || 0) + xpDelta);
    }
    if (winsDelta) writePatch['stats.wins'] = FieldValue.increment(winsDelta);
    if (lossesDelta) writePatch['stats.losses'] = FieldValue.increment(lossesDelta);
    if (matchesDelta) writePatch['stats.totalMatches'] = FieldValue.increment(matchesDelta);
    if (gameKey && gameMatchesDelta) writePatch[`games.${gameKey}.matches`] = FieldValue.increment(gameMatchesDelta);
    if (gameKey && gameWinsDelta) writePatch[`games.${gameKey}.wins`] = FieldValue.increment(gameWinsDelta);
    if (monthlyKey && monthlyWinsDelta) writePatch[`monthlyGameStats.${monthlyKey}.wins`] = FieldValue.increment(monthlyWinsDelta);
    if (monthlyKey && monthlyChallengesDelta) writePatch[`monthlyGameStats.${monthlyKey}.challenges`] = FieldValue.increment(monthlyChallengesDelta);
    for (const [k, v] of Object.entries(increments)) {
      const inc = Math.trunc(Number(v) || 0);
      if (inc) writePatch[k] = FieldValue.increment(inc);
    }

    if (touchStreak) {
      const { dailyStreak, dailyStreakBest, lastPlayedDate } = computeStreakFromDoc(d);
      writePatch.lastPlayedDate = lastPlayedDate;
      writePatch.dailyStreak = dailyStreak;
      writePatch['stats.dailyStreakBest'] = dailyStreakBest;
      writePatch.lastLogin = FieldValue.serverTimestamp();
    }

    t.set(ref, writePatch, { merge: true });
  });

  const after = await ref.get();
  return after.data();
}

/**
 * @param {{
 *   uid: string,
 *   gameKey: 'ludo' | 'trivia' | 'mathRush',
 *   won?: boolean,
 *   matches?: number,
 *   wins?: number,
 *   xp?: number,
 *   bestScore?: number,
 *   accuracy?: number,
 *   globalStats?: { totalMatches?: number, wins?: number, losses?: number, accuracy?: number, avgMovePaceMs?: number }
 * }} p
 */
export async function recordGameOutcome(p) {
  const { uid, gameKey } = p;
  if (!uid || !gameKey) throw new Error('INVALID_ARGS');
  const valid = ['ludo', 'trivia', 'mathRush'];
  if (!valid.includes(gameKey)) throw new Error('INVALID_GAME');
  const m = Math.floor(Number(p.matches) || 0) || 1;
  const wInc = p.won ? Math.floor(Number(p.wins) || 0) || 1 : 0;
  const xpInc = Math.floor(Number(p.xp) || 0);
  const best = p.bestScore != null ? Number(p.bestScore) : null;
  const accDelta = p.accuracy != null ? Number(p.accuracy) : null;

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (gameKey === 'ludo' || gameKey === 'mathRush') {
    if (xpInc > 0) patch[`games.${gameKey}.xp`] = FieldValue.increment(xpInc);
  }
  if (gameKey === 'trivia' && accDelta != null && !Number.isNaN(accDelta)) {
    patch[`games.${gameKey}.accuracy`] = FieldValue.increment(accDelta);
  }
  if (gameKey === 'mathRush' && best != null && !Number.isNaN(best)) {
    patch['games.mathRush.bestScore'] = best;
  }
  const gs = p.globalStats;
  if (gs?.accuracy != null && !Number.isNaN(Number(gs.accuracy))) {
    patch['stats.accuracy'] = FieldValue.increment(Number(gs.accuracy));
  }
  if (gs?.avgMovePaceMs != null && !Number.isNaN(Number(gs.avgMovePaceMs))) {
    patch['stats.avgMoveSpeedMs'] = FieldValue.increment(Number(gs.avgMovePaceMs));
  }

  return updatePlayerStatsCanonical({
    uid,
    xpDelta: xpInc > 0 ? xpInc : 0,
    winsDelta: Number(gs?.wins) || 0,
    lossesDelta: Number(gs?.losses) || 0,
    matchesDelta: Number(gs?.totalMatches) || 0,
    gameKey,
    gameMatchesDelta: m,
    gameWinsDelta: (gameKey === 'ludo' || gameKey === 'trivia') ? wInc : 0,
    patch,
  });
}

/**
 * Read `users/{uid}` for API responses (no password).
 * @param {string} uid
 */
export async function getUserDocumentPublic(uid) {
  const adb = getAdminFirestore();
  if (!adb) {
    const err = new Error('FIRESTORE_ADMIN_UNAVAILABLE');
    err.code = 'FIRESTORE_ADMIN_UNAVAILABLE';
    throw err;
  }
  const id = String(uid || '').trim();
  if (!id) throw new Error('INVALID_ARGS');
  const snap = await adb.collection('users').doc(id).get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  const d = { ...snap.data() };
  delete d.password;
  return d;
}

/**
 * Ensure `users/{uid}` exists with full default shape (Admin only, e.g. server bootstrap).
 * @param {string} uid
 * @param {{ email?: string, displayName?: string }} [identity]
 */
export async function ensureUserDocAdmin(uid, identity = {}) {
  const adb = assertAdmin();
  if (!uid) throw new Error('INVALID_ARGS');
  const ref = adb.collection('users').doc(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data();
  const games = JSON.parse(JSON.stringify(DEFAULT_USER_GAMES));
  await ref.set(
    {
      uid,
      email: identity.email || '',
      displayName: identity.displayName || '',
      username: '',
      // Signup bonus (server-authoritative).
      coins: 200,
      earnedCoins: 200,
      xp: 0,
      level: 1,
      dailyStreak: 0,
      lastPlayedDate: '',
      stats: { ...DEFAULT_USER_STATS, ...DEFAULT_USER_STATS_EXTRA },
      games,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const after = await ref.get();
  return after.data();
}
