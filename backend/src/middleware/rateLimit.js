import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/** Public contact form: 5 submissions per minute per IP (trust proxy for X-Forwarded-For). */
export const contactFormRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { success: false, error: 'Too many contact form submissions, please try again later.' },
});
