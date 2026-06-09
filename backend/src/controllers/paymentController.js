import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { uploadPaymentScreenshotBuffer } from '../services/cloudinaryService.js';

const VALID_METHODS = new Set(['jazzcash', 'easypaisa', 'bank']);

function firestoreRequired() {
  const firestore = getAdminFirestore();
  if (!firestore) throw createHttpError(503, 'Firestore Admin is not configured');
  return firestore;
}

export async function uploadScreenshot(req, res, next) {
  try {
    const uid = String(req.userId || '').trim();
    if (!uid) throw createHttpError(401, 'Unauthorized');
    if (!req.file?.buffer) throw createHttpError(400, 'Screenshot image is required');

    const orderId = String(req.body?.orderId || `order_${Date.now()}`).trim();
    const uploaded = await uploadPaymentScreenshotBuffer({
      fileBuffer: req.file.buffer,
      uid,
      orderId,
    });
    const url = String(uploaded?.secure_url || '').trim();
    if (!url) throw createHttpError(502, 'Cloudinary upload failed');

    return res.json({
      success: true,
      screenshotUrl: url,
      publicId: String(uploaded?.public_id || ''),
    });
  } catch (error) {
    return next(error);
  }
}

export async function createPaymentRequest(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const userId = String(req.userId || '').trim();
    if (!userId) throw createHttpError(401, 'Unauthorized');

    const coinsRequested = Number(req.body?.coinsRequested);
    const paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
    const screenshotUrl = String(req.body?.screenshotUrl || '').trim();
    const orderId = String(req.body?.orderId || '').trim();

    if (!Number.isFinite(coinsRequested) || coinsRequested <= 0) {
      throw createHttpError(400, 'coinsRequested must be greater than zero');
    }
    if (!VALID_METHODS.has(paymentMethod)) {
      throw createHttpError(400, 'Invalid paymentMethod');
    }
    if (!screenshotUrl) {
      throw createHttpError(400, 'screenshotUrl is required');
    }
    if (!orderId) {
      throw createHttpError(400, 'orderId is required');
    }

    const dupSnap = await firestore
      .collection('paymentRequests')
      .where('orderId', '==', orderId)
      .limit(1)
      .get();
    if (!dupSnap.empty) {
      throw createHttpError(409, 'orderId already exists');
    }

    const userSnap = await firestore.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      throw createHttpError(404, 'User profile not found');
    }
    const userData = userSnap.data() || {};
    const userName = String(userData.displayName || userData.name || req.firebaseUser?.name || 'Player');
    const userEmail = String(userData.email || req.firebaseUser?.email || '');

    const ref = firestore.collection('paymentRequests').doc();
    await ref.set({
      id: ref.id,
      userId,
      userName,
      userEmail,
      coinsRequested: Math.floor(coinsRequested),
      paymentMethod,
      screenshotUrl,
      orderId,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      approvedAt: null,
      rejectedAt: null,
    });

    return res.status(201).json({
      success: true,
      message: 'Payment submitted. Send screenshot on WhatsApp +92 303 4440870',
      requestId: ref.id,
    });
  } catch (error) {
    return next(error);
  }
}
