import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin.js';
import {
  GAME_ECONOMY_AUDIT_SUBCOLLECTION,
  GAME_ECONOMY_DOC_ID,
  PLATFORM_CONFIG_COLLECTION,
} from '../../../shared/gameConfig/constants.js';
import {
  buildDefaultGameEconomyConfig,
  mergeGameEconomyWithDefaults,
  toPublicGameEconomyConfig,
} from '../../../shared/gameConfig/defaults.js';
import {
  getEntryFeeFromConfig,
  validateAndNormalizeGameEconomyConfig,
} from '../../../shared/gameConfig/validate.js';
import {
  getEntryFeeForVariant,
  normalizeEnigmaModeKey,
  normalizeTriviaCategoryKey,
  resolveGameVariant,
  resolveEnigmaModeVariant,
  resolveTriviaVariant,
  toPublicVariantSlice,
} from '../../../shared/gameConfig/resolve.js';
import { GAME_KEYS } from '../../../shared/gameConfig/constants.js';

const CACHE_TTL_MS = Number(process.env.GAME_CONFIG_CACHE_TTL_MS) || 60_000;

/** @type {{ config: ReturnType<typeof buildDefaultGameEconomyConfig> | null, expiresAt: number }} */
const cache = { config: null, expiresAt: 0 };

function assertFirestore() {
  const db = getAdminFirestore();
  if (!db) {
    const err = new Error('FIRESTORE_ADMIN_UNAVAILABLE');
    err.code = 'FIRESTORE_ADMIN_UNAVAILABLE';
    throw err;
  }
  return db;
}

function docRef(db) {
  return db.collection(PLATFORM_CONFIG_COLLECTION).doc(GAME_ECONOMY_DOC_ID);
}

function auditCollection(db) {
  return docRef(db).collection(GAME_ECONOMY_AUDIT_SUBCOLLECTION);
}

/**
 * @param {import('firebase-admin/firestore').Timestamp | string | null | undefined} value
 */
function serializeUpdatedAt(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} data
 */
function normalizeFirestoreDoc(data) {
  if (!data) return buildDefaultGameEconomyConfig();
  const merged = mergeGameEconomyWithDefaults(data);
  merged.updatedAt = serializeUpdatedAt(data.updatedAt);
  merged.updatedBy = data.updatedBy ? String(data.updatedBy) : null;
  return validateAndNormalizeGameEconomyConfig(merged);
}

export function clearGameConfigCache() {
  cache.config = null;
  cache.expiresAt = 0;
}

/**
 * Load config from Firestore with in-memory cache; falls back to defaults if doc missing.
 * @param {{ bypassCache?: boolean }} [opts]
 */
export async function getGameEconomyConfig(opts = {}) {
  const now = Date.now();
  if (!opts.bypassCache && cache.config && cache.expiresAt > now) {
    return cache.config;
  }

  let config = buildDefaultGameEconomyConfig();
  try {
    const db = assertFirestore();
    const snap = await docRef(db).get();
    if (snap.exists) {
      config = normalizeFirestoreDoc(snap.data());
    } else {
      config = validateAndNormalizeGameEconomyConfig(config);
    }
  } catch (err) {
    if (err?.code === 'FIRESTORE_ADMIN_UNAVAILABLE') {
      config = validateAndNormalizeGameEconomyConfig(config);
    } else {
      throw err;
    }
  }

  cache.config = config;
  cache.expiresAt = now + CACHE_TTL_MS;
  return config;
}

/**
 * @param {string} gameKey
 */
export async function getGameConfigSlice(gameKey) {
  const full = await getGameEconomyConfig();
  const key = String(gameKey || '').trim().toLowerCase().replace(/-/g, '_');
  return full.games[key] ?? null;
}

/**
 * Entry fee for match join (currently 10 for all games unless admin overrides).
 * @param {string} gameKey
 * @param {string} [variantKey] — trivia category or enigma mode
 */
export async function getGameEntryFee(gameKey, variantKey = null) {
  const config = await getGameEconomyConfig();
  return getEntryFeeFromConfig(config, gameKey, variantKey || undefined);
}

/**
 * Resolved config slice for a game variant (trivia category / enigma mode).
 * @param {string} gameKey
 * @param {string} variantKey
 */
export async function getGameVariantConfig(gameKey, variantKey) {
  const full = await getGameEconomyConfig();
  const resolved = resolveGameVariant(full, gameKey, variantKey);
  if (!resolved) return null;
  return {
    gameKey,
    variantKey,
    entryFee: getEntryFeeForVariant(full, gameKey, variantKey),
    config: toPublicVariantSlice(resolved),
  };
}

