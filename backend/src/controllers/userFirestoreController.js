import * as userFirestoreAdmin from '../services/userFirestoreAdmin.js';

function adminError(res, err) {
  if (err?.code === 'FIRESTORE_ADMIN_UNAVAILABLE' || err?.message === 'FIRESTORE_ADMIN_UNAVAILABLE') {
    return res.status(503).json({
      success: false,
      error: 'Firestore admin is not configured (set FIREBASE_SERVICE_ACCOUNT_PATH)',
    });
  }
  if (err?.message === 'USER_NOT_FOUND') {
    return res.status(404).json({ success: false, error: 'User profile not found in Firestore' });
  }
  if (err?.message === 'INSUFFICIENT_COINS') {
    return res.status(400).json({ success: false, error: 'Insufficient coins' });
  }
  if (err?.message === 'INVALID_ARGS' || err?.message === 'INVALID_GAME') {
    return res.status(400).json({ success: false, error: err.message });
  }
  console.error('[userFirestoreController]', err);
  return res.status(500).json({ success: false, error: err?.message || 'Server error' });
}

export async function postAddCoins(req, res) {
  try {
    const uid = req.userId;
    const amount = req.body?.amount;
    const data = await userFirestoreAdmin.addCoins(uid, amount);
    return res.json({ success: true, user: data });
  } catch (e) {
    return adminError(res, e);
  }
}

export async function postDeductCoins(req, res) {
  try {
    const uid = req.userId;
    const amount = req.body?.amount;
    const data = await userFirestoreAdmin.deductCoins(uid, amount);
    return res.json({ success: true, user: data });
  } catch (e) {
    return adminError(res, e);
  }
}

export async function postAddXp(req, res) {
  try {
    const uid = req.userId;
    const amount = req.body?.amount;
    const data = await userFirestoreAdmin.addXP(uid, amount);
    return res.json({ success: true, user: data });
  } catch (e) {
    return adminError(res, e);
  }
}

export async function postUpdateStreak(req, res) {
  try {
    const uid = req.userId;
    const data = await userFirestoreAdmin.updateDailyStreak(uid);
    return res.json({ success: true, user: data });
  } catch (e) {
    return adminError(res, e);
  }
}

export async function postGameOutcome(req, res) {
  try {
    const uid = req.userId;
    const {
      gameKey,
      won,
      matches,
      wins,
      xp,
      bestScore,
      accuracy,
      globalStats,
    } = req.body || {};
    const data = await userFirestoreAdmin.recordGameOutcome({
      uid,
      gameKey,
      won: Boolean(won),
      matches,
      wins,
      xp,
      bestScore,
      accuracy,
      globalStats,
    });
    return res.json({ success: true, user: data });
  } catch (e) {
    return adminError(res, e);
  }
}
