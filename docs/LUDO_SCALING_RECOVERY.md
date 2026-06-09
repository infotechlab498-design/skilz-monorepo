# Ludo scaling — recovery, idempotency, and operations

## Queue (matchmaking)

- **Memory (default):** Queue state is process-local; restarting the Node process clears all waiting tickets. Wallet refunds on `queue_disconnect` / `queue_cancelled` still apply for disconnect paths that run before exit.
- **Redis (`LUDO_QUEUE_BACKEND=redis` + `REDIS_URL`):** Tickets live in Redis lists per bucket hash. Flush uses **WATCH/MULTI/LTRIM** so dequeue is atomic; contention increments `queueFlushContention` in `/api/ops/ludo-metrics`.
- **Idempotency:** Entry fees use existing Firestore receipt keys (`queue_join`). Do not duplicate charges when retrying joins.

## Room state

- **Memory:** Authoritative gameplay state is in RAM (`RoomStateStore`).
- **Redis mirror (`LUDO_ROOM_STATE_BACKEND=redis` + `REDIS_URL`):** Each `set` on the room store writes JSON to `ludo:room:{roomId}` with TTL for **crash recovery inspection**; reads remain in-memory. Full multi-node gameplay still requires a future async store migration.
- **Firestore:** `saveLudoRoomSnapshot` / `ludoMatches` remain the durable audit trail; boot uses `loadLudoSnapshotsInto` to hydrate memory.

## GC

- Set `LUDO_ROOM_GC_MS` (e.g. `3600000`) and optional `LUDO_ROOM_GC_INTERVAL_MS` to remove **FINISHED** rooms from memory after they age out.

## Sockets

- **Redis adapter:** When `REDIS_URL` is set, Socket.IO uses `@socket.io/redis-adapter` for cross-node pub/sub. Room **logic** must still see shared state (Redis mirror + Firestore) before relying on multiple gameplay nodes.

## Load testing

See [loadtest/README.md](../loadtest/README.md) for k6-style queue smoke scripts and suggested SLOs.

## Presence (client vs server)

- **Client authority (today):** The app writes `presence/{uid}` in RTDB from `presenceService.js`, including a **12s heartbeat** while presence is active, so “online” does not stick forever when a tab goes to sleep without firing `onDisconnect`.
- **In-game status:** When entering Ludo, set `game: 'ludo'` and `status: 'in-game'` so the **available-players** API can exclude people already in a match (server reads the same RTDB path with Admin SDK).
- **Server mirror (optional):** If you later write presence from Node (Admin RTDB), document which field wins on conflict; until then treat **client heartbeat + onDisconnect** as the source of truth.

## Observability and alerts

- **JSON:** `GET /api/ops/ludo-metrics` — counters plus `queueBackend`, `roomStateBackend`, `redisUrlConfigured`.
- **Prometheus:** `GET /api/ops/ludo-metrics/prometheus` — text exposition for the same counters; scrape in staging/prod.
- **Suggested alerts:** sustained `walletJoinChargeFailures` &gt; 0; `queueFlushContention` spike when `LUDO_QUEUE_BACKEND=redis` (indicates hot bucket contention); absence of successful queue matches during peak (business signal).
