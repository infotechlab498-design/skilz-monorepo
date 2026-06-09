import express from 'express';
import {
  getNewsletterStats,
  getNewsletterSubscribers,
} from '../controllers/newsletterController.js';

const router = express.Router();

router.get('/subscribers', getNewsletterSubscribers);
router.get('/stats', getNewsletterStats);

export default router;
