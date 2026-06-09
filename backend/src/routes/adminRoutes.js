import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import * as adminController from '../controllers/adminController.js';
import * as blogController from '../controllers/blogController.js';
import * as contactController from '../controllers/contactController.js';
import adminQuestionsRoutes from './adminQuestionsRoutes.js';
import {
  getAdminGameConfig,
  getAdminGameConfigAudit,
  patchAdminGameConfig,
  postAdminGameConfigSeed,
  putAdminGameConfig,
} from '../controllers/gameConfigController.js';

const router = express.Router();

// Every route below: `requireAuth` (middleware/auth.js) then `requireAdmin` (middleware/adminMiddleware.js) — frontend hits these via Vite proxy as /api/admin/...

router.use(requireAuth, requireAdmin);
router.use('/questions', adminQuestionsRoutes);
router.get('/game-config/audit', getAdminGameConfigAudit);
router.post('/game-config/seed', postAdminGameConfigSeed);
router.get('/game-config', getAdminGameConfig);
router.put('/game-config', putAdminGameConfig);
router.patch('/game-config/:gameKey', patchAdminGameConfig);
router.get('/payments', adminController.getAdminPayments);
router.get('/payment-stats', adminController.getAdminPaymentStats);
router.post('/approve', adminController.approvePayment);
router.post('/reject', adminController.rejectPayment);
router.get('/users', adminController.getAdminUsers);
router.get('/user/:id', adminController.getAdminUserById);
router.post('/update-role', adminController.updateUserRole);
router.post('/block-user', adminController.blockUser);
router.post('/unblock-user', adminController.unblockUser);
router.get('/metrics', adminController.getAdminMetrics);
router.get('/revenue-trends', adminController.getRevenueTrends);
router.get('/payment-volume', adminController.getPaymentVolume);
router.get('/events', adminController.getAdminEvents);
router.get('/blogs', blogController.listAdminBlogs);
router.get('/contact-messages', contactController.listAdminContactMessages);
router.post('/contact-messages/:id/send-reply', contactController.sendAdminContactReply);
router.patch('/contact-messages/:id', contactController.patchAdminContactMessage);

export default router;
