# Math Rush — Architecture Audit & Stabilization Plan

**Role:** Senior Full Stack / Game Engineer audit  
**Scope:** Math Rush integration in this repo (React/Vite + Express + JSON DB)  
**Last updated:** 2026-04-03  

This document is the **implementation plan** for stabilizing Math Rush. It reflects **actual code** in the repository, not generic templates.

---

## 1. System understanding (mental model)

### Intended flow (from `MathRushLobby.jsx` + `mathRush/api.js`)

| Layer | Responsibility |
|--------|----------------|
| **Auth** | Guest or named user in `localStorage` (`game_user`); backend user via `/api/auth/register-social` or `/api/user/:id`. |
| **REST** | Plans, user profile, Math Rush game CRUD (`/api/create`, `/api/update-score`, `/api/quit`), score leaderboard (`/api/score/*`) with **JWT** on mutating routes. |
| **Socket (expected by UI)** | `join_queue`, `reconnect_user`, listeners: `waiting_in_queue`, `game_started`, `timer_update`, `update_game`, `game_ended`. |
| **Economy** | Coins/XP on server (`data/users.json`); `api.updateScore` after match; entry fee checks client-side `(profile?.coins ?? 0) < 10` before queue. |

### Actual backend socket surface (`server.js`)

Math Rush has dedicated realtime handlers mounted via `createMathRushHandlers(io)` in `backend/src/services/mathRushRealtime.js`.

Implemented events include queue, private rooms, turn timer, game updates, end-of-game, reconnect grace, and answer submission (`join_queue`, `waiting_in_queue`, `game_started`, `timer_update`, `update_game`, `game_ended`, `reconnect_user`, `submit_answer`, `quit_game`).

**Current gap:** identity authority hardening must ensure handlers use verified socket uid (`socket.user.uid`) instead of trusting client-provided payload uid.

---

## 2. Functionality checklist (verify in repo)

### AUTH

| Item | Status | Notes |
|------|--------|--------|
| Guest auto-login | **Partial** | `game_user` created in `localStorage`; OK. |
| User persists | **Yes** | `localStorage.setItem('game_user', ...)`. |
| Backend user creation | **Yes** | `POST /api/auth/register-social`; profile normalized via `normalizeUserProfile()` so `{ user, token }` unwraps to user row. |

### GAME FLOW (real-time)

| Item | Status | Notes |
|------|--------|--------|
| Difficulty selection | **UI OK** | Local state `difficulty`. |
| Match creation / queue | **Yes** | `socket.emit('join_queue', ...)` is handled in `backend/src/services/mathRushRealtime.js`. |
| Coins deducted on queue | **Not server-enforced for Math Rush queue** | Client checks 10 coins; no socket-side deduction tied to Math Rush queue. |
| 10 rounds | **Not verified end-to-end** | Depends on server `matchState` never arriving from current server. |
| 15s timer | **Yes** | `timer_update` emitted from realtime handler turn timer. |
| Turn switching | **Yes** | `update_game` emitted by authoritative server state transitions. |

### GAME LOGIC (local utilities)

| Item | Status | Notes |
|------|--------|--------|
| `generateProblem()` | **Present** | [`src/games/mathRush/lib/utils.js`](src/games/mathRush/lib/utils.js) — easy/medium/hard. |
| `cn`, `getLevelFromXP` | **Present** | [`src/lib/utils.js`](src/lib/utils.js) (shared); Math Rush-specific math helpers stay under `mathRush/lib/`. |

### MATCH TERMINATION

| Item | Status | Notes |
|------|--------|--------|
| Quit | **Emits** `quit_game` | Server `quitGame` expects **trivia** `roomStates` shape, not necessarily Math Rush `match` shape. |
| Winner / performance | **REST path** | `api.updateScore` works **if** JWT present and match end runs; end-of-game socket flow incomplete. |

### ECONOMY & LEADERBOARD

| Item | Status | Notes |
|------|--------|--------|
| Safe JSON writes | **Yes** | `proper-lockfile` + queued writes in [`utils/fileHandler.js`](utils/fileHandler.js). |
| Leaderboard | **Yes** | `GET /api/score/leaderboard`; UI hardened for `uid`/`id` and missing names. |

---

## 3. Error taxonomy (detected)

