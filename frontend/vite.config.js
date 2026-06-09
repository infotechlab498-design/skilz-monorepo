import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Monorepo root + frontend `.env` (frontend wins on conflict). Matches backend `bootstrapEnv.js` load order. */
function loadMonorepoEnv(mode) {
  const rootDir = resolve(__dirname, '..');
  const rootEnv = loadEnv(mode, rootDir, '');
  const frontendEnv = loadEnv(mode, __dirname, '');
  return { ...rootEnv, ...frontendEnv };
}

/** Backend listen port — keep in sync with `backend/src/server.js` (`PORT` default 3000). */
function backendDevOrigin(env) {
  const port = Number(env.PORT) || 3000;
  return `http://127.0.0.1:${port}`;
}

/** When Vite runs without the Express backend, proxy errors are noisy; one clear hint helps. */
function attachProxyBackendHint(proxy, backendOrigin) {
  proxy.on('error', (err) => {
    console.warn(
      `[vite-proxy] Nothing accepted connections at ${backendOrigin} (` +
        (err.code || err.message) +
        '). Run `npm run dev` from the monorepo root (or `npm run dev:backend` + `npm run dev:frontend`).'
    );
  });
}

function createDevApiProxy(backendOrigin) {
  return {
    '/api': {
      target: backendOrigin,
      changeOrigin: true,
      secure: false,
      configure: (proxy) => attachProxyBackendHint(proxy, backendOrigin),
    },
    // Socket.IO long-poll + WS upgrade. Target 127.0.0.1 to avoid ::1/localhost mismatch on Windows.
    // Client URL is configured in `frontend/src/services/socketService.js` (same-origin + this proxy in dev).
    '/socket.io': {
      target: backendOrigin,
      changeOrigin: true,
      secure: false,
      ws: true,
      configure: (proxy) => attachProxyBackendHint(proxy, backendOrigin),
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadMonorepoEnv(mode);
  const backendOrigin = backendDevOrigin(env);

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // Client Ludo logic reuses server game-engine modules (pure JS).
        '@game-engine': resolve(__dirname, '../backend/src/game-engine'),
        '@truthpack': resolve(__dirname, '../.vibecheck/truthpack'),
      },
    },
    server: {
      // Expose Vite dev server on LAN so devices on same Wi-Fi can open it.
      host: true,
      port: 5173,
      strictPort: true,
      proxy: { ...createDevApiProxy(backendOrigin) },
    },
    // Match dev: same-origin socket + /api when testing production build locally.
    preview: {
      host: true,
      port: 4173,
      proxy: { ...createDevApiProxy(backendOrigin) },
    },
  };
});
