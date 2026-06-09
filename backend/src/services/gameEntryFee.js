import { GAME_KEYS } from '../../../shared/gameConfig/constants.js';
import { getGameEntryFee } from './gameConfigService.js';
import * as userFirestoreAdmin from './userFirestoreAdmin.js';

export { GAME_KEYS };

/**
 * @param {string} gameKey
 */
export async function resolveGameEntryFee(gameKey) {
  return getGameEntryFee(gameKey);
}

/**
 * Server-authoritative entry fee deduction before a match / queue ticket.
 * @param {string} uid
 * @param {string} gameKey
 * @param {{ variantKey?: string }} [opts] — trivia category or enigma mode
 * @returns {Promise<{ ok: boolean, userId?: string, entryFee: number, error?: string }>}
 */
export async function tryDeductGameEntryFee(uid, gameKey, opts = {}) {
  const variantKey = opts?.variantKey ? String(opts.variantKey) : null;
  const entryFee = await getGameEntryFee(gameKey, variantKey);
  if (!uid) {
    return { ok: false, error: 'Unauthorized user', entryFee };
  }
  if (entryFee <= 0) {
    return { ok: true, userId: uid, entryFee: 0 };
  }
  try {
    await userFirestoreAdmin.ensureUserDocAdmin(uid, {});
    await userFirestoreAdmin.deductCoins(uid, entryFee);
    return { ok: true, userId: uid, entryFee };
  } catch (e) {
    const msg =
      e?.message === 'INSUFFICIENT_COINS' ? 'Insufficient coins' : e?.message || 'Insufficient coins';
    return { ok: false, error: msg, entryFee };
  }
}

/**
 * @param {string} uid
 * @param {number} entryFee
 */
export async function refundGameEntryFee(uid, entryFee, logTag = 'entryFee') {
  const fee = Math.floor(Number(entryFee) || 0);
  if (!uid || fee <= 0) return;
  try {
    await userFirestoreAdmin.addCoins(uid, fee);
  } catch (e) {
    console.error(`[${logTag}] refund failed:`, e?.message || e);
  }
}

/**
 * @param {Record<string, number>} entryFeeByUid
 * @param {string} [logTag]
 */
export async function refundAllGameEntryFees(entryFeeByUid = {}, logTag = 'entryFee') {
  const entries = Object.entries(entryFeeByUid || {});
  await Promise.all(
    entries.map(([uid, fee]) => refundGameEntryFee(uid, fee, logTag))
  );
}