/**
 * Runtime match settings for a trivia category.
 * @param {string} category
 */
export async function getTriviaVariantSettings(category) {
  const full = await getGameEconomyConfig();
  const catKey = normalizeTriviaCategoryKey(category);
  const resolved = resolveTriviaVariant(full, catKey);
  return {
    categoryKey: catKey,
    enabled: resolved?.enabled !== false,
    questionCount: Number(resolved?.questionCount) || 20,
    questionSeconds: Number(resolved?.questionSeconds) || 15,
    matchmakingTimeoutMs: Number(resolved?.matchmakingTimeoutMs) || 12_000,
  };
}

/**
 * Runtime match settings for an EnigmaPulse sub-game.
 * @param {string} modeKey
 */
export async function getEnigmaModeSettings(modeKey) {
  const full = await getGameEconomyConfig();
  const mk = normalizeEnigmaModeKey(modeKey);
  const resolved = resolveEnigmaModeVariant(full, mk);
  return {
    modeKey: mk,
    enabled: resolved?.enabled !== false,
    questionCount:
      Number(resolved?.questionCount) ||
      Number(resolved?.sharedRounds) ||
      Number(full.games?.[GAME_KEYS.ENIGMA_PULSE]?.defaults?.questionCount) ||
      10,
    questionSeconds: Number(resolved?.questionSeconds) || 15,
    matchmakingTimeoutMs: Number(resolved?.matchmakingTimeoutMs) || 12_000,
  };
}

export async function getPublicGameEconomyConfig() {
  const full = await getGameEconomyConfig();
  return toPublicGameEconomyConfig(full);
}

/**
 * Seed or replace Firestore document (CLI / first deploy).
 * @param {{ adminUid?: string, force?: boolean }} [opts]
 */
export async function seedGameEconomyConfig(opts = {}) {
  const db = assertFirestore();
  const ref = docRef(db);
  const existing = await ref.get();
  if (existing.exists && !opts.force) {
    return { seeded: false, reason: 'already_exists', config: normalizeFirestoreDoc(existing.data()) };
  }

  const config = validateAndNormalizeGameEconomyConfig(buildDefaultGameEconomyConfig());
  const adminUid = opts.adminUid ? String(opts.adminUid) : 'system_seed';

  await ref.set({
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });

  await auditCollection(db).add({
    action: opts.force ? 'reseed' : 'seed',
    adminUid,
    at: FieldValue.serverTimestamp(),
    summary: 'Initial game economy config (entryFee 10 for all games)',
  });

  clearGameConfigCache();
  return { seeded: true, config };
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} adminUid
 */
export async function saveGameEconomyConfig(body, adminUid) {
  const db = assertFirestore();
  const config = validateAndNormalizeGameEconomyConfig(body);

  await docRef(db).set({
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });

  await auditCollection(db).add({
    action: 'replace',
    adminUid,
    at: FieldValue.serverTimestamp(),
    schemaVersion: config.schemaVersion,
  });

  clearGameConfigCache();
  const saved = await getGameEconomyConfig({ bypassCache: true });
  return saved;
}

/**
 * @param {string} gameKey
 * @param {Record<string, unknown>} patch
 * @param {string} adminUid
 */
export async function patchGameEconomyConfig(gameKey, patch, adminUid) {
  const db = assertFirestore();
  const current = await getGameEconomyConfig({ bypassCache: true });
  const key = String(gameKey || '').trim().toLowerCase().replace(/-/g, '_');

  if (!current.games[key]) {
    const err = new Error(`Unknown game key: ${gameKey}`);
    err.statusCode = 400;
    throw err;
  }

  const next = mergeGameEconomyWithDefaults({
    ...current,
    games: {
      ...current.games,
      [key]: { ...current.games[key], ...patch },
    },
  });

  const config = validateAndNormalizeGameEconomyConfig(next);

  await docRef(db).set({
    ...config,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });

  await auditCollection(db).add({
    action: 'patch',
    gameKey: key,
    adminUid,
    at: FieldValue.serverTimestamp(),
    patchKeys: Object.keys(patch || {}),
  });

  clearGameConfigCache();
  return getGameEconomyConfig({ bypassCache: true });
}

/**
 * @param {number} [limit]
 */
export async function listGameEconomyAuditLog(limit = 20) {
  const db = assertFirestore();
  const cap = Math.min(Math.max(1, Number(limit) || 20), 100);
  const snap = await auditCollection(db).orderBy('at', 'desc').limit(cap).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      at: serializeUpdatedAt(data.at),
    };
  });
}

export { validateAndNormalizeGameEconomyConfig, getEntryFeeFromConfig, toPublicGameEconomyConfig };
