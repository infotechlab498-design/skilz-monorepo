/**
 * In-process TTL cache for merged syllogism candidate rows (per Node instance).
 * For horizontal scale use Redis (same key scheme) — see ENIGMA_SYLLOGISM_CACHE_* envs.
 */

const TTL_MS = Math.max(5000, Number(process.env.ENIGMA_SYLLOGISM_CACHE_TTL_MS || 60_000));
const MAX_ENTRIES = Math.max(4, Number(process.env.ENIGMA_SYLLOGISM_CACHE_MAX_ENTRIES || 32));

/** @type {Map<string, { expires: number; rows: Record<string, unknown>[] }>} */
const store = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first != null) store.delete(first);
    else break;
  }
}

/**
 * @param {string} categoryNorm normalized category string
 * @param {number} cap fetch cap (bucket sizing)
 */
export function syllogismPoolCacheKey(categoryNorm, cap) {
  return `syllogism|${String(categoryNorm || '').trim()}|cap:${cap}`;
}

/** @returns {unknown[] | null} shallow row copies safe for in-place shuffle downstream */
export function getSyllogismPoolCached(key) {
  prune();
  const hit = store.get(key);
  if (!hit || hit.expires <= Date.now()) {
    if (hit) store.delete(key);
    return null;
  }
  return hit.rows.map((r) => ({ ...r }));
}

/**
 * @param {string} key
 * @param {unknown[]} rows normalized row objects (stored by shallow copy)
 */
export function setSyllogismPoolCache(key, rows) {
  prune();
  store.set(key, {
    expires: Date.now() + TTL_MS,
    rows: rows.map((r) => ({ ...r })),
  });
}

export function clearSyllogismPoolCache() {
  store.clear();
}
