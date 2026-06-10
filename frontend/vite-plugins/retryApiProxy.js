/**
 * Dev-only /api proxy with retries while the Express backend restarts (node --watch).
 * Replaces Vite's default /api proxy so `[vite] http proxy error` is not logged on brief ECONNREFUSED.
 */
import http from 'http';
import { URL } from 'url';

const MAX_ATTEMPTS = 12;
const RETRY_MS = 350;

function forwardWithRetry(req, res, target, attempt = 0) {
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      if (res.writableEnded) return;
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    const transient = err?.code === 'ECONNREFUSED' || err?.code === 'ECONNRESET';
    if (transient && attempt < MAX_ATTEMPTS && !res.headersSent) {
      setTimeout(() => forwardWithRetry(req, res, target, attempt + 1), RETRY_MS);
      return;
    }
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: 'API unavailable — backend is starting or restarting. Retry in a moment.',
        })
      );
    }
  });

  req.pipe(proxyReq);
}

/** @param {string} backendOrigin e.g. http://127.0.0.1:3000 */
export function retryApiProxyPlugin(backendOrigin) {
  const target = new URL(backendOrigin);

  return {
    name: 'skilz-retry-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api')) return next();
        forwardWithRetry(req, res, target);
      });
    },
  };
}
