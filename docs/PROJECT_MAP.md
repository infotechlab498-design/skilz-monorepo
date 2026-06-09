# Skilz — project map

Single reference for **what lives where**, **how layers connect**, and **where to look** when changing features.  
**Monorepo root:** the directory that contains `frontend/`, `backend/`, and this `docs/` folder.

---

## 1. Problem summary (what this codebase is)

**Skilz** is a **gaming / social platform**: a **React (Vite) SPA** in `frontend/` plus a **Node.js Express** server in `backend/` with **HTTP + Socket.IO**. It provides marketing pages, **Firebase Auth**, several **realtime multiplayer games** (Ludo, Math Rush, Trivia), and **Firebase** (Firestore, RTDB, Storage, Cloud Functions) for profiles, lobbies, friends, billing dashboards, and leaderboards.

---

## 2. Architecture (high level)

| Layer | Role |
|--------|------|
| **React (`frontend/src/`)** | Routes, UI, Redux/context, Firebase client SDK, socket clients. |
| **`backend/src/server.js` + `routes/` + `controllers/`** | REST API, auth, Socket.IO. In **dev**, the SPA runs on Vite (**5173**); the API runs on **3000**. In **production**, the server serves **`frontend/dist`**. |
| **`backend/src/services/*Realtime.js`** | Isolated realtime domains: Math Rush, Trivia, Ludo (in-memory match state + events). |
| **`backend/src/data/*.json`** | Local file persistence for users, scores, rooms, Ludo snapshots (dev / simple deployments). Resolved via **`backend/src/config/paths.js`** (not `process.cwd()`). |
| **Firebase** | Auth, Firestore, RTDB, Storage, callable + scheduled **Cloud Functions** (`backend/functions/`). Rules live in **`backend/firebase/`**; **`backend/firebase.json`** is the CLI root. |

**Typical request flow (text):**

`User → React (frontend) → HTTP or Socket.IO → Express (backend) → (optional) Firebase Admin / client SDK → response or socket emit → UI`

**Multiplayer note:** Legacy trivia rooms and Ludo use **separate in-memory maps** and **namespaced socket events**. See [`MULTIPLAYER_PLATFORM.md`](./MULTIPLAYER_PLATFORM.md).

---

## 3. Folder structure (application code)

### Monorepo root

| Path | Purpose |
|------|--------|
| `package.json` | **npm workspaces** (`frontend`, `backend`). Scripts: `dev`, `build`, `start`, `lint`, `emulate:functions`. |
| `README.md` | Run and deploy overview. |
| `.env`, `.env.example` | Optional **shared** env; backend loads root `.env` then `backend/.env`. |
| `eslint.config.js` | Lint `backend/src/**/*.js` and `frontend/**/*.{js,jsx}`. |
| `docs/` | Design and runbooks (this file, multiplayer, Ludo, Math Rush, phone auth). |

### Backend — `backend/`

