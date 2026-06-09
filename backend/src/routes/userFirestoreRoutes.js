import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as userFirestoreController from '../controllers/userFirestoreController.js';

const router = express.Router();

router.post('/add-coins', authenticateToken, userFirestoreController.postAddCoins);
router.post('/deduct-coins', authenticateToken, userFirestoreController.postDeductCoins);
router.post('/add-xp', authenticateToken, userFirestoreController.postAddXp);
router.post('/daily-streak', authenticateToken, userFirestoreController.postUpdateStreak);
router.post('/game-outcome', authenticateToken, userFirestoreController.postGameOutcome);

export default router;
