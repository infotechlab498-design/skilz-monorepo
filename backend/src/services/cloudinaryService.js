import { getCloudinary, extractCloudinaryPublicId } from '../config/cloudinary.js';
import { createHttpError } from '../middleware/errorHandler.js';

export async function uploadPaymentScreenshotBuffer({ fileBuffer, uid, orderId }) {
  const cloudinary = getCloudinary();
  if (!cloudinary) {
    throw createHttpError(503, 'Cloudinary is not configured on server');
  }
  const publicId = `payment-screenshots/${String(uid)}-${String(orderId)}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'payment-screenshots',
        public_id: publicId,
        overwrite: false,
        resource_type: 'image',
      },
      (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

export async function uploadBlogCoverBuffer({ fileBuffer }) {
  const cloudinary = getCloudinary();
  if (!cloudinary) {
    throw createHttpError(503, 'Cloudinary is not configured on server');
  }
  const publicId = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'blog-covers',
        public_id: publicId,
        overwrite: false,
        resource_type: 'image',
        transformation: [{ width: 1200, crop: 'limit' }],
      },
      (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

export async function destroyCloudinaryByUrl(url) {
  const cloudinary = getCloudinary();
  if (!cloudinary) return;
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });
}
