/**
 * Single dev entry: free stale ports, enforce one dev stack, run concurrently.
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDevPorts } from './ensure-dev-ports.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, '.dev-stack.lock');

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (existsSync(LOCK)) unlinkSync(LOCK);
  } catch {
    /* ignore */
  }
}

function acquireLock() {
  if (existsSync(LOCK)) {
    const existingPid = Number(readFileSync(LOCK, 'utf8').trim());
    if (isPidAlive(existingPid)) {
      console.error(
        `[dev] A dev stack is already running (PID ${existingPid}). Stop it with Ctrl+C in that terminal before starting another.`
      );
      return false;
    }
    releaseLock();
  }
  writeFileSync(LOCK, String(process.pid));
  return true;
}

async function main() {
  const portsOk = await ensureDevPorts();
  if (!portsOk) process.exit(1);
  if (!acquireLock()) process.exit(1);

  let child;
  const onSignal = (signal) => {
    releaseLock();
    if (child && !child.killed) child.kill(signal);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('exit', releaseLock);

  // Backend first; Vite waits for /api/health so proxy does not hit ECONNREFUSED during boot.
  const concurrentlyCmd =
    'npx concurrently -n api,web "npm run dev -w @skilz/backend" "node scripts/wait-for-backend.mjs && npm run dev -w @skilz/frontend"';
  child = spawn(concurrentlyCmd, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('exit', (code) => {
    releaseLock();
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  releaseLock();
  console.error('[dev] Failed to start dev stack:', err?.message || err);
  process.exit(1);
});
