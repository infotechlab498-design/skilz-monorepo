const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function runAddTransaction(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const amountSpent = Number(request.data?.amountSpent);
  const coinsEarned = Number(request.data?.coinsEarned);
  const receiptId = String(request.data?.receiptId || '').trim().slice(0, 128);
  const paymentMethod = String(request.data?.paymentMethod || 'unknown').trim().slice(0, 64);
  if (!paymentMethod || !Number.isFinite(amountSpent) || !Number.isFinite(coinsEarned)) {
    throw new HttpsError('invalid-argument', 'paymentMethod, amountSpent and coinsEarned are required.');
  }
  if (amountSpent <= 0 || amountSpent > 100000 || coinsEarned <= 0 || coinsEarned > 1000000) {
    throw new HttpsError('invalid-argument', 'Invalid transaction bounds.');
  }
  if (coinsEarned > amountSpent * 200) {
    logger.warn('addTransaction anomaly_rejected', { uid, amountSpent, coinsEarned });
    throw new HttpsError('invalid-argument', 'Suspicious reward conversion rejected.');
  }
  if (!receiptId) {
    throw new HttpsError('failed-precondition', 'receiptId is required until webhook verification is integrated.');
  }

  try {
    logger.info('addTransaction start', { uid, amountSpent, coinsEarned, paymentMethod });
    const batch = db.batch();
    const tRef = db.collection('transactions').doc(receiptId);
    const existing = await tRef.get();
    if (existing.exists && existing.data()?.userId === uid) {
      logger.info('addTransaction idempotent hit', { uid, receiptId });
      return { transactionId: receiptId, idempotent: true };
    }
    batch.set(tRef, {
      userId: uid,
      amountSpent,
      coinsEarned,
      receiptId,
      paymentMethod,
      date: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    const sRef = db.collection('stats').doc(uid);
    batch.set(
      sRef,
      {
        userId: uid,
        totalSpent: FieldValue.increment(amountSpent),
        totalCoins: FieldValue.increment(coinsEarned),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
    logger.info('addTransaction success', { uid, transactionId: tRef.id });
    return { transactionId: tRef.id };
  } catch (e) {
    logger.error('addTransaction failed', { uid, err: e?.message });
    throw new HttpsError('internal', e?.message || 'Transaction failed.');
  }
}

module.exports = { runAddTransaction };