### Build errors

- **Resolved:** Missing `src/styles/global.css` (and lobby/game imports) — fixed with [`src/styles/`](src/styles/) + forwards.  
- **Resolved:** Wrong `./lib/utils` from [`MathRushLobby.jsx`](src/games/MathRushLobby.jsx) — fixed to [`../lib/utils.js`](src/lib/utils.js) and `./mathRush/*` paths.

### Runtime errors

- **Resolved:** `profile?.highScore.toLocaleString()` threw when `highScore` undefined → fixed `(profile?.highScore ?? 0).toLocaleString()`.  
- **Resolved:** API `{ success, user, token }` stored as profile → fixed `normalizeUserProfile()`.  
- **Resolved:** Leaderboard `entry.displayName[0]` / keys → defensive fallbacks.

### Logic / architecture

- **Open (critical):** Socket identity trust boundary — some handlers historically accepted payload uid and must strictly rely on verified socket identity.  
- **Open:** [`src/games/MathRush.jsx`](src/games/MathRush.jsx) is a **placeholder**; real UI is [`MathRushLobby.jsx`](src/games/MathRushLobby.jsx) (ensure routes point to the lobby).  

### Styling migration (Tailwind → CSS)

- Math Rush uses **plain CSS** files under [`mathRush/styles/`](src/games/mathRush/styles/) (large `lobby.css`).  
- **Residual risk:** Some class names still look Tailwind-like (`bg-google-blue`, `flex`, etc.) — if those are **not** defined in your CSS, layout will look wrong. Audit `lobby.css` for every utility used in JSX.

---

## 4. Root cause analysis (summary)

| Issue | Why | File / area | Type |
|--------|-----|-------------|------|
| ENOENT global.css | `index.css` imported `./styles/*` but folder missing | [`src/index.css`](src/index.css) | Structure |
| Bad `./lib/utils` | File lives in `src/games/` not `src/games/mathRush/` | [`MathRushLobby.jsx`](src/games/MathRushLobby.jsx) | Migration / path |
| Error Boundary “Something went wrong” | Render threw on `undefined.toLocaleString()` | [`MathRushLobby.jsx`](src/games/MathRushLobby.jsx) StatsPanel | JS optional chaining |
| Wrong profile shape | `register-social` wraps user | [`MathRushLobby.jsx`](src/games/MathRushLobby.jsx) + API | API contract |
| No matchmaking | Events not implemented | [`server.js`](server.js) | **Missing feature** |
| JWT on `/api/score/update` | Guest must complete `createUser` to set `skilz_token` | [`mathRush/api.js`](src/games/mathRush/api.js) | Security / flow |

---

## 5. Step-by-step fix plan (execution order)

1. **Routing:** Point Math Rush route to `MathRushLobby` (or merge placeholder `MathRush.jsx` with redirect).  
2. **Socket — choose one:**  
   - **A)** Implement Math Rush handlers on server (`join_queue`, match rooms, bot or PvP, emit `game_started`, `timer_update`, `update_game`, `game_ended`), **or**  
   - **B)** Refactor client to use existing `joinRoom` + `submitAnswer` trivia protocol and align `match` object shapes.  
3. **Economy:** On match start, deduct entry fee **once** on server (socket or REST), idempotent reconnection.  
4. **Scoring:** Keep authoritative totals server-side; client only sends **answers** / **intents**.  
5. **Split `MathRushLobby.jsx`:** Extract `Lobby`, `GamePanel`, `StatsPanel`, `LeaderboardPanel`, `MatchResultModal` into `src/games/mathRush/components/`.  
6. **CSS audit:** Replace or define any remaining Tailwind-like tokens used in class strings.  
7. **Firebase:** Keep [`src/services/firebase.js`](src/services/firebase.js) stubbed; uncomment only when config exists.

---

## 6. Auto-generated / required files (status)

| File | Status |
|------|--------|
| [`src/lib/utils.js`](src/lib/utils.js) | Exists: `cn`, `getLevelFromXP`. |
| [`src/games/mathRush/lib/utils.js`](src/games/mathRush/lib/utils.js) | Exists: `generateProblem`, `calculateXP`, `getLevelFromXP`. |
| [`src/styles/global.css`](src/styles/global.css) | Exists (+ lobby/game forward imports). |
| [`src/games/mathRush/api.js`](src/games/mathRush/api.js) | REST client with `authHeaders`. |