| Path | Purpose |
|------|--------|
| `package.json` | Express, Socket.IO, `firebase-admin`, `dotenv`, etc. |
| `src/server.js` | HTTP + Socket.IO entry (no embedded Vite in dev). |
| `src/config/paths.js` | `DATA_DIR`, `MATCHES_FILE`, `BACKEND_ROOT`, `resolveFrontendDist()`. |
| `src/routes/`, `src/controllers/`, `src/middleware/` | REST API and auth middleware. |
| `src/services/` | `dataService.js`, Firebase admin/verify, **realtime game services**, Ludo Firestore sync, debug logging. |
| `src/game-engine/` | Shared rules / economy / validation (also aliased as `@game-engine` in **frontend** Vite for Ludo client logic). |
| `src/utils/fileHandler.js` | File I/O helpers. |
| `src/data/` | JSON data files (`users.json`, `matches.json`, Ludo snapshots, etc.). |
| `functions/` | Firebase Cloud Functions v2. |
| `firebase/` | `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `database.rules.json`. |
| `firebase.json`, `.firebaserc` | Firebase CLI project config (**run `firebase` from `backend/`**). |
| `secrets/` | **Local-only** service account JSON (gitignored) — paths relative to **`backend/`**. |

**Cross-package imports:** `backend/src/services/userFirestoreAdmin.js` and `triviaRealtime.js` import small modules from **`frontend/src/`** (`constants/userProfileDefaults.js`, `lobbyPages/data.js`) so defaults and trivia questions stay single-sourced. For a stricter split later, move those files into a `shared/` workspace package.

### Frontend — `frontend/`

| Path | Purpose |
|------|--------|
| `package.json` | React, Vite, `firebase` client, `socket.io-client`, etc. |
| `vite.config.js` | Dev server **5173**, proxy `/api` + `/socket.io` → **3000**; aliases `@` → `src`, `@game-engine` → `../backend/src/game-engine`. |
| `index.html`, `public/` | SPA entry and static assets. |
| `src/main.jsx`, `src/App.jsx` | Bootstrap and **top-level routes**. |
| `src/home/`, `about/`, `contact/`, `guide/`, `leaderboard/`, `blog/`, `payment/` | Marketing, content, checkout. |
| `src/Components/` | Shared UI, auth pages, layout, `ProtectedGameRoute`, `FirebaseAuthSync`, `UserSync`. |
| `src/layout/`, `src/pages/player/`, `src/playerdashboard/` | Player dashboard. |
| `src/games/` | Ludo, Math Rush, Trivia. |
| `src/lobbyPages/` | Trivia lobby and lobby UI. |
| `src/firebase/` | Client init (`config.js`), lobby, matchmaking, presence, chat, functions client. |
| `src/api/`, `src/services/` | Client API modules and services (**not** the backend `services/` tree). |
| `src/context/`, `src/redux/`, `src/hooks/`, `src/utils/`, `src/config/` | App state and helpers. |

### Tooling / IDE (not runtime)

| Path | Purpose |
|------|--------|
| `.agents/`, `.claude/`, `.cursor/` | Agent skills, prompts, Cursor rules. |
| `.vibecheck/`, `workflows/` | Local tooling / checklists. |

---

## 4. Data flow (by feature)

1. **Auth:** Auth pages → Firebase Auth (`frontend/src/firebase/config.js`) → `FirebaseAuthSync` / `UserSync` → optional Express + JSON user bridging (`backend/src/server.js`, `backend/src/services/dataService.js`, `firestoreRegistrationGate.js`).
2. **Protected games:** `ProtectedGameRoute` → lobby/room → Socket.IO (`frontend/src/services/socketService.js`, `mathRush/lib/socket.js`) → **`backend/src/server.js`** → `mathRushRealtime.js` | `triviaRealtime.js` | `ludoRealtime.js`.
3. **Firestore (client):** `frontend/src/firebase/*.js` where rules allow.
4. **Server-authoritative data:** HTTPS callables from `frontend/src/api/cloudFunctionsApi.js` → **`backend/functions/handlers/*`**.

---

## 5. Firestore collections (from `backend/firebase/firestore.rules`)

Same logical model as before; rules file path changed. High-level map:

| Collection / path | Notes |
|-------------------|--------|
| `users/{userId}` | Profile; sensitive fields guarded on update. |
| `users/{userId}/friends/{friendId}` | Friends subcollection. |
| `matches/{matchId}` | Read if uid in `playerIds`; no client writes. |
| `lobbies/{lobbyId}` + `messages` | Lobby + chat messages. |
| `bots/{botId}` | Read-only for clients. |
| `stats/{userId}`, `transactions/{txId}`, `cards/{cardId}` | Billing-related. |
| `publicProfiles/{userId}`, `friends/{userId}` | Mirrors / denormalized. |
| `invites/{inviteId}`, `notifications/{notifId}` | Server-written. |

---

## 6. Cloud Functions (exports)

Defined in **`backend/functions/index.js`**:

- **Callables:** `getPlayerDashboard`, `getPlayerBilling`, `addTransaction`, `updateGameStats`, `getLeaderboard`, `sendChallenge`, `acceptChallenge`, `rejectChallenge`, `markNotificationRead`, `listAvailablePlayers`
- **Scheduled:** `expirePendingInvites`, `refreshLeaderboardRollup`

Handlers: **`backend/functions/handlers/`**.

---

## 7. Implementation index (quick lookup)

| Concern | Primary locations |
|---------|-------------------|
| HTTP API | `backend/src/server.js`, `backend/src/routes/*`, `backend/src/controllers/*` |
| Sockets / multiplayer | `backend/src/server.js`, `backend/src/services/mathRushRealtime.js`, `triviaRealtime.js`, `ludoRealtime.js`, `ludo/roomManager.js`, `gameRealtimeDebug.js` |
| Ludo client logic | `frontend/src/games/ludoGame/**` (imports rules via `@game-engine` from `backend/src/game-engine`) |
| Math Rush client | `frontend/src/games/mathRush/*` |
| Firebase client | `frontend/src/firebase/*`, `frontend/src/services/firebase*.js` |
| Firebase Admin (server) | `backend/src/services/firebaseAdmin.js`, `backend/functions/lib/admin.js` |
| App routing | `frontend/src/App.jsx` |

---

## 8. Debugging and verification

- **Realtime:** [`MULTIPLAYER_PLATFORM.md`](./MULTIPLAYER_PLATFORM.md) (code snippets may still show old paths — behavior is unchanged).
- **Logging:** `backend/src/services/gameRealtimeDebug.js`.

---

## 9. Optimization and scale notes

- Socket state is **in-memory per Node process**; scaling out needs Redis adapter or authoritative Firestore/RTDB.
- Keep **`backend/firebase/firestore.indexes.json`** aligned with queries.

---

## 10. How to test

1. Configure env: `backend/.env.example`, `frontend/.env.example`, and/or root `.env`.
2. From monorepo root: **`npm run dev`** → open **http://localhost:5173**.
3. Functions: **`npm run emulate:functions`** (from root) or `cd backend && firebase emulators:start --only functions`.
4. Multiplayer matrix: [`MULTIPLAYER_PLATFORM.md`](./MULTIPLAYER_PLATFORM.md).
5. Phone auth checklists in `docs/`.

---

## Related docs

| Doc | Topic |
|-----|--------|
| [`MULTIPLAYER_PLATFORM.md`](./MULTIPLAYER_PLATFORM.md) | Socket domains, events, tests |
| [`LUDO_MULTIPLAYER.md`](./LUDO_MULTIPLAYER.md) | Ludo multiplayer |
| [`LUDO_SPEC_GAP_ANALYSIS.md`](./LUDO_SPEC_GAP_ANALYSIS.md) | Ludo spec gaps |
| [`MATH_RUSH_STABILIZATION_PLAN.md`](./MATH_RUSH_STABILIZATION_PLAN.md) | Math Rush |

---

*Updated for the `frontend/` + `backend/` monorepo layout.*
