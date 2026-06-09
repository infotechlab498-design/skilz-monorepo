/**
 * k6 WebSocket skeleton for Ludo queue load (adapt auth + URL for your env).
 * Run: k6 run loadtest/k6-ludo-queue.js
 *
 * This file is intentionally minimal — wire `token` from your staging secret
 * or use k6 secrets: https://k6.io/docs/using-k6/environment-variables/
 */
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

const URL = __ENV.LUDO_WS_URL || 'ws://127.0.0.1:5173/socket.io/?EIO=4&transport=websocket';

export default function () {
  const token = __ENV.LUDO_FIREBASE_ID_TOKEN || '';
  const res = ws.connect(URL, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, (socket) => {
    socket.on('open', () => {
      socket.send('40'); // Socket.IO connect placeholder — real client uses engine.io framing; use a proper k6/xk6/socketio extension or HTTP polling in practice
    });
    socket.on('message', (msg) => {
      check(msg, { received: (m) => m !== undefined });
    });
    socket.setTimeout(() => socket.close(), 5000);
  });
  check(res, { status: (r) => r && r.status === 101 });
}
