import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { retryApiProxyPlugin } from './vite-plugins/retryApiProxy.js';

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

/** Socket.IO proxy hint when backend is down (WS cannot retry as cleanly as HTTP). */
function attachSocketProxyHint(proxy, backendOrigin) {
  let lastWarnAt = 0;
  proxy.on('error', (err) => {
    const now = Date.now();
    if (now - lastWarnAt < 8_000) return;
    lastWarnAt = now;
    console.warn(
      `[vite-proxy] Socket.IO backend unavailable at ${backendOrigin} (${err?.code || err?.message}). ` +
        'Normal during API hot-reload — client will reconnect.'
    );
  });
}

function createSocketIoProxy(backendOrigin) {
  return {
    '/socket.io': {
      target: backendOrigin,
      changeOrigin: true,
      secure: false,
      ws: true,
      configure: (proxy) => attachSocketProxyHint(proxy, backendOrigin),
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadMonorepoEnv(mode);
  const backendOrigin = backendDevOrigin(env);

  return {
    plugins: [react(), retryApiProxyPlugin(backendOrigin)],
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
      // /api uses retryApiProxyPlugin; only Socket.IO stays on Vite's built-in proxy.
      proxy: { ...createSocketIoProxy(backendOrigin) },
    },
    preview: {
      host: true,
      port: 4173,
      proxy: {
        '/api': { target: backendOrigin, changeOrigin: true, secure: false },
        ...createSocketIoProxy(backendOrigin),
      },
    },
  };
});
