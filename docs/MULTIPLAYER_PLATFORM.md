# Multiplayer platform — architecture, fixes, and verification

This document summarizes how **Ludo**, **Trivia**, and **Math Rush** coexist on one Socket.IO server, what was wrong, what was fixed, and how to verify behavior.

## Architecture (three isolated realtime domains)

| Domain | Server module | In-memory state | Primary transport |
|--------|----------------|-----------------|-------------------|
| **Legacy trivia room** (older lobby) | `server.js` `joinRoom` / `leaveRoom` / `quitGame` | `roomStates` `Map` | `joinRoom`, `submitAnswer`, `leaveRoom`, `quitGame` |
| **Math Rush** | `services/mathRushRealtime.js` | `queue`, `matches`, timer Maps | `join_queue`, `mathrush_*`, `submit_answer`, `reconnect_user`, `quit_game` |
| **Trivia (modern)** | `services/triviaRealtime.js` | `queue`, `matches`, timer Maps | `trivia_join_queue`, `trivia_*`, `trivia_reconnect_user`, `reconnect_user` (alias) |
| **Ludo** | `services/ludoRealtime.js` | `ludoRoomStates` (in `server.js`, **not** `roomStates`) | `ludo_*`, `ludo:joinRoom`, `ludo:rollDice`, … |

**Important:** Ludo was intentionally moved to **`ludoRoomStates`** so a generic **`leaveRoom`** in `server.js` never deletes an active Ludo match keyed by the same string.

### Part 1 — Room system (legacy `joinRoom` / `server.js`)

- **`joinRoom`**: validate `roomId` + `userId` **before** `socket.join` (avoids joining `undefined`).
- **`legacyRoomSocketIndex`**: maps `socket.id` → `{ roomId, userId }` for **`disconnect`** cleanup so legacy rooms do not keep ghost players.
- **`applyLegacyPlayerGone`**: same DB rules as `leaveRoom` when the room becomes empty (cancel only if persisted row is `waiting`).
- **`leaveRoom` / `quitGame`**: clear the index entry; **`submitAnswer`**: ignore missing `roomId` / `userId`.
- **`[DEBUG]`** `console.log` lines for room create, join, disconnect-driven player removal (scoped to legacy path only).

---

## Critical bug fixed: `leaveRoom` (server.js)

### What was wrong

```268:277:c:/SkilzProject/skilz/server.js
// BEFORE (behavior): always roomStates.delete(roomId) — removed the entire
// legacy match when *one* player left, stranding the other player with no state.
```

**Impact:** In any flow still using legacy **`joinRoom` / `leaveRoom`** (e.g. parts of Trivia lobby), the first player to leave **wiped the room for everyone**, not just their seat.

### Fix

- Remove `userId` from `state.players` when `leaveRoom` fires.
- **`roomStates.delete(roomId)`** only when **no players remain**.
- If **`userId` is missing**, delete the room (backward-compatible “hard leave”).
- Emit **`playerLeft`** with the remaining `players` list when someone leaves but the room continues.
- **`platformLog`** calls for observability (`REALTIME_DEBUG` — see `gameRealtimeDebug.js`).

Legacy **`joinRoom`** also guards **`Array.isArray(state.players)`** before mutating.

---

## Reconnect unification

| Game | Primary event | Notes |
|------|----------------|-------|
| Math Rush | `reconnect_user` (uid string) | Unchanged; scans **Math Rush** `matches` only. |
| Trivia | `trivia_reconnect_user` | Still supported. |
| Trivia | `reconnect_user` | **Added** — same handler body as Trivia reconnect; runs **after** Math Rush handler on the same socket (both can attach; only the relevant `matches` Map contains the player). |
| Ludo | `ludo_join_room` | Idempotent for lobby + playing re-seat. |
| Ludo | `ludo_reconnect_user` | **Added** — alias with **identical** handler to `ludo_join_room` (explicit client name after refresh). |

---

## Debug logging

`services/gameRealtimeDebug.js`:

- **`platformLog`** — legacy server rooms (`joinRoom` / `leaveRoom` / `quitGame`).
- **`ludoLog`** — Ludo create, join/reconnect, start, dice, move, game end.
- **`debugRealtime('TRIVIA' | 'MATH_RUSH', …)`** — high-signal checkpoints (queue, game start).
- Set **`REALTIME_DEBUG=0`** in the environment to silence **`[DEBUG][...]`** lines only (tagged `TRIVIA` / `MATH_RUSH` console lines remain unless you remove them separately).

---

## Known intentional differences (not bugs)

1. **Event naming** is not fully unified across games (`trivia_*` vs `mathrush_*` vs `ludo_*`) to avoid breaking existing clients; aliases (`reconnect_user` for Trivia, `ludo_reconnect_user` for Ludo) reduce friction.
2. **Two Maps** for rooms (`roomStates` vs `ludoRoomStates`) are intentional separation, not duplication to eliminate.
3. **Legacy** `joinRoom` remains for older Trivia paths; new games should prefer their namespaced events.

