# Load testing — Ludo queue (k6)

Prerequisites: [k6](https://k6.io/) installed, backend running with valid Firebase socket auth (use a test harness token or stub auth for CI).

## Suggested SLOs (tune after baseline)

- **Queue flush P99** under 500ms with 500 concurrent queue tickets across few buckets.
- **Zero duplicate `ludo:matchFound`** for the same `roomId` from one flush (assert in client script).

## Example: many sockets (pseudo-script)

Real Firebase ID tokens expire; for CI, prefer a dedicated **test user** and refresh tokens outside k6, or gate a `LOADTEST_BYPASS` env **only in staging** (not implemented in this repo by default).

Example outline:

1. Open N WebSocket connections to the same Vite proxy origin (`/socket.io`).
2. Emit `ludo:queueJoin` with identical criteria so all land in one bucket.
3. Measure time until each client receives `ludo:matchFound`.

See `k6-ludo-queue.js` for a skeleton `ws` scenario you can adapt once auth is sorted for your environment.
