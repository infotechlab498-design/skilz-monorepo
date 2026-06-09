import express from 'express';
import * as gameController from '../controllers/gameController.js';
import { createGame, updateScore, quitGame, getGame } from '../controllers/checkoutController.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getLudoAvailablePlayers,
  getOnlinePlayers,
} from '../controllers/ludoSocialController.js';
import gameConfigRoutes from './gameConfigRoutes.js';


const router = express.Router();

router.use(gameConfigRoutes);

router.get('/ludo/available-players', authenticateToken, getLudoAvailablePlayers);
router.get('/online-players', authenticateToken, getOnlinePlayers);

router.post('/matchmake', authenticateToken, gameController.matchmake);
router.post('/matchmake/bot', authenticateToken, gameController.matchmakeBot);
router.get('/room/:id', authenticateToken, gameController.getRoom);
router.post('/game/submit', authenticateToken, gameController.submitAnswer);
router.post('/game/end', authenticateToken, gameController.endMatch);
router.post('/game/reward', authenticateToken, gameController.postGameReward);
router.get('/enigma/results', authenticateToken, gameController.getRecentEnigmaResults);

router.post('/deduct-coins', authenticateToken, gameController.deductCoins);
router.post('/user/:id/stats', authenticateToken, gameController.updateStats);


router.post('/create', authenticateToken, createGame);
router.post('/update-score', authenticateToken, updateScore);
router.post('/quit', authenticateToken, quitGame);
router.get('/:id', authenticateToken, getGame);


export default router;





// const router = express.Router();


// export default router;

