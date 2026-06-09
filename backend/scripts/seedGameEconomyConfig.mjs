#!/usr/bin/env node
/**
 * Seed Firestore platform_config/game_economy with defaults (entryFee 10 for all games).
 *
 * Usage:
 *   node scripts/seedGameEconomyConfig.mjs
 *   node scripts/seedGameEconomyConfig.mjs --force
 */
import '../src/bootstrapEnv.js';
import { seedGameEconomyConfig } from '../src/services/gameConfigService.js';

const force = process.argv.includes('--force');

try {
  const result = await seedGameEconomyConfig({ adminUid: 'cli_seed', force });
  if (result.seeded) {
    console.log('[seedGameEconomyConfig] Document written:', 'platform_config/game_economy');
    console.log('[seedGameEconomyConfig] All games entryFee:', result.config.global.defaultEntryFee);
  } else {
    console.log('[seedGameEconomyConfig] Skipped — document already exists. Use --force to overwrite.');
  }
  process.exit(0);
} catch (err) {
  console.error('[seedGameEconomyConfig] Failed:', err.message || err);
  process.exit(1);
}
