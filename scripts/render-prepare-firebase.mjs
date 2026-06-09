/**
 * Render build step: write Firebase service account JSON from env to disk.
 * Set secret FIREBASE_SERVICE_ACCOUNT_JSON in Render (full JSON string).
 * FIREBASE_SERVICE_ACCOUNT_PATH must point at the output file (see render.yaml).
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const backendRoot = path.join(repoRoot, 'backend');
/** Paths in FIREBASE_SERVICE_ACCOUNT_PATH are resolved from `backend/` (see firebaseAdmin.js). */
const saRel =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || 'secrets/render-service-account.json';
const outPath = path.isAbsolute(saRel)
  ? saRel
  : path.join(backendRoot, saRel);

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!raw) {
  console.warn(
    '[render-prepare-firebase] FIREBASE_SERVICE_ACCOUNT_JSON not set — skip (Admin SDK will be unavailable until configured).'
  );
  process.exit(0);
}

try {
  JSON.parse(raw);
} catch {
  console.error('[render-prepare-firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  process.exit(1);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, raw, 'utf8');
console.log(`[render-prepare-firebase] Wrote service account to ${outPath}`);
