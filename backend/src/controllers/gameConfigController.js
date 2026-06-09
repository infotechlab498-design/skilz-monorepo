import * as gameConfigService from '../services/gameConfigService.js';
import { GAME_KEYS } from '../../../shared/gameConfig/constants.js';
import { normalizeEnigmaModeKey, normalizeTriviaCategoryKey } from '../../../shared/gameConfig/resolve.js';

function handleError(res, error) {
  const status = Number(error?.statusCode) || 500;
  const message = error?.message || 'Game config error';
  if (status >= 500) {
    console.error('[gameConfig]', error);
  }
  return res.status(status).json({ success: false, message });
}

/** GET /api/game-config — public lobby-safe config */
export async function getPublicGameConfig(req, res) {
  try {
    const config = await gameConfigService.getPublicGameEconomyConfig();
    res.json({ success: true, config });
  } catch (error) {
    return handleError(res, error);
  }
}

/** GET /api/game-config/:gameKey */
export async function getPublicGameConfigSlice(req, res) {
  try {
    const gameKey = req.params.gameKey;
    const variantKey = req.query?.variant || req.query?.category || req.query?.mode || null;
    if (variantKey) {
      const variant = await gameConfigService.getGameVariantConfig(gameKey, String(variantKey));
      if (!variant) {
        return res.status(404).json({ success: false, message: 'Unknown game or variant key' });
      }
      return res.json({ success: true, ...variant });
    }
    const slice = await gameConfigService.getGameConfigSlice(gameKey);
    if (!slice) {
      return res.status(404).json({ success: false, message: 'Unknown game key' });
    }
    const entryFee = await gameConfigService.getGameEntryFee(gameKey);
    res.json({
      success: true,
      gameKey,
      entryFee,
      config: slice,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

/** GET /api/game-config/:gameKey/:variantKey */
export async function getPublicGameConfigVariant(req, res) {
  try {
    const { gameKey, variantKey } = req.params;
    const game = String(gameKey || '').trim().toLowerCase().replace(/-/g, '_');
    if (game !== GAME_KEYS.TRIVIA && game !== GAME_KEYS.ENIGMA_PULSE) {
      return res.status(404).json({ success: false, message: 'Variant config not supported for this game' });
    }
    const normalizedVariant =
      game === GAME_KEYS.TRIVIA
        ? normalizeTriviaCategoryKey(variantKey)
        : normalizeEnigmaModeKey(variantKey);
    const variant = await gameConfigService.getGameVariantConfig(game, normalizedVariant);
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Unknown variant key' });
    }
    res.json({ success: true, ...variant });
  } catch (error) {
    return handleError(res, error);
  }
}

/** GET /api/admin/game-config */
export async function getAdminGameConfig(req, res) {
  try {
    const config = await gameConfigService.getGameEconomyConfig({ bypassCache: true });
    res.json({ success: true, config });
  } catch (error) {
    return handleError(res, error);
  }
}

/** PUT /api/admin/game-config */
export async function putAdminGameConfig(req, res) {
  try {
    const config = await gameConfigService.saveGameEconomyConfig(req.body || {}, req.adminUser.uid);
    res.json({ success: true, config });
  } catch (error) {
    const status = /must be|required|Missing|At least one/.test(error?.message || '') ? 400 : 500;
    error.statusCode = status;
    return handleError(res, error);
  }
}

/** PATCH /api/admin/game-config/:gameKey */
export async function patchAdminGameConfig(req, res) {
  try {
    const config = await gameConfigService.patchGameEconomyConfig(
      req.params.gameKey,
      req.body || {},
      req.adminUser.uid
    );
    res.json({ success: true, config });
  } catch (error) {
    const status =
      error?.statusCode ||
      (/must be|required|Unknown game/.test(error?.message || '') ? 400 : 500);
    error.statusCode = status;
    return handleError(res, error);
  }
}

/** GET /api/admin/game-config/audit */
export async function getAdminGameConfigAudit(req, res) {
  try {
    const limit = Number(req.query?.limit) || 20;
    const entries = await gameConfigService.listGameEconomyAuditLog(limit);
    res.json({ success: true, entries });
  } catch (error) {
    return handleError(res, error);
  }
}

/** POST /api/admin/game-config/seed — idempotent seed (force=true to overwrite) */
export async function postAdminGameConfigSeed(req, res) {
  try {
    const force = Boolean(req.body?.force);
    const result = await gameConfigService.seedGameEconomyConfig({
      adminUid: req.adminUser.uid,
      force,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
}
