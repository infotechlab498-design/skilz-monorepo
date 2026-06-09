import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { parseSingleProfileImage, validateProfileImageFile } from '../middleware/uploadMiddleware.js';
import * as paymentController from '../controllers/paymentController.js';

const router = express.Router();

router.post(
  '/upload-screenshot',
  requireAuth,
  parseSingleProfileImage,
  validateProfileImageFile,
  paymentController.uploadScreenshot
);

router.post('/create-request', requireAuth, paymentController.createPaymentRequest);

export default router;
