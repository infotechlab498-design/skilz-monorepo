import { getAdminFirestore } from '../services/firebaseAdmin.js';

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'info@aljazeeragc.com').toLowerCase().trim();

export async function requireAdmin(req, res, next) {
  try {
    const uid = String(req.userId || '').trim();
    const email = String(req.firebaseUser?.email || '').toLowerCase().trim();
    if (!uid) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const firestore = getAdminFirestore();
    if (!firestore) {
      return res.status(503).json({ success: false, message: 'Firestore Admin is not configured' });
    }
    const userSnap = await firestore.collection('users').doc(uid).get();
    const role = String(userSnap.data()?.role || '').trim();
    if (email !== ADMIN_EMAIL || role !== 'admin') {
      // 403 after token verified: caller is authenticated but not the configured admin (env ADMIN_EMAIL + Firestore users/{uid}.role).
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.adminUser = {
      uid,
      email,
      role,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
