import jwt from 'jsonwebtoken';
import { getAdminAuth } from '../services/firebaseAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'skilz-dev-secret-change-in-production';

/**
 * @param {string} userId
 * @returns {string}
 */
export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify Firebase ID token with the Admin SDK and attach the Firebase uid.
 */
export function authenticateToken(req, res, next) {
  (async () => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ success: false, error: 'Access token required' });
      return;
    }
    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      res.status(503).json({
        success: false,
        error:
          'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS on the server.',
      });
      return;
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.userId = decoded.uid;
      req.firebaseUser = decoded;
      next();
    } catch {
      // 403 seen from browser as failed GET /api/admin/* — token not a valid Firebase ID token for this project (expired, wrong env, or legacy JWT).
      res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
  })().catch(next);
}

/**
 * Optional: attach Firebase uid if a valid Admin-verified token is present.
 */
export function optionalAuth(req, _res, next) {
  (async () => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    const adminAuth = getAdminAuth();
    if (!adminAuth) return next();
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.userId = decoded.uid;
      req.firebaseUser = decoded;
    } catch {
      req.userId = undefined;
    }
    next();
  })().catch(next);
}
