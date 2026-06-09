import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminFirestore } from './firebaseAdmin.js';
import { BOTS_DEFAULT_FILE } from '../config/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, object>} */
const cache = new Map();
let loadedDefaults = false;

function loadDefaultsFromFile() {
  if (loadedDefaults) return;
  loadedDefaults = true;
  const p = BOTS_DEFAULT_FILE;
  if (!existsSync(p)) return;
  try {
    const list = JSON.parse(readFileSync(p, 'utf8'));
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (b?.id) cache.set(b.id, b);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} botId
 * @returns {Promise<object | null>}
 */
export async function getBotProfile(botId) {
  loadDefaultsFromFile();
  const id = botId || 'default_medium';
  if (cache.has(id)) return cache.get(id);

  const adb = getAdminFirestore();
  if (adb) {
    try {
      const snap = await adb.collection('bots').doc(id).get();
      if (snap.exists) {
        const d = { id, ...snap.data() };
        cache.set(id, d);
        return d;
      }
    } catch {
      /* fall through */
    }
  }

  if (cache.has('default_medium')) return cache.get('default_medium');
  return cache.get(id) || null;
}

export function botDelayMs(profile) {
  const d = profile?.avgMoveDelayMs;
  if (d && typeof d === 'object' && d.min != null && d.max != null) {
    const min = Number(d.min);
    const max = Number(d.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }
  // Keep bot turns feeling responsive for realtime play.
  return Math.floor(Math.random() * 300) + 250;
}
