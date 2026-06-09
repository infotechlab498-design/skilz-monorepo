/**
 * Ludo entry fees and rewards — Firestore wallet only (no users.json).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../firebaseAdmin.js';
import * as userFirestoreAdmin from '../userFirestoreAdmin.js';
import { ludoRankPrizeCoins } from '../../game-engine/services/ludoEconomy.js';

const LUDO_WALLET_RECEIPTS_COLLECTION = 'ludoWalletReceipts';

function receiptRef(adb, receiptKey) {
  return adb.collection(LUDO_WALLET_RECEIPTS_COLLECTION).doc(String(receiptKey || ''));
}

/**
 * @param {string} uid
 * @param {number} entryFee
 * @param {{ receiptKey?: string, source?: string, meta?: Record<string, unknown> }} [options]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function tryDeductEntryFee(uid, entryFee, options = {}) {
  const adb = getAdminFirestore();
  if (!adb) {
    return { ok: false, error: 'Game storage unavailable (Firestore Admin not configured).' };
  }
  if (!uid) return { ok: false, error: 'User not authenticated!' };
  const fee = Math.floor(Number(entryFee) || 0);
  if (fee <= 0) return { ok: true };
  const receiptKey = String(options.receiptKey || '').trim();
  const source = String(options.source || 'unknown').trim() || 'unknown';
  const meta =
    options.meta && typeof options.meta === 'object' && !Array.isArray(options.meta)
      ? options.meta
      : {};

  const uref = adb.collection('users').doc(uid);
  try {
    if (!receiptKey) {
      const snap = await uref.get();
      if (!snap.exists) {
        return {
          ok: false,
          error: 'User profile not found in Firestore. Complete registration before playing.',
        };
      }
      await userFirestoreAdmin.deductCoins(uid, fee);
      return { ok: true };
    }

    const rref = receiptRef(adb, receiptKey);
    await adb.runTransaction(async (t) => {
      const [userSnap, receiptSnap] = await Promise.all([t.get(uref), t.get(rref)]);
      if (receiptSnap.exists) {
        const receipt = receiptSnap.data() || {};
        if (receipt.status === 'charged' || receipt.status === 'settled') {
          return;
        }
        if (receipt.status === 'refunded') {
          throw new Error('RECEIPT_ALREADY_REFUNDED');
        }
      }
      if (!userSnap.exists) {
        throw new Error(
          'User profile not found in Firestore. Complete registration before playing.'
        );
      }
      const coins = Number(userSnap.data()?.coins ?? 0);
      if (coins < fee) throw new Error('INSUFFICIENT_COINS');
      t.set(
        uref,
        {
          coins: FieldValue.increment(-fee),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      t.set(
        rref,
        {
          uid,
          amount: fee,
          source,
          status: 'charged',
          refundedAt: null,
          refundReason: null,
          meta,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg.includes('INSUFFICIENT') || msg === 'INSUFFICIENT_COINS') {
      return { ok: false, error: 'Insufficient coins!' };
    }
    if (msg === 'RECEIPT_ALREADY_REFUNDED') {
      return { ok: false, error: 'Entry fee receipt was already refunded.' };
    }
    return { ok: false, error: msg || 'Wallet error' };
  }
  return { ok: true, receiptKey };
}

/**
 * @param {string} uid
 * @param {number} entryFee
 * @param {{ receiptKey?: string, reason?: string, meta?: Record<string, unknown> }} [options]
 * @returns {Promise<{ ok: boolean, error?: string, duplicate?: boolean }>}
 */