---

## Manual test matrix (run against `npm run dev:all` or production build)

| Feature | Steps | Expected |
|---------|--------|----------|
| **Legacy room leave** | Two clients `joinRoom` same `roomId`; one `leaveRoom` with `userId` | Second client still has `roomStates` entry; `playerLeft` emitted; room deleted only when empty. |
| **Math Rush 2P** | Two humans `join_queue` same difficulty | Same `roomId`, `game_started`, turns alternate. |
| **Math Rush bot ~10s** | One human `join_queue`, wait | Bot match after `BOT_MATCH_DELAY_MS` (10s). |
| **Math Rush private** | `mathrush_create_private` + guest `mathrush_join_private` | No bot in waiting; `playing` after guest joins. |
| **Math Rush reconnect** | Disconnect tab during `playing`; reconnect emit `reconnect_user` | `mathrush_reconnect_cleared` + `update_game`. |
| **Trivia queue / bot** | `trivia_join_queue` (no `soloBot`), wait 10s | Bot fallback. |
| **Trivia private** | `trivia_create_private` + `trivia_join_private` | No queue bot; game starts with two humans. |
| **Trivia reconnect** | `trivia_reconnect_user` or **`reconnect_user`** | State restored. |
| **Ludo online** | `ludo_create_room` → share URL → `ludo_join_room` / `ludo_reconnect_user` | Lobby sync; host `ludo_start_game`; board sync; refresh rejoin. |
| **Ludo local** | `/ludo/:gameId` session + `ludo:joinRoom` | Still works; do not use `ludo_join_room` for that id if it collides with an online LOBBY (server returns `USE_ONLINE_JOIN`). |

### Status template (fill after you run tests)

| Feature | Status |
|---------|--------|
| Room system (legacy + per-game Maps) | PASS/FAIL |
| Multiplayer (each game) | PASS/FAIL |
| Bot system (~10s queue) | PASS/FAIL |
| Sync (authoritative server emits) | PASS/FAIL |
| Reconnect (grace + rejoin) | PASS/FAIL |

---

## Final verdict (automated vs manual)

Automated checks in this pass: **service modules load**, **ESLint** on touched files (run locally).  
Full **PASS** for “production launch” requires completing the manual matrix above in your environment.

## Client stability pass (Ludo + Trivia + Math Rush)

| Area | Change |
|------|--------|
| **Ludo Socket URL** | `src/services/socketService.js` uses `import.meta.env.VITE_SOCKET_URL \|\| window.location.origin` (same as Math Rush) so dev traffic uses the Vite `/socket.io` proxy when the app runs on `:5173`. |
| **Math Rush private room** | `MathRushGameRoom.jsx` awaits `ensureSocketConnected()` before emitting `reconnect_user` + `mathrush_join_private` (ordered join after listeners attach). |
| **Trivia private room** | `TriviaGameRoom.jsx` same: await connect, then `reconnect_user` + `trivia_reconnect_user` + `trivia_join_private`. |
| **Ludo online room** | `LudoGameRoom.jsx` emits `ludo_reconnect_user` then `ludo_join_room` after the socket is connected (refresh / cold-open safe). |

### Recommended verification (manual)

| Feature | Status |
|---------|--------|
| Room system (legacy + maps) | Run matrix rows above |
| Math Rush (queue + private + reconnect) | |
| Trivia (queue + private + reconnect) | |
| Ludo (online URL + local session) | |
| Socket in dev (`5173` → proxy → `3000`) | |

## Dev: `ECONNREFUSED` on `/socket.io` (Vite → API)

**Cause (high probability):** In `server.js`, `httpServer.listen(3000)` used to run **after** `await createViteServer()`. Vite init can take several seconds, so **nothing listened on :3000** while the separate Vite UI on `:5173` was already proxying Socket.IO → proxy **`ECONNREFUSED`**.

**Fix applied:** In non-production, **`listen()` runs first**, then the embedded Vite middleware is attached. Port **3000** accepts API + Socket.IO immediately.

**Proxy target:** `vite.config.js` uses **`http://127.0.0.1:3000`** (not `localhost`) to reduce IPv4/IPv6 (`::1`) quirks on some Windows setups.

**Clients:** Math Rush `lib/socket.js` and `socketService.js` use Socket.IO reconnection options so brief gaps still recover.

**Verify:** `curl -sI "http://127.0.0.1:3000/socket.io/?EIO=4&transport=polling"` should return HTTP **200** or **400** (Socket.IO framing), never connection refused, once the API process has started.

*— Last updated: listen-before-Vite fix, 127.0.0.1 proxy, client reconnect options.*
