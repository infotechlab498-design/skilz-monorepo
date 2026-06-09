# PROJECT SUMMARY: Skilz

## 1) Project Overview

Skilz is a React + Vite multiplayer gaming platform with a Node.js/Express + Socket.IO backend and Firebase as its cloud data/auth layer.  
The system combines:

- Public web pages (`Home`, `About`, `Guide`, `Leaderboard`, blogs)
- Authenticated gameplay (Trivia, Math Rush, Ludo)
- Player dashboard features (profile, friends/challenges, billing, settings, password change)
- Mixed realtime infrastructure (Socket.IO game state + Firebase presence/chat/data)

The architecture currently uses **two backend paradigms in parallel**:

- Firebase-native flows (Auth, Firestore, Cloud Functions, RTDB presence)
- Express + JSON/file-backed runtime flows (legacy or hybrid gameplay/wallet paths)

This provides fast iteration but introduces consistency and security gaps (detailed below).

---

## 2) Architecture Diagram (Text-Based)

```text
[React/Vite Frontend]
   |
   |-- Firebase Client SDK
   |     |- Auth (sign in/up, session, password updates)
   |     |- Firestore (users, stats, cards, social, chat, profile docs)
   |     |- Realtime DB (presence/*)
   |     |- Storage (voice notes, profile images)
   |     `- Functions httpsCallable (dashboard/billing/social/leaderboard/game-stats)
   |
   |-- Socket.IO Client -----------------------------+
   |                                                 |
   `-- REST calls (/api/*) -----------------------+  |
                                                  |  |
[Node/Express Backend (backend/src/server.js)]    |  |
   |- Routes/controllers/services                 |  |
   |- Socket.IO event handlers                    |  |
   |- In-memory match state + JSON files          |  |
   `- Optional Firebase Admin integration         |  |
                                                  |  |
[Firebase Cloud Functions (backend/functions)] <--+  |
   |- Callable APIs (billing/social/stats/leaderboard)
   `- Scheduled jobs (invite expiry, leaderboard rollup)

[Firebase Data Layer]
   |- Auth
   |- Firestore
   |- RTDB (presence)
   `- Storage
