import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `backend/src` */
export const SRC_DIR = path.join(__dirname, '..');
/** `backend/` (workspace package root) */
export const BACKEND_ROOT = path.join(SRC_DIR, '..');
/** JSON data directory (`backend/src/data`) */
export const DATA_DIR = path.join(SRC_DIR, 'data');
export const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');
export const LUDO_ROOM_SNAPSHOTS_FILE = path.join(DATA_DIR, 'ludo_room_snapshots.json');
export const BOTS_DEFAULT_FILE = path.join(DATA_DIR, 'bots.default.json');

/**
 * Built SPA output. Override with absolute path or path relative to `backend/`.
 */
export function resolveFrontendDist() {
  const raw = process.env.FRONTEND_DIST?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(BACKEND_ROOT, raw);
  }
  return path.resolve(BACKEND_ROOT, '..', 'frontend', 'dist');
}
