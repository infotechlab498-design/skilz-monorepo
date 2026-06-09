const { FieldValue } = require('firebase-admin/firestore');

const PLATFORM_CONFIG_COLLECTION = 'platform_config';
const GAME_ECONOMY_DOC_ID = 'game_economy';
const DEFAULT_ENTRY_FEE = 10;
const CACHE_TTL_MS = 60_000;

/** @type {{ expiresAt: number, fees: Record<string, number> | null }} */
const cache = { expiresAt: 0, fees: null };

function normalizeGameKey(gameKey) {
  const normalized = String(gameKey || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const aliases = {
    mathrush: 'math_rush',
    enigmapulse: 'enigma_pulse',
    enigma: 'enigma_pulse',
  };
  return aliases[normalized] || normalized;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function loadFeeMap(db) {
  if (Date.now() < cache.expiresAt && cache.fees) {
    return cache.fees;
  }
  const fees = { default: DEFAULT_ENTRY_FEE };
  try {
    const snap = await db.collection(PLATFORM_CONFIG_COLLECTION).doc(GAME_ECONOMY_DOC_ID).get();
    const games = snap.exists ? snap.data()?.games : null;
    const globalDefault = snap.exists ? Number(snap.data()?.global?.defaultEntryFee) : NaN;
    if (Number.isFinite(globalDefault) && globalDefault >= 0) {
      fees.default = Math.floor(globalDefault);
    }
    if (games && typeof games === 'object') {
      for (const [key, slice] of Object.entries(games)) {
        const fee = Number(slice?.entryFee);
        if (Number.isFinite(fee) && fee >= 0) fees[key] = Math.floor(fee);
      }
    }
  } catch {
    /* use defaults */
  }
  cache.expiresAt = Date.now() + CACHE_TTL_MS;
  cache.fees = fees;
  return fees;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} gameKey
 */
async function getGameEntryFee(db, gameKey) {
  const fees = await loadFeeMap(db);
  const key = normalizeGameKey(gameKey);
  const fee = fees[key];
  if (Number.isFinite(fee) && fee >= 0) return fee;
  return fees.default;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} uid
 * @param {string} gameKey
 */
async function tryDeductGameEntryFee(db, uid, gameKey) {
  const entryFee = await getGameEntryFee(db, gameKey);
  if (!uid) {
    return { ok: false, error: 'Unauthorized user', entryFee };
  }
  if (entryFee <= 0) {
    return { ok: true, userId: uid, entryFee: 0 };
  }
  const ref = db.collection('users').doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('USER_NOT_FOUND');
      const coins = Number(snap.data()?.coins ?? 0);
      if (coins < entryFee) throw new Error('INSUFFICIENT_COINS');
      tx.set(
        ref,
        { coins: FieldValue.increment(-entryFee), updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    });
    return { ok: true, userId: uid, entryFee };
  } catch (e) {
    const msg =
      e?.message === 'INSUFFICIENT_COINS' ? 'Insufficient coins' : e?.message || 'Insufficient coins';
    return { ok: false, error: msg, entryFee };
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} uid
 * @param {number} entryFee
 */
async function refundGameEntryFee(db, uid, entryFee) {
  const fee = Math.floor(Number(entryFee) || 0);
  if (!uid || fee <= 0) return;
  const ref = db.collection('users').doc(uid);
  await ref
    .set(
      { coins: FieldValue.increment(fee), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    .catch(() => {});
}

function clearGameEntryFeeCache() {
  cache.expiresAt = 0;
  cache.fees = null;
}

module.exports = {
  getGameEntryFee,
  tryDeductGameEntryFee,
  refundGameEntryFee,
  clearGameEntryFeeCache,
};
