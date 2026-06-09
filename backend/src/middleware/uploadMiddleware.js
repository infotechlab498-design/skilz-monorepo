import path from 'path';
import multer from 'multer';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createHttpError } from './errorHandler.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

function looksLikeImageMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
}

export const uploadProfileImageRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = String(req.user?.uid || req.firebaseUser?.uid || req.userId || '').trim();
    const safeIpKey = ipKeyGenerator(req);
    return uid || safeIpKey;
  },
  message: { success: false, error: 'Too many uploads, please wait and try again' },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    const ext = path.extname(String(file?.originalname || '')).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime) || !ALLOWED_EXTENSIONS.has(ext)) {
      cb(createHttpError(400, 'Only jpg, jpeg, png, and webp files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const parseSingleProfileImage = upload.single('image');

export function validateProfileImageFile(req, _res, next) {
  const file = req.file;
  if (!file?.buffer) {
    return next(createHttpError(400, 'Image file is required'));
  }
  if (!looksLikeImageMagicBytes(file.buffer)) {
    return next(createHttpError(400, 'Invalid image file signature'));
  }
  return next();
}
