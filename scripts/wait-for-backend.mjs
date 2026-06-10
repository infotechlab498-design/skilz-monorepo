/**
 * Block until the Express API accepts connections (dev-stack starts Vite after this).
 */
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(ROOT, '.env') });

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const HEALTH_PATH = '/health';
const TIMEOUT_MS = 120_000;
const INTERVAL_MS = 250;

function probeOnce() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: HOST,
        port: PORT,
        path: HEALTH_PATH,
        timeout: 2_000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForBackend() {
  const started = Date.now();
  process.stdout.write(`[dev] Waiting for API at http://${HOST}:${PORT}${HEALTH_PATH} …\n`);

  while (Date.now() - started < TIMEOUT_MS) {
    if (await probeOnce()) {
      process.stdout.write(`[dev] API ready on port ${PORT} (${Date.now() - started}ms)\n`);
      return;
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  console.error(
    `[dev] Timed out after ${TIMEOUT_MS}ms waiting for API on port ${PORT}. ` +
      'Check backend logs for startup errors.'
  );
  process.exit(1);
}

waitForBackend().catch((err) => {
  console.error('[dev] wait-for-backend failed:', err?.message || err);
  process.exit(1);
});
