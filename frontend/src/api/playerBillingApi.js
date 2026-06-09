/**
 * Firestore billing model (aligns with `users/{uid}` from auth):
 *
 * - `cards/{cardId}` — userId, cardHolderName, last4, expiryDate, cardType, createdAt, updatedAt?
 * - `transactions/{txId}` — userId, amountSpent, coinsEarned, paymentMethod, date, createdAt
 * - `stats/{userId}` — userId, totalSpent, totalCoins, updatedAt (aggregates; updated by addTransaction)
 *
 * Rules: restrict reads/writes with request.auth.uid == resource.data.userId (or path userId for stats).
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { toSerializableFirebase } from '../services/userService.js';
import { callAddTransaction, callGetPlayerBilling } from './cloudFunctionsApi.js';

/** @typedef {{ id: string, userId: string, cardHolderName: string, last4: string, expiryDate: string, cardType: string, createdAt?: number, updatedAt?: number }} BillingCardRecord */
/** @typedef {{ id: string, userId: string, amountSpent: number, coinsEarned: number, paymentMethod: string, date?: number, createdAt?: number }} BillingTransactionRecord */
/** @typedef {{ userId: string, totalSpent: number, totalCoins: number, updatedAt?: number }} BillingStatsRecord */

const COL_CARDS = 'cards';

/**
 * Display mask — only last4 is stored in Firestore (never full PAN).
 * @param {string} last4
 */
export function formatMaskedCard(last4) {
  const d = String(last4 || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `**** **** **** ${d}`;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function extractLast4(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(-4) || '0000';
}

/**
 * @param {{ userId: string, cardHolderName: string, cardNumber: string, expiryDate: string, cardType: string }} data
 * @returns {Promise<string>} new card doc id
 */
export async function addCard(data) {
  const userId = String(data?.userId || '');
  if (!userId) throw new Error('Missing userId');
  const last4 = extractLast4(data.cardNumber);
  const ref = await addDoc(collection(db, COL_CARDS), {
    userId,
    cardHolderName: String(data.cardHolderName || '').trim(),
    last4,
    expiryDate: String(data.expiryDate || '').trim(),
    cardType: String(data.cardType || 'Classic').trim(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * @param {string} userId
 * @returns {Promise<BillingCardRecord[]>}
 */
export async function getCards(userId) {
  const uid = String(userId || '');
  if (!uid) return [];
  const q = query(collection(db, COL_CARDS), where('userId', '==', uid));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) =>
    toSerializableFirebase({ id: d.id, ...d.data() })
  );
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

/**
 * @param {string} cardId
 * @param {{ cardHolderName?: string, cardNumber?: string, expiryDate?: string, cardType?: string }} data
 * @param {string} userId
 */
export async function updateCard(cardId, data, userId) {
  const id = String(cardId || '');
  const uid = String(userId || '');
  if (!id || !uid) throw new Error('Missing cardId or userId');
  const ref = doc(db, COL_CARDS, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Card not found');
  if (String(snap.data().userId) !== uid) throw new Error('Unauthorized');
  /** @type {Record<string, unknown>} */
  const updates = { updatedAt: serverTimestamp() };
  if (data.cardHolderName != null) updates.cardHolderName = String(data.cardHolderName).trim();
  if (data.expiryDate != null) updates.expiryDate = String(data.expiryDate).trim();
  if (data.cardType != null) updates.cardType = String(data.cardType).trim();
  if (data.cardNumber != null && String(data.cardNumber).replace(/\D/g, '').length >= 4) {
    updates.last4 = extractLast4(data.cardNumber);
  }
  await updateDoc(ref, updates);
}

/**
 * Loads transactions + billing stats in one Cloud Function round-trip.
 * @param {string} userId
 * @returns {Promise<{ transactions: BillingTransactionRecord[], stats: BillingStatsRecord }>}
 */
export async function getBillingSnapshot(userId) {
  const uid = String(userId || '');
  if (!uid) {
    return {
      transactions: [],
      stats: { userId: '', totalSpent: 0, totalCoins: 0 },
    };
  }
  const data = await callGetPlayerBilling();
  const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  const st = data?.stats || {};
  return {
    transactions,
    stats: {
      userId: uid,
      totalSpent: Number(st.totalSpent) || 0,
      totalCoins: Number(st.totalCoins) || 0,
      updatedAt: st.updatedAt,
    },
  };
}

/**
 * @param {string} userId
 * @returns {Promise<BillingTransactionRecord[]>}
 */
export async function getTransactions(userId) {
  const { transactions } = await getBillingSnapshot(userId);
  return transactions;
}

/**
 * Creates a transaction row and increments aggregate stats (Cloud Function; uid from auth).
 * @param {{ userId: string, amountSpent: number, coinsEarned: number, paymentMethod: string }} data
 * @returns {Promise<string>}
 */
export async function addTransaction(data) {
  void data.userId;
  const amountSpent = Number(data.amountSpent) || 0;
  const coinsEarned = Number(data.coinsEarned) || 0;
  const paymentMethod = String(data.paymentMethod || '').trim();
  const out = await callAddTransaction({ amountSpent, coinsEarned, paymentMethod });
  return String(out?.transactionId || '');
}

/**
 * @param {string} userId
 * @returns {Promise<BillingStatsRecord>}
 */
export async function getStats(userId) {
  const { stats } = await getBillingSnapshot(userId);
  return stats;
}

/**
 * Sets aggregate stats (absolute values). Client writes are disabled; use Admin or a callable.
 * @param {{ userId: string, totalSpent?: number, totalCoins?: number }} data
 */
export async function updateStats(data) {
  void data;
  throw new Error('updateStats is server-only. Use a Cloud Function or Firebase Console.');
}
