import { io } from 'socket.io-client';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '../firebase/config.js';
import { authLog } from '../utils/authDiagnostics.js';

/**
 * Socket.IO server URL.
 *
 * DevTools stack traces like `websocket.js:119` come from the **socket.io-client** package
 * (bundled `node_modules/socket.io-client/build/esm-debug/websocket.js`), not this repo.
 * The `[socket] connect_error` line is logged here in `_attachCoreListeners()` → `connect_error`.
 *
 * `net::ERR_CONNECTION_REFUSED` on `ws://127.0.0.1:3000/socket.io/...` means the browser could
 * not open a TCP connection to that host/port — usually **Express + Socket.IO is not running**
 * on port 3000 (`npm run dev` from monorepo root, or `npm run dev:backend` in a second terminal).
 *
 * When `VITE_SOCKET_URL` is unset, use **same origin** as the page (e.g. `http://localhost:5173`)
 * so the WebSocket hits Vite’s `/socket.io` proxy (see `frontend/vite.config.js`), matching how
 * `api.js` uses relative `/api`. Override `VITE_SOCKET_URL` when the API lives on another origin.
 */
/**
 * In dev, always use the page origin so Socket.IO goes through Vite’s `/socket.io` proxy.
 * Legacy `.env` often set `VITE_SOCKET_URL=http://127.0.0.1:3000`, which bypasses the proxy and
 * fails whenever the backend is down or restarting — even while `/api` still works via the proxy.
 */
function resolveSocketUrl() {
  const explicit = import.meta.env.VITE_SOCKET_URL?.trim();
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined') return window.location.origin;
    return explicit || 'http://127.0.0.1:5173';
  }
  return (
    explicit ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000')
  );
}

const SOCKET_URL = resolveSocketUrl();

const DEBUG = import.meta.env.DEV;

function dbg(...args) {
  if (DEBUG) console.log('[socket]', ...args);
}

const PRESENCE_PING_MS = 12000;

class SocketService {
  constructor() {
    this.socket = null;
    this.unsubscribeToken = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.presencePingInterval = null;
    this.bindAuthLifecycle();
  }

  bindAuthLifecycle() {
    if (this.unsubscribeToken) return;
    this.unsubscribeToken = onIdTokenChanged(auth, async (user) => {
      if (!this.socket) return;
      if (!user) {
        this.socket.auth = {};
        if (this.socket.connected) this.socket.disconnect();
        dbg('signed out — disconnected');
        return;
      }
      try {
        const token = await user.getIdToken(true);
        this.socket.auth = { token };
        dbg('ID token refreshed');
        if (this.socket.connected) {
          this.socket.disconnect();
          this.socket.connect();
        }
      } catch (e) {
        console.warn('[socket] Token refresh failed:', e?.message || e);
      }
    });
  }

  _attachCoreListeners() {
    if (!this.socket || this.socket.__skilzCoreListeners) return;
    this.socket.__skilzCoreListeners = true;
    this.socket.on('connect', () => {
      dbg('connected', this.socket.id);
      authLog('Socket Authenticated', { socketId: this.socket.id });
      if (this.presencePingInterval) clearInterval(this.presencePingInterval);
      this.presencePingInterval = setInterval(() => {
        if (this.socket?.connected) this.socket.emit('presence:ping');
      }, PRESENCE_PING_MS);
    });
    this.socket.on('disconnect', (reason) => {
      dbg('disconnected', reason);
      if (this.presencePingInterval) {
        clearInterval(this.presencePingInterval);
        this.presencePingInterval = null;
      }
    });
    // Browser console: `[socket] connect_error: websocket error` — often preceded by DevTools
    // Network/WebSocket errors from socket.io-client’s websocket transport (see file header).
    this.socket.on('connect_error', (err) => {
      console.warn('[socket] connect_error:', err?.message || err);
    });
  }

  /**
   * Wait until Firebase user + ID token exist, then connect with `auth: { token }`.
   */

  async ensureConnected(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);

    try {
      if (auth.authStateReady) {
        await auth.authStateReady;
      }
    } catch {
      /* ignore */
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error('SOCKET_AUTH: Sign in required before connecting');
    }
    const token = await user.getIdToken(forceRefresh);
    if (!token) {
      throw new Error('SOCKET_AUTH: Empty ID token');
    }

    if (!this.socket) {
      // First connection attempt; failures surface as `connect_error` above and in DevTools WS panel.
      this.socket = io(SOCKET_URL, {
        autoConnect: false,
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });
      this._attachCoreListeners();
    } else {
      this.socket.auth = { token };
    }

    if (!this.socket.connected) {
      this.socket.connect();
    }

    await new Promise((resolve, reject) => {
      if (this.socket.connected) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Socket connect timeout'));
      }, 20000);
      const onOk = () => {
        cleanup();
        resolve();
      };
      const onFail = (e) => {
        cleanup();
        reject(e);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('connect', onOk);
        this.socket.off('connect_error', onFail);
      };
      this.socket.once('connect', onOk);
      this.socket.once('connect_error', onFail);
    });

    return this.socket;
  }

  /**
   * @deprecated Prefer `ensureConnected()` so the handshake always includes a token.
   */

  connect() {
    void this.ensureConnected({ forceRefresh: false }).catch((e) => {
      console.warn('[socket]', e?.message || e);
    });
    return this.socket;
  }

  getSocket() {
    if (!this.socket) {
      void this.ensureConnected({ forceRefresh: false }).catch(() => {});
    }
    return this.socket;
  }

  
  /**
   * Emit only when connected. Identity must never be sent — server uses `socket.user.uid`.
   */


  emit(event, data) {
    const s = this.socket;
    if (!s?.connected) {
      dbg('emit skipped (offline):', event);
      return false;
    }
    dbg('emit', event);
    s.emit(event, data);
    return true;
  }

  on(event, callback) {
    this.getSocket()?.on(event, callback);
  }

  off(event, callback) {
    this.socket?.off(event, callback);
  }

  async reconnectWithAuth(forceRefresh = true) {
    return this.ensureConnected({ forceRefresh });
  }

  disconnect() {
    if (!this.socket) return;
    this.socket.disconnect();
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
