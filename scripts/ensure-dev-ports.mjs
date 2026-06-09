/**
 * Pre-dev guard: free Skilz-owned listeners on 3000 (API) and 5173 (Vite)
 * before `concurrently` starts another dev stack.
 */
import net from 'net';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const PORTS = [3000, 5173];

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve({ free: false, code: err?.code || null }));
    server.once('listening', () => server.close(() => resolve({ free: true })));
    server.listen({ port, host: '0.0.0.0', exclusive: true });
  });
}

function getWindowsListeners(port) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; $cmd = (Get-CimInstance Win32_Process -Filter \\"ProcessId=$procId\\" -ErrorAction SilentlyContinue).CommandLine; Write-Output ($procId.ToString() + '|' + $cmd) }"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!out) return [];
    return out.split('\n').map((line) => {
      const [pid, ...rest] = line.split('|');
      return { pid: Number(pid), cmd: rest.join('|') };
    });
  } catch {
    return [];
  }
}

function getUnixListeners(port) {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    if (!out) return [];
    return out.split('\n').map((pidLine) => {
      const pid = Number(pidLine);
      let cmd = '';
      try {
        cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
      } catch {
        /* ignore */
      }
      return { pid, cmd };
    });
  } catch {
    return [];
  }
}

function getListeners(port) {
  return process.platform === 'win32' ? getWindowsListeners(port) : getUnixListeners(port);
}

function isSkilzDevProcess(cmd, port) {
  if (!cmd) return false;
  const lower = cmd.toLowerCase();
  // Backend dev/prod entry — also matches Cursor helper node (relative `src/bootstrapEnv.js`).
  if (lower.includes('bootstrapenv.js')) return true;
  // Vite dev server for this monorepo (default dev port 5173).
  if (port === 5173 && lower.includes('vite')) return true;
  if (lower.includes('skilzproject') && (lower.includes('vite') || lower.includes('@skilz'))) {
    return true;
  }
  return false;
}

function killPid(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
}

async function waitForPortFree(port, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const check = await isPortFree(port);
    if (check.free) return true;
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  return (await isPortFree(port)).free;
}

async function ensurePort(port) {
  const initial = await isPortFree(port);
  if (initial.free) return true;

  const listeners = getListeners(port).filter((entry) => entry.pid !== process.pid);
  const staleSkilz = listeners.filter((entry) => isSkilzDevProcess(entry.cmd, port));
  for (const entry of staleSkilz) {
    killPid(entry.pid);
  }

  if (staleSkilz.length > 0 && (await waitForPortFree(port))) {
    return true;
  }

  const stillBlocking = getListeners(port).filter((entry) => entry.pid !== process.pid);
  console.error(`[dev] Port ${port} is in use and could not be freed automatically.`);
  for (const entry of stillBlocking) {
    console.error(`  PID ${entry.pid}: ${entry.cmd || '(unknown command)'}`);
  }
  console.error(`  Free it: npx kill-port ${port}`);
  return false;
}

export async function ensureDevPorts() {
  for (const port of PORTS) {
    const ok = await ensurePort(port);
    if (!ok) return false;
  }
  return true;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  ensureDevPorts()
    .then((ok) => {
      if (!ok) process.exit(1);
    })
    .catch((err) => {
      console.error('[dev] Port preflight failed:', err?.message || err);
      process.exit(1);
    });
}
