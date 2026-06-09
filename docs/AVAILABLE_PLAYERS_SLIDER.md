# Available players slider (Ludo)

## Runtime paths

- **Client RTDB:** `presence/{uid}` — heartbeat + `onDisconnect` (see `frontend/src/services/presenceService.js`).
- **Server RTDB (Admin):** `userState/{uid}` — `inQueue`, `ludoRoomId`, `inPlayingMatch`, `socketCount`, `updatedAt` (see `backend/src/services/presence/userStateRtdb.js`).
- **HTTP:** `GET /api/online-players` and `GET /api/ludo/available-players` (friends-only, capped at 50). Query `includeQueued=1` includes friends currently in the matchmaking queue.

## Environment

| Variable | Purpose |
|----------|---------|
| `FIREBASE_DATABASE_URL` | Required for Admin RTDB reads/writes if not in service account JSON. |
| `PRESENCE_MAX_AGE_MS` | Max age of `presence.lastSeen` to treat friend as online (default 45000). |
| `SOCKET_PRESENCE_GRACE_MS` | Delay before marking user offline after last socket disconnect (default 8000). |

## RTDB security rules (sketch)

- **`presence/{uid}`:** allow **write** only if `auth.uid === uid` (client heartbeat).
- **`userState/{uid}`:** **deny** client writes; only Admin SDK (server) writes. Optionally allow **read** for `auth.uid === uid` for debugging.

## Manual QA

1. Two accounts, mutual friends: A opens Ludo lobby — B appears if B is online (socket + fresh `lastSeen`), not in queue, not in a Ludo room.
2. B joins queue — B disappears from A’s list within one poll or on `onlinePlayers:update`.
3. B gets match / enters a room — B disappears.
4. B leaves room or game ends — B reappears after state clears and next fetch.
5. B closes all tabs — after grace + staleness, B disappears.