export async function refundEntryFee(uid, entryFee, options = {}) {
  const adb = getAdminFirestore();
  if (!adb) {
    return { ok: false, error: 'Game storage unavailable (Firestore Admin not configured).' };
  }
  const fee = Math.floor(Number(entryFee) || 0);
  const receiptKey = String(options.receiptKey || '').trim();
  const reason = String(options.reason || 'unknown').trim() || 'unknown';
  const meta =
    options.meta && typeof options.meta === 'object' && !Array.isArray(options.meta)
      ? options.meta
      : {};
  if (!uid || fee <= 0 || !receiptKey) return { ok: false, error: 'INVALID_ARGS' };

  const uref = adb.collection('users').doc(uid);
  const rref = receiptRef(adb, receiptKey);
  try {
    await adb.runTransaction(async (t) => {
      const [userSnap, receiptSnap] = await Promise.all([t.get(uref), t.get(rref)]);
      if (!receiptSnap.exists) throw new Error('RECEIPT_NOT_FOUND');
      const receipt = receiptSnap.data() || {};
      if (String(receipt.uid || '') !== String(uid)) throw new Error('RECEIPT_UID_MISMATCH');
      if (receipt.status === 'refunded') return;
      if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
      t.set(
        uref,
        {
          coins: FieldValue.increment(fee),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      t.set(
        rref,
        {
          status: 'refunded',
          refundedAt: FieldValue.serverTimestamp(),
          refundReason: reason,
          refundMeta: meta,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg === 'RECEIPT_NOT_FOUND') return { ok: false, error: msg };
    if (msg === 'RECEIPT_UID_MISMATCH') return { ok: false, error: msg };
    return { ok: false, error: msg };
  }
  return { ok: true };
}

/**
 * @param {string} receiptKey
 * @param {Record<string, unknown>} [meta]
 */
export async function settleEntryReceipt(receiptKey, meta = {}) {
  const adb = getAdminFirestore();
  const key = String(receiptKey || '').trim();
  if (!adb || !key) return;
  try {
    await receiptRef(adb, key).set(
      {
        status: 'settled',
        settlementMeta: meta,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error('[Ludo] settleEntryReceipt:', e?.message || e);
  }
}

/**
 * @param {string} uid
 * @param {number} prize
 */
export async function awardLudoPrizeCoins(uid, prize) {
  const n = Math.floor(Number(prize) || 0);
  if (!uid || n <= 0) return;
  try {
    await userFirestoreAdmin.addCoins(uid, n);
  } catch (e) {
    console.error('[Ludo] awardLudoPrizeCoins:', e?.message || e);
  }
}

/**
 * @param {string} uid
 * @param {number} xp
 */
export async function awardLudoXp(uid, xp) {
  const n = Math.floor(Number(xp) || 0);
  if (!uid || n <= 0) return;
  try {
    await userFirestoreAdmin.addXP(uid, n);
  } catch (e) {
    console.error('[Ludo] awardLudoXp:', e?.message || e);
  }
}

/** @param {string} uid */
export async function getUserWallet(uid) {
  const adb = getAdminFirestore();
  if (!adb || !uid) throw new Error('INVALID_ARGS');
  const snap = await adb.collection('users').doc(uid).get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  const d = snap.data() || {};
  return {
    uid,
    coins: Number(d.coins || 0),
    xp: Number(d.xp || 0),
    level: Number(d.level || 1),
    updatedAt: d.updatedAt || null,
  };
}

/**
 * Server-authoritative wallet credit with reason annotation in logs.
 * @param {string} uid
 * @param {number} amount
 * @param {string} [reason]
 */
export async function addCoins(uid, amount, reason = 'unknown') {
  const n = Math.floor(Number(amount) || 0);
  if (!uid || n <= 0) throw new Error('INVALID_ARGS');
  const out = await userFirestoreAdmin.addCoins(uid, n);
  return { ...out, reason, coinsDelta: n };
}

/**
 * Server-authoritative wallet debit with reason annotation in logs.
 * @param {string} uid
 * @param {number} amount
 * @param {string} [reason]
 */
export async function deductCoins(uid, amount, reason = 'unknown') {
  const n = Math.floor(Number(amount) || 0);
  if (!uid || n <= 0) throw new Error('INVALID_ARGS');
  const out = await userFirestoreAdmin.deductCoins(uid, n);
  return { ...out, reason, coinsDelta: -n };
}

/**
 * Rank-based pooled payout distribution.
 * @param {object} roomState
 */
export async function distributeMatchRewards(roomState) {
  if (!roomState || typeof roomState !== 'object') return [];
  const winners = Array.isArray(roomState.winners) ? roomState.winners : [];
  const entryFee = Number(roomState.meta?.entryFee ?? roomState.lobby?.entryFee ?? 10) || 10;
  const payouts = [];
  let rankIdx = 0;
  for (const row of winners) {
    rankIdx += 1;
    const uid = typeof row === 'string'
      ? String(roomState.players?.[row]?.id || '')
      : String(row?.playerId || roomState.players?.[row?.color || '']?.id || '');
    if (!uid || uid.startsWith('bot_')) continue;
    const prize = ludoRankPrizeCoins(rankIdx, entryFee);
    if (prize > 0) {
      await addCoins(uid, prize, `ludo_rank_${rankIdx}`);
      payouts.push({ uid, rank: rankIdx, prize });
    }
  }
  return payouts;
}
