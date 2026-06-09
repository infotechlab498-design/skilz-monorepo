import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { extractCloudinaryPublicId, getCloudinary } from '../config/cloudinary.js';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import {
  parseSingleProfileImage,
  uploadProfileImageRateLimit,
  validateProfileImageFile,
} from '../middleware/uploadMiddleware.js';
import { createHttpError } from '../middleware/errorHandler.js';

const router = express.Router();

function uploadBufferToCloudinary(fileBuffer, uid) {
  const cloudinary = getCloudinary();
  if (!cloudinary) {
    throw createHttpError(503, 'Cloudinary is not configured on server');
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'trivia-profiles',
        public_id: `${String(uid)}-${Date.now()}`,
        overwrite: false,
        resource_type: 'image',
        format: 'webp',
        transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
      },
      (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

async function destroyCloudinaryAsset(publicId) {
  const cloudinary = getCloudinary();
  if (!cloudinary || !publicId) return;
  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });
}

router.post(
  '/upload/profile-image',
  authenticateToken,
  uploadProfileImageRateLimit,
  parseSingleProfileImage,
  validateProfileImageFile,
  async (req, res, next) => {
    let uploadedPublicId = '';
    try {
    const uid = String(req.userId || '').trim();
    if (!uid) {
      throw createHttpError(401, 'Unauthorized');
    }
    const file = req.file;

    const uploaded = await uploadBufferToCloudinary(file.buffer, uid);
    uploadedPublicId = String(uploaded?.public_id || '').trim();
    const secureUrl = String(uploaded?.secure_url || '').trim();
    if (!secureUrl) {
      throw createHttpError(502, 'Cloudinary upload failed');
    }

    const firestore = getAdminFirestore();
    if (!firestore) {
      throw createHttpError(503, 'Firestore Admin is not configured on server');
    }
    const userRef = firestore.collection('users').doc(uid);
    const currentDoc = await userRef.get();
    const previousUrl = String(currentDoc.data()?.profileImage || '').trim();
    const previousPublicId = extractCloudinaryPublicId(previousUrl);

    await userRef.set(
      {
        profileImage: secureUrl,
      },
      { merge: true }
    );

    if (previousPublicId && previousPublicId !== uploadedPublicId) {
      try {
        await destroyCloudinaryAsset(previousPublicId);
        console.info('[upload-profile-image] removed previous image', { uid, publicId: previousPublicId });
      } catch (cleanupErr) {
        console.warn('[upload-profile-image] failed to remove previous image', {
          uid,
          publicId: previousPublicId,
          error: cleanupErr?.message || cleanupErr,
        });
      }
    }

    console.info('[upload-profile-image] upload success', { uid, publicId: uploadedPublicId });
    return res.json({ success: true, url: secureUrl });
    } catch (error) {
      if (uploadedPublicId) {
        try {
          await destroyCloudinaryAsset(uploadedPublicId);
          console.warn('[upload-profile-image] rollback executed', { uid: req.userId, publicId: uploadedPublicId });
        } catch (rollbackErr) {
          console.error('[upload-profile-image] rollback failed', {
            uid: req.userId,
            publicId: uploadedPublicId,
            error: rollbackErr?.message || rollbackErr,
          });
        }
      }
      next(error);
    }
  }
);

export default router;
