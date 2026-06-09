/**
 * In-process TTL cache for merged EnigmaPulse Firestore candidate rows (non-syllogism paths).
 * Cuts repeat Firestore fan-out when many matches share category/difficulty/gameKey (Sequence IQ, etc.).
 * For multi-instance scale, use Redis with the same key scheme (see ENIGMA_CANDIDATE_CACHE_* envs).
 */

const TTL_MS = Math.max(5000, Number(process.env.ENIGMA_CANDIDATE_CACHE_TTL_MS || 45_000));
const MAX_ENTRIES = Math.max(8, Number(process.env.ENIGMA_CANDIDATE_CACHE_MAX_ENTRIES || 48));

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
 * @param {string} gameKeySelection resolved selection key (e.g. riddle_sequence)
 * @param {string} categoryNorm normalized category
 * @param {string} difficultyLower lowercased difficulty
 * @param {number} cap same cap passed into fetchFirestoreEnigmaPulseRows
 */
export function enigmaCandidatePoolCacheKey(gameKeySelection, categoryNorm, difficultyLower, cap) {
  return `pool|${String(gameKeySelection || '').trim()}|${String(categoryNorm || '').trim()}|${String(difficultyLower || '').trim()}|cap:${Number(cap) || 0}`;
}

/**
 * Sequence IQ (pattern_recognition): merged easy+medium+hard Firestore fetch — cache key must not use a single difficulty.
 * @param {string} categoryNorm normalized category
 * @param {number} cap merged fetch cap
 */
export function enigmaSequenceIqMergedPoolCacheKey(categoryNorm, cap) {
  return `pool|riddle_sequence_merged|${String(categoryNorm || '').trim()}|cap:${Number(cap) || 0}`;
}

/** @returns {unknown[] | null} shallow row copies safe for shuffle / deck picking */
export function getEnigmaCandidatePoolCached(key) {
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
 * @param {unknown[]} rows normalized row objects
 */
export function setEnigmaCandidatePoolCache(key, rows) {
  prune();
  store.set(key, {
    expires: Date.now() + TTL_MS,
    rows: rows.map((r) => ({ ...r })),
  });
}

export function clearEnigmaCandidatePoolCache() {
  store.clear();
}
