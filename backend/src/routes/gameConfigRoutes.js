import express from 'express';
import {
  getPublicGameConfig,
  getPublicGameConfigSlice,
  getPublicGameConfigVariant,
} from '../controllers/gameConfigController.js';

const router = express.Router();

router.get('/game-config', getPublicGameConfig);
router.get('/game-config/:gameKey/:variantKey', getPublicGameConfigVariant);
router.get('/game-config/:gameKey', getPublicGameConfigSlice);

export default router;
