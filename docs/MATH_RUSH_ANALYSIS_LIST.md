# Math Rush Analysis List

**Purpose:** capture the current Math Rush startup problem, the main weak points in the flow, and the safest fix boundaries so other platform games are not disturbed.

**Current user-facing error**

When the player clicks the Math Rush start button, the frontend can show:

`Cannot reach the game server. Run the API on port 3000 (npm run dev / node server) and keep using the Vite dev URL.`

## 1. Current system understanding

### Frontend flow

- `frontend/src/games/MathRushLobby.jsx` is the real Math Rush lobby screen.
- The main start action is `startMatch()`.
- `startMatch()` first checks auth and coins, then calls `ensureSocketConnected()`.
- If the socket connects, it emits `join_queue`.
- On success, the lobby expects:
  - `waiting_in_queue`
  - `game_started`
  - `math_rush:error`
- After a match starts, the app navigates to `frontend/src/games/mathRush/MathRushGameRoom.jsx`.

### Backend flow

- `backend/src/server.js` mounts Math Rush realtime handlers through `createMathRushHandlers(io)`.
- `backend/src/services/mathRushRealtime.js` already supports:
  - `join_queue`
  - `leave_queue`
  - `mathrush_create_private`
  - `mathrush_join_private`
  - `submit_answer`
  - `quit_game`
  - `reconnect_user`
- The backend also includes bot fallback, private room flow, reconnect grace, turn timer, and winner calculation.

### Dev networking flow

- `frontend/vite.config.js` proxies `/api` and `/socket.io` to `http://127.0.0.1:3000`.
- `frontend/src/games/mathRush/lib/socket.js` uses `window.location.origin` by default, which is correct only if Vite proxy is active.
- This means:
  - frontend should run on Vite, normally `http://localhost:5173`
  - backend must also be running on `127.0.0.1:3000`

## 2. Confirmed primary blocker

### Blocker A: backend is not running on port 3000 during local testing

This is the immediate reason the start button fails right now.

Evidence:

- The active terminal shows Vite is running on `http://localhost:5173`.
- The same terminal output repeatedly shows proxy errors to `127.0.0.1:3000`.
- Because the backend is absent, `ensureSocketConnected()` fails before `join_queue` is even sent.

Impact:

- Math Rush quick match cannot start.
- Private invite flow cannot start.
- Any same-origin Socket.IO game flow depending on the backend will also fail while the API is down.

Severity: **Critical**

## 3. Weak points found in Math Rush

### Weak point 1: operational dependency is easy to miss

- The current error only appears after clicking start.
- The lobby allows the player to reach the start action even when the game server is unavailable.
- There is no proactive "server offline" indicator before the player spends time selecting difficulty.

Why this matters:

- It feels like the game is broken, even when the real issue is only missing backend startup.
- This creates confusion for Math Rush and can also confuse debugging of other realtime games.

Severity: **High**

### Weak point 2: outdated project documentation can mislead future fixes

- `docs/MATH_RUSH_STABILIZATION_PLAN.md` says Math Rush socket handlers are missing.
- The current backend code now does include Math Rush realtime handlers.

Why this matters:

- A developer could waste time trying to rebuild handlers that already exist.
- This can cause incorrect changes in shared server code and accidentally disturb other games.

Severity: **High**

### Weak point 3: `MathRushLobby.jsx` is too large and mixes multiple concerns

- The lobby component handles auth bootstrap, profile loading, socket events, queue state, friend invites, UI rendering, and navigation in one file.

Why this matters:

- Debugging becomes slow and risky.
- A small gameplay fix can accidentally affect auth, invites, or shared lobby behavior.
- It raises the chance of regressions when trying to stabilize the start flow.

Severity: **Medium**

### Weak point 4: start button text does not fully match the implemented behavior

- The CTA says `Quick match (10s → bot)`.
- The backend does support a 10-second bot fallback, but only after socket connection and queue registration succeed.
- If the backend is offline, the player never reaches that fallback path.

Why this matters:

- The promise in the UI feels broken to the player.
- The wording suggests the game is self-contained, but it still depends on the realtime server.

Severity: **Medium**

### Weak point 5: private room flow is functional in code but fragile in practice

- Private match creation also depends on a live backend socket connection.
- The invite URL uses the current browser origin, which is fine for local Vite use, but still depends on the backend proxy path working.

Why this matters:

- If the local setup is incomplete, both public and private Math Rush flows fail in similar ways.
- The user may believe the friend invite system itself is broken when the real issue is server availability.

Severity: **Medium**

### Weak point 6: shared socket transport means environment fixes must be isolated carefully

- Math Rush, Trivia, and some shared realtime logic all rely on the same backend server and dev proxy pattern.
- Any change to shared socket bootstrap or shared proxy assumptions can affect other games.

Why this matters:

- Fixes for Math Rush should prefer local component checks and Math Rush-specific handlers first.
- Shared infrastructure changes should be avoided unless clearly necessary.

Severity: **High**

## 4. Likely error categories

### Environment / startup errors

- Backend server not running on port `3000`
- Vite running alone without monorepo root `npm run dev`
- Proxy cannot reach `127.0.0.1:3000`

### Game flow errors

- Player can click start without a reachable realtime server
- Queue flow depends completely on socket availability
- Private room flow depends completely on socket availability

### Maintainability errors

- Old Math Rush audit document is stale
- Lobby file is oversized and hard to reason about safely

## 5. Safe boundaries to protect other platform games

These areas are safe-first for Math Rush stabilization:

- `frontend/src/games/MathRushLobby.jsx`
- `frontend/src/games/mathRush/MathRushGameRoom.jsx`
- `frontend/src/games/mathRush/lib/socket.js` only if changes are Math Rush-safe and do not alter shared URL behavior globally
- `backend/src/services/mathRushRealtime.js`
- Math Rush documentation under `docs/`

These areas should be changed carefully because they are shared:

- `frontend/vite.config.js`
- `backend/src/server.js`
- shared auth/session sync
- any generic socket bootstrap used by Trivia or Ludo

## 6. First analysis conclusion

The current start-button failure is **real**, but the main root cause is **not** that Math Rush lacks backend game handlers. The immediate root cause is that the frontend is running without the backend server on `127.0.0.1:3000`, so the socket connection fails before matchmaking begins.

The deeper Math Rush weaknesses are:

- poor preflight detection of server availability
- stale project documentation
- oversized lobby logic
- fragile developer experience around local startup

## 7. Recommended next analysis/fix order

1. Add a preflight/server-availability check in the Math Rush lobby so the player gets clear status before pressing start.
2. Verify Math Rush end-to-end with both quick match and private room while the backend is running.
3. Update the stale Math Rush stabilization document so it matches the current backend reality.
4. Refactor `MathRushLobby.jsx` into smaller pieces only after the start flow is stable.