**Recommendation:** Either **re-export** `generateProblem` from `src/lib/utils.js` for a single import surface, or keep game logic strictly under `mathRush/lib/utils.js` (current approach is fine).

---

## 7. Backend hardening (current)

- **Locking:** `proper-lockfile` in [`services/dataService.js`](services/dataService.js) and [`safeReadWrite`](utils/fileHandler.js).  
- **Queue:** [`safeReadWriteQueued`](utils/fileHandler.js) + `writeJsonFile` uses it.  
- **Security:** JWT on protected REST routes; [`scoreController`](controllers/scoreController.js) checks `req.userId` vs score target; trivia `submitAnswer` computes score server-side in [`server.js`](server.js).

**Gap:** Math Rush-specific socket game loop does not yet enforce rules server-side.

---

## 8. Migration validation (TS → JS)

- Math Rush codepaths are **.jsx** / **.js**.  
- No `interface` / `type` imports required for Math Rush entry.  
- **Manual prop validation:** Prefer runtime checks or PropTypes if you add shared components during refactor.

---

## 9. Tailwind → CSS validation

- [ ] Grep `MathRushLobby.jsx` and `mathRush/*.jsx` for class names; confirm each exists in `lobby.css` / `game.css` or global.  
- [ ] Framer `motion` usage is independent of Tailwind — OK.  

---

## 10. Refactoring targets

**Priority:** Split [`MathRushLobby.jsx`](src/games/MathRushLobby.jsx) (~1200+ lines) into:

```
src/games/mathRush/
  components/
    Lobby.jsx
    GamePanel.jsx
    StatsPanel.jsx
    LeaderboardPanel.jsx
    MatchResultModal.jsx
    QuitConfirmationModal.jsx
  MathRushLobby.jsx   ← thin composition + providers only
```

---

## 11. Execution simulation (expected)

```bash
npm install
npm run dev   # or: concurrently vite + node server.js
```

- **Build:** `npm run build` should pass after CSS/import fixes.  
- **Runtime:** Math Rush **menu/auth/leaderboard** can work; **full multiplayer loop** requires **Step 5.2** (socket implementation or protocol alignment).

---

## 12. Firebase (current wiring)

- [`src/firebase/config.js`](src/firebase/config.js) — app Auth + Firestore + optional RTDB.  
- [`src/services/userService.js`](src/services/userService.js) — `subscribeUserProfile` for `users/{uid}` snapshots.  
- [`src/Components/UserSync.jsx`](src/Components/UserSync.jsx) — mounts globally in `App.jsx`; merges Firestore profile into Redux via `syncUserFromFirestore` / `buildUserStatePayloadFromUserDoc` in [`src/redux/features/userSlice.js`](src/redux/features/userSlice.js).  
- Economy mutations: callable `updateGameStats` via [`src/api/cloudFunctionsApi.js`](src/api/cloudFunctionsApi.js) (not direct client writes to protected fields).

---

## Final summary tables

### Critical errors (open vs closed)

| Critical | Status |
|----------|--------|
| Missing `src/styles/*` | **Fixed** |
| Wrong Math Rush imports | **Fixed** |
| Profile / `highScore` crash | **Fixed** |
| Math Rush socket matchmaking | **Implemented** |

### Missing features

- Server-side Math Rush queue + game loop + timer sync.  
- Route wiring from placeholder `MathRush.jsx` to full lobby (if not already in `App.jsx`).

### Working features

- Guest + `register-social` user creation (with token).  
- REST leaderboard + score update (with JWT).  
- `generateProblem` difficulty logic (client-side).  
- JSON persistence with locking + write queue.

### Security fixes (applied direction)

- JWT on sensitive REST routes; score update tied to token subject.  
- Trivia `submitAnswer` uses server-side score aggregation.  

---

## Next action (single most important)

**Implement Math Rush Socket.IO protocol on the server** *or* **change the client to use the existing trivia `joinRoom` flow** with a shared `match` schema. Until one of these is done, **“Find Opponent” will not start a real match** even though the UI looks complete.

---

*This file is the living implementation plan; update it when socket work or refactors land.*
