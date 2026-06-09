import express from 'express';
import * as checkoutController from '../controllers/checkoutController.js';
import * as plansController from '../controllers/plansController.js';
import * as userController from '../controllers/userController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/plans', plansController.getPlans);
router.get('/user/:id', authenticateToken, userController.getUser);
router.post('/user/deduct', authenticateToken, userController.deductCoins);
router.post('/checkout', authenticateToken, checkoutController.processCheckout);

export default router;
