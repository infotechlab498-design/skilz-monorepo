import express from 'express';
import rateLimit from 'express-rate-limit';
import { subscribeNewsletter, unsubscribeNewsletter } from '../controllers/newsletterController.js';

const router = express.Router();

const newsletterRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many newsletter requests, please try again later.' },
});

router.post('/subscribe', newsletterRateLimit, subscribeNewsletter);
router.get('/unsubscribe', newsletterRateLimit, unsubscribeNewsletter);

export default router;