```

---

## 3) Folder Structure Explanation

### Frontend (`frontend/src`)

- `App.jsx`: Main route graph and protected routes.
- `Components/authPages/*`: Sign-in/sign-up/reset/OTP flows.
- `services/authService.js`, `services/firebaseAuth.js`: Auth orchestration + error mapping.
- `Components/FirebaseAuthSync.jsx`, `Components/UserSync.jsx`: Session bootstrap and live user sync.
- `playerdashboard/*`: Dashboard pages (`PlayerDashboardHome`, `PlayerBilling`, `PlayerFriendList`, `PlChangePassword`, etc.).
- `api/*`: Client API wrappers for callables and Firestore reads/writes.
- `games/*`:
  - Ludo: `LudoLobby.jsx`, `LudoGameRoom.jsx`, `Ludo.jsx`, `games/ludoGame/*`
  - Math Rush: `MathRushLobby.jsx`, `games/mathRush/*`
  - Trivia: `TriviaGameRoom.jsx`, `lobbyPages/TriviaLobby.jsx`
- `firebase/*`: Firebase client setup, function clients, chat helpers.
- `redux/features/*`: Auth/user/game state slices.

### Backend (`backend/src`)

- `server.js`: Main Express + Socket.IO bootstrap, core route mounting, socket handlers.
- `routes/*`, `controllers/*`: REST API surface (`/api/*`) for games, checkout, scores, Firestore user updates.
- `services/*`:
  - `mathRushRealtime.js`, `triviaRealtime.js`, `ludoRealtime.js`: Realtime multiplayer logic.
  - `dataService.js`: JSON-file persistence (`users.json`, `matches.json`, `game_rooms.json`, etc.).
  - `firebaseAdmin.js`, `userFirestoreAdmin.js`: Optional Admin SDK operations.
- `middleware/auth.js`: JWT + Firebase token validation middleware.
- `game-engine/*`: Ludo engine/AI/economy modules.

### Cloud Functions + Firebase (`backend/functions`, `backend/firebase`)

- `backend/functions/index.js`: Callable exports + scheduled jobs.
- `backend/functions/handlers/*`: Domain handlers (`dashboard`, `payments`, `game`, `social`, `leaderboard`).
- `backend/firebase/firestore.rules`: Firestore security rules.
- `backend/firebase/database.rules.json`: RTDB presence rules.
- `backend/firebase/storage.rules`: Storage rules.

---

## 4) Game Systems Breakdown

## Trivia

- **Frontend files**: `lobbyPages/TriviaLobby.jsx`, `games/TriviaGameRoom.jsx`, chat components.
- **Realtime transport**: Socket.IO events (`trivia_join_queue`, `trivia_submit_answer`, reconnect/private room events).
- **Backend handler**: `backend/src/services/triviaRealtime.js`.
- **Data behavior**:
  - Match state mostly in memory.
  - Uses Firebase chat/presence in lobby contexts.
  - Question data currently coupled to frontend source file (backend imports frontend data).
- **Status**: `⚠️ Partially connected` (hybrid realtime + Firebase, strong coupling risk).

## Math Rush

- **Frontend files**: `games/MathRushLobby.jsx`, `games/mathRush/MathRushGameRoom.jsx`, `games/mathRush/api.js`.
- **Realtime transport**: Socket.IO (`join_queue`, `submit_answer`, private/reconnect events).
- **Backend handler**: `backend/src/services/mathRushRealtime.js`.
- **Data behavior**:
  - Queue/room runtime in memory.
  - Some stat updates via callable `updateGameStats`.
  - `games/mathRush/api.js` still contains stubbed leaderboard behavior.
- **Status**: `⚠️ Partially connected` (realtime works, some APIs remain stub/hybrid).

## Ludo

- **Frontend files**: `games/LudoLobby.jsx`, `games/LudoGameRoom.jsx`, `games/Ludo.jsx`, `games/ludoGame/*`.
- **Realtime transport**: Socket.IO (`ludo_create_room`, `ludo_join_room`, roll/move events, reconnect).
- **Backend handler**: `backend/src/services/ludoRealtime.js`.
- **Data behavior**:
  - In-memory room authority + snapshot files.
  - Optional Firestore sync on match-end (`ludoFirestoreSync.js`, env-gated wallet sync).
  - Client has both modern and legacy/experimental pathways.
- **Status**: `⚠️ Partially connected` (core realtime present; persistence split between JSON and Firebase).

---

## 5) Authentication System

- **Primary auth provider**: Firebase Auth.
- **Frontend integration**:
  - `services/authService.js` handles auth lifecycle and Redux sync.
  - `Components/FirebaseAuthSync.jsx` restores sessions.
  - `Components/authPages/*` for sign-up/sign-in/forgot/reset.
  - `frontend/src/api/changePasswordApi.js` + `PlChangePassword.jsx` handles secure password changes with re-auth.
- **Backend auth**:
  - `backend/src/middleware/auth.js` accepts JWT and can validate Firebase ID token (REST-based check).
  - Some backend routes remain unauthenticated or legacy.
- **Modes present in project**:
  - Email/password (active)
  - Social provider flows (active in auth service)
  - Phone/OTP helper modules exist
  - Legacy Express auth endpoints still in codebase (some return 410/gated)

**Assessment**: `⚠️ Partially consolidated` — Firebase auth is primary, but backend still has legacy auth branches and uneven endpoint enforcement.

---

## 6) Firebase Integration Map

## Firebase Auth

- **Used in**: sign-in/up pages, auth service, protected routes, password change, user sync.
- **Core dependent files**:
  - `frontend/src/services/authService.js`
  - `frontend/src/services/firebaseAuth.js`
  - `frontend/src/Components/FirebaseAuthSync.jsx`
  - `frontend/src/Components/ProtectedGameRoute.jsx`
  - `frontend/src/api/changePasswordApi.js`

## Firestore

### Core collections observed

- `users`
- `users/{uid}/friends`
- `stats`
- `transactions`
- `cards`
- `publicProfiles`
- `friends`
- `invites`
- `notifications`
- `matches`
- `lobbies`
- `lobbies/{lobbyId}/messages`
- `dmThreads`
- `dmThreads/{threadId}/messages`
- `faqs`
- `leaderboardRollup/current` (scheduled write)

### Feature usage

- Profile/dashboard/billing/friends/challenges/notifications/leaderboards/chat/direct messages.
- Cloud Functions handlers rely on Admin SDK for writes to privileged collections.

## Realtime Database

- **Path usage**: `presence/{uid}`.
- **Used by**:
  - Frontend presence services/hooks.
  - Cloud Function `listAvailablePlayers`.
- **Purpose**: online availability and friend presence detection.

## Cloud Functions (Callable + Scheduled)

From `backend/functions/index.js`:

- Callable:
  - `getPlayerDashboard`
  - `getPlayerBilling`
  - `addTransaction`
  - `updateGameStats`
  - `getLeaderboard`
  - `sendChallenge`
  - `acceptChallenge`
  - `rejectChallenge`
  - `markNotificationRead`
  - `listAvailablePlayers`
- Scheduled:
  - `expirePendingInvites` (hourly)
  - `refreshLeaderboardRollup` (6-hour)

**Important runtime note**: dashboard UI currently fetches via direct Firestore reads rather than callable `getPlayerDashboard`.

---

## 7) Socket.IO / Realtime System

Socket server is initialized in `backend/src/server.js`, then game-specific handler modules attach per connection.

### Event domains

- **Legacy/shared**: `joinRoom`, `submitAnswer`, `leaveRoom`, `quitGame`
- **Friend-match**: `friend_match_join` (Firestore-backed check)
- **Math Rush**: queue/private/reconnect/answer events
- **Trivia**: queue/private/reconnect/answer events
- **Ludo**: room create/join/start/roll/move/reconnect events

### Realtime architecture characteristics

- Primary game authority is server-side in memory.
- Some snapshots persisted to JSON files.
- Firebase integration is supplementary (stats/presence/social), not full realtime authority.
- Horizontal scaling risk exists due to in-memory room state and process-local structures.

---

## 8) Feature-to-File Mapping Table

| Feature | Frontend Entry Points | Backend/API/Functions | Firebase Data | Connection Status |
|---|---|---|---|---|
| Authentication | `Components/authPages/*`, `services/authService.js` | `middleware/auth.js`, `/api/auth/*` | Auth, `users` | ⚠️ Partial (legacy auth coexistence) |
| Protected gameplay routing | `App.jsx`, `ProtectedGameRoute.jsx` | Socket handlers in `server.js` | Auth session gate | ✔ Connected |
| Dashboard home | `playerdashboard/PlayerDashboardHome.jsx`, `api/dashboardApi.js` | Callable exists but mostly bypassed | Firestore `users`,`stats` | ✔ Connected (direct Firestore) |
| Billing/wallet | `playerdashboard/PlayerBilling.jsx`, `api/playerBillingApi.js` | `getPlayerBilling`, `addTransaction` callables | `stats`, `transactions`, `cards` | ⚠️ Partial (payment verification gap) |
| Friends/challenges | `PlayerFriendList.jsx`, `api/friendsDashboardApi.js` | `social.js` callables | `friends`, `publicProfiles`, `invites`, `notifications`, RTDB presence | ✔ Connected |
| Notifications | `PlayerTopbarNotifications.jsx` | `markNotificationRead` callable | `notifications` | ✔ Connected |
| Leaderboard | `leaderboard/Leaderboard.jsx`, `api/leaderboardApi.js` | `getLeaderboard`, rollup job | `users`, `leaderboardRollup` | ⚠️ Partial (dual source + rollup not exposed) |
| Trivia game | `TriviaLobby.jsx`, `TriviaGameRoom.jsx` | `triviaRealtime.js` | Mixed Firestore/RTDB + socket | ⚠️ Partial |
| Math Rush game | `MathRushLobby.jsx`, `MathRushGameRoom.jsx`, `mathRush/api.js` | `mathRushRealtime.js` + callable `updateGameStats` | Mixed stats + socket | ⚠️ Partial |
| Ludo game | `LudoLobby.jsx`, `LudoGameRoom.jsx`, `games/ludoGame/*` | `ludoRealtime.js`, `ludoFirestoreSync.js` | Optional Firestore sync + JSON snapshots | ⚠️ Partial |
| Direct messages/chat | `api/dmApi.js`, chat components | (client-direct + socket-assisted areas) | `dmThreads`, Storage, `lobbies/*/messages` | ⚠️ Partial (rules alignment needed) |
| Admin/server jobs | N/A | `expirePendingInvites`, `refreshLeaderboardRollup` | `invites`, `leaderboardRollup` | ✔ Connected (backend-only) |

---

## 9) Missing / Incomplete Features and Gaps

## Missing/partial Firebase integration

- Some features still rely on file-backed JSON persistence in backend (`users.json`, `game_rooms.json`, `matches.json`) instead of fully Firebase-backed state.
- `getPlayerDashboard` callable is exported but not primary path for dashboard.
- `leaderboardRollup/current` is generated server-side but not integrated into main client view.
- `mathRush/api.js` includes stub-like endpoints (e.g., empty leaderboard function).

## Orphan/unused or duplicate code indicators

- `frontend/src/routes/PlayerRoutes.jsx` appears redundant vs route definitions in `App.jsx`.
- Hooks such as `frontend/src/hooks/useLobby.js` and `useMatchmaking.js` appear weakly integrated.
- `frontend/src/firebase/lobby.js` and `frontend/src/firebase/presence.js` include demo/stub patterns while production logic lives elsewhere.
- `frontend/src/games/MathRush.jsx` appears placeholder-style compared to active lobby/room modules.

## Security and consistency risks

- Socket.IO flows do not enforce strict per-event identity verification server-side (client-provided IDs can be trusted too much).
- Socket CORS policy and several REST endpoints are broadly open.
- Dual wallet/stat paths (JSON + Firestore) can diverge.
- Firestore rules likely do not include all actively used collections (notably `dmThreads`, `faqs`), risking client permission failures.
- Cloud Function `addTransaction` records amounts from client payloads without external payment proof validation.
- In-memory rate limiting and room state are process-local (multi-instance consistency risk).

---

## 10) Recommendations for Improvement

1. **Unify state authority**
   - Move gameplay economy/wallet/stat writes to a single trusted backend path (prefer callable/Admin transactions).
   - Decommission JSON persistence for production-critical entities.

2. **Harden realtime security**
   - Require socket auth handshake with Firebase ID token verification.
   - Bind socket identity to verified UID and reject mismatched payload `userId`s.

3. **Consolidate API surface**
   - Remove legacy auth endpoints and duplicate leaderboard/data pathways.
   - Choose one dashboard source (callable or Firestore direct) and retire the unused alternative.

4. **Firestore/rules alignment**
   - Audit all client-touched collections (`dmThreads`, `faqs`, etc.) against deployed rules.
   - Add explicit least-privilege rules and indexes for all active queries.

5. **Scalability improvements**
   - Replace in-memory match queues/rooms with Redis/Firestore-backed state or authoritative game service.
   - Replace process-local rate limits with distributed rate limiting.

6. **Decouple backend from frontend code imports**
   - Move shared constants/question banks/default profiles into backend-owned or shared packages.
   - Eliminate backend imports from `frontend/src/*` to avoid deployment fragility.

7. **Observability + reliability**
   - Add structured logs/metrics for socket events, auth failures, write denials, and callable error rates.
   - Add integration tests that validate end-to-end flows (auth -> game -> rewards -> dashboard consistency).

---

## Connection Summary (Quick Audit)

- ✔ **Fully connected**: Core auth session handling, friends/challenges via callables, notification read flow, dashboard Firestore reads.
- ⚠️ **Partially connected**: All three game systems (hybrid socket + mixed persistence), billing/payment trust model, leaderboard source strategy, DM/rules consistency.
- ❌ **Not fully connected yet**: Fully centralized authoritative realtime persistence, fully de-duplicated API/auth architecture, complete rules coverage for every active collection.
