import express from 'express';
import { contactFormRateLimiter } from '../middleware/rateLimit.js';
import { submitContactMessage } from '../controllers/contactController.js';

const router = express.Router();

router.post('/contact', contactFormRateLimiter, submitContactMessage);

export default router;
