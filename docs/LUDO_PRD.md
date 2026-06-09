# Product Requirements Document (PRD): Ludo Master (Skilz)

**Product:** Ludo Master — multiplayer and local Ludo within the Skilz gaming platform  
**Stack:** React (Vite) · Node.js / Express · Socket.IO · Firebase Auth (client) · Firebase Admin (server) · Optional Firestore sync for match results  
**Document version:** 1.0  
**Status:** As-implemented baseline (living document)

---

## 1. Executive summary

Ludo Master lets signed-in players compete in real-time Ludo matches in two primary modes:

1. **Local / friends session** — Player configures a table (humans, invited friends by UID, bots), pays an entry fee on the server, and plays on a dedicated match URL backed by **Socket.IO** as the source of truth.
2. **Online private room** — Host creates a shareable room; guests join via link; host starts when enough players are present; same real-time engine and wallet rules apply.

The server owns **turn order, dice, moves, wallet deductions, and prizes**. The client renders state, sends **intent-only** events (`roomId`, `tokenId`, `config` where applicable), and **never** supplies trusted user identity on the wire — identity comes from the **Firebase ID token** on the socket.

---

## 2. Goals

| ID | Goal |
|----|------|
| G1 | **Authoritative server state** — No client-trusted outcomes for dice or legality of moves. |
| G2 | **Secure real-time channel** — Socket.IO connections require a valid Firebase ID token; `socket.user.uid` is the only identity for seating and turns. |
| G3 | **Consistent UX** — Dice, turn indicators, and board match server state after each action. |
| G4 | **Monetization fairness** — Entry fees and rank-based coin prizes are enforced and applied on the server. |
| G5 | **Recoverability** — Refresh/reconnect: players can rejoin an in-progress match if their UID is seated; lobby members can re-enter the lobby. |
| G6 | **Clear error contract** — Failures return structured `ludo:error` payloads with stable `code` values for UI and logging. |

---

## 3. Non-goals (current scope)

- Global leaderboards solely for Ludo (may exist elsewhere in Skilz).
- Spectator mode or replay export.
- Cross-platform native apps (web-first).
- Guaranteeing gameplay without Firebase sign-in (socket auth requires a token today).
- Client-side anti-cheat beyond server validation (server is the trust boundary).

---

## 4. Personas

- **Casual player** — Wants quick games with friends or bots; cares about coins balance and clear turn feedback.
- **Host** — Creates online room, shares link, starts match when ready.
- **Guest** — Joins via URL, pays entry (if not host), plays from browser.
- **Operator / developer** — Needs observable logs (`LUDO_SOCKET_DEBUG`), persisted room snapshots, and predictable event names.

---

## 5. User-facing surfaces & routes

All routes below use **`ProtectedGameRoute`** (signed-in access).

| Route | Screen | Purpose |
|-------|--------|---------|
| `/ludoLobby` | `LudoLobby.jsx` | Configure invites/bots; start **local** session (`sessionService` + navigate to `/ludo/:gameId`). **Online** mode on `PlayerSelection` uses **`ludo:queueJoin`** / **`ludo:matchFound`** into `/ludo/game/:roomId`. |
| `/ludo/:gameId` | `Ludo.jsx` | **Local / session-based** match: loads `sessionService` session, hydrates or calls `startGame(config)` → `ludo:joinRoom` with full `config`. |
| `/ludo/game/:roomId` | `LudoGameRoom.jsx` | **Online room**: join lobby → wait → host `ludo:startGame` → board (`LudoRoom`). |

Invite URL pattern (online): `{origin}/ludo/game/{roomId}`.

---

## 6. Functional requirements

### 6.1 Authentication & session

- **FR-A1:** Only authenticated users (Firebase) can open protected Ludo routes.
- **FR-A2:** Socket.IO client MUST connect with `auth: { token }` (Firebase ID token).
- **FR-A3:** Server MUST verify token with Firebase Admin SDK and attach `socket.user.uid` (and optional email/name).
- **FR-A4:** Invalid or missing token MUST fail the connection handshake (`UNAUTHENTICATED_SOCKET`).

### 6.2 Online lobby

- **FR-L1:** Host creates a room via **`ludo:createRoom`**; server deducts host entry fee, generates `roomId`, creates **LOBBY** state, joins host to Socket.IO room.
- **FR-L2:** Server responds to creator with **`ludo:roomCreated`** and broadcasts **`ludo:gameState`** to the room.
- **FR-L3:** Guests join with **`ludo:joinRoom`** payload `{ roomId, displayName }` (no client UID). Server adds `lobby.members[]` using **`socket.user.uid`**.
- **FR-L4:** Non-host guests pay entry fee on first join (server wallet check).
- **FR-L5:** **`ludo:playerJoined`** notifies lobby with updated `members`.
- **FR-L6:** Host starts with **`ludo:startGame`**; only **`lobby.hostUid === socket.user.uid`**; validates minimum humans vs **`fillBots`**; transitions to **PLAYING** via `buildPlayingFromLobby`.
- **FR-L7:** **`ludo:leaveRoom`** — host leaving lobby closes room (`HOST_LEFT`); others leave and update lobby.

### 6.2a Public matchmaking (MVP, single Node process)

- **FR-M1:** Client emits **`ludo:queueJoin`** with `{ displayName, maxPlayers, fillBots, entryFee, turnTimerSec, settings }` matching the same criteria as the lobby **PlayerSelection** configuration.
- **FR-M2:** Server charges **one** entry fee on queue join (`queue_join`); on match, creates a **LOBBY** room with pre-filled `lobby.members` (no second fee for room creation).
- **FR-M3:** Server emits **`ludo:matchFound`** to each matched socket with `{ roomId, isHost, maxPlayers, fillBots }`; clients navigate to `/ludo/game/:roomId` and use the existing **`ludo:joinRoom`** flow.
- **FR-M4:** **`ludo:queueCancel`** removes the ticket; **`disconnect`** also removes the ticket (refund policy is not implemented in MVP).

### 6.3 Local / legacy join (session flow)

- **FR-S1:** Client stores session in **`sessionService`** (`localStorage`, key prefix `ludo_session_`).
- **FR-S2:** On start, client emits **`ludo:joinRoom`** with `{ roomId, config }` where `config` includes `players` keyed by **RED | BLUE | YELLOW | GREEN**, `entryFee`, `settings`, `mode`, etc.
- **FR-S3:** If `roomId` already exists as an **online LOBBY**, server MUST reject with **`USE_ONLINE_JOIN`** (wrong flow).
- **FR-S4:** For **new** legacy room, server MUST verify at least one **HUMAN** seat has **`id === socket.user.uid`** (`SEAT_MISMATCH` otherwise), then deduct entry fee and create **PLAYING** state.
- **FR-S5:** If room already **PLAYING** and the same UID is seated, server sends current **`ludo:gameState`** (reconnect).

### 6.4 Gameplay

- **FR-G1:** Status values: **`LOBBY`**, **`PLAYING`**, **`FINISHED`** (aligned with client `GameStatus`).
- **FR-G2:** Turn model: `currentTurn`, `turnSequence`, `currentPlayerIndex`, `turnLocked`, per-turn timer (`timeLeft`, `turnTimerSec`).
- **FR-G3:** Human roll: client emits **`ludo:rollDice`** with `{ roomId }` only. Server validates seat, turn, not already rolling, no pending die / move; sets `isRolling`, broadcasts **`ludo:gameState`** and **`ludo:diceRolled`** (`phase: 'start'`), then after delay resolves dice, applies rules (including triple-six penalty if configured), updates tokens/turn, emits **`ludo:diceRolled`** (`phase: 'resolved'`) and **`ludo:gameState`**.
- **FR-G4:** Human move: client emits **`ludo:moveToken`** with `{ roomId, tokenId }`. Server validates move with shared rules (`MoveValidator`); updates captures, finish, winners; awards coins/XP on server where applicable; emits **`ludo:gameState`**.
- **FR-G5:** Bots: server drives BOT turns (roll/move) with delays and AI selection; same broadcast pattern.
- **FR-G6:** Match end: standings finalized, optional Firestore sync (`syncLudoMatchEnd`), **`ludo:gameEnded`** with `{ roomId, winners, state }`, room removed from in-memory map.

### 6.5 Economy

- **FR-E1:** Entry fee default **10 coins** (configurable per lobby / config).
- **FR-E2:** Wallet operations use **`dataService`** (and `getUserByIdOrUid` / bootstrap user for Firebase UID).
- **FR-E3:** Rank-based coin prizes via **`ludoRankPrizeCoins(rank, entryFee)`**; XP hooks for Firestore documented in `ludoEconomy.js`.

### 6.6 Persistence

- **FR-P1:** Server persists lobby/playing match rows to **Firestore `ludoMatches/{matchId}`** (via `saveLudoRoomSnapshot` → `writeLudoMatch`) for restart recovery; optional one-time migration from legacy JSON (`scripts/migrate-ludo-snapshots-to-firestore.mjs`).
- **FR-P2:** Client persists match progress into **`sessionService`** when receiving **`ludo:gameState`** for the active `gameId` (local flow).

### 6.7 Client state management

- **FR-C1:** **`/ludo/:gameId` (local):** `useLudoGame()` subscribes to **Firestore** `games/{gameId}` and uses **`rollDiceTx` / `moveTokenTx`** for gameplay.
- **FR-C1b:** **`/ludo/game/:roomId` (online):** `useLudoGame({ syncTransport: 'socket', socketRoomId })` subscribes to **`ludo:gameState`**, **`ludo:playerJoined`**, **`ludo:gameEnded`** and emits **`ludo:rollDice` / `ludo:moveToken`** (no Firestore gameplay writes for that route).
- **FR-C2:** Full snapshots hydrate via reducer **`HYDRATE_GAME`**; optional dice animation may use **`LUDO_DICE_ROLLED`**; authoritative state is always **`ludo:gameState`** from the server.
- **FR-C3:** `rollDice` / `moveToken` use refs to avoid stale guards; emits skipped if socket offline (`socketService.emit` returns false when disconnected).

---

## 7. Real-time API contract (Socket.IO)

### 7.1 Client → server (Ludo)

| Event | Payload | Notes |
|-------|---------|--------|
| `ludo:createRoom` | `{ displayName, maxPlayers, fillBots, entryFee, turnTimerSec, settings? }` | Host UID from token. |
| `ludo:joinRoom` | `{ roomId, displayName? }` **or** `{ roomId, config }` | Lobby join vs legacy session (see §6.3). |
| `ludo:leaveRoom` | `{ roomId }` | |
| `ludo:startGame` | `{ roomId }` | Host only. |
| `ludo:rollDice` | `{ roomId }` | |
| `ludo:moveToken` | `{ roomId, tokenId }` | |
| `ludo:queueJoin` | `{ displayName, maxPlayers, fillBots, entryFee, turnTimerSec, settings? }` | Public matchmaking; fee deducted once (`queue_join`). |
| `ludo:queueCancel` | `{}` | Leave matchmaking queue (no refund in MVP). |

**Intentionally omitted from payloads:** `userId` / `uid` for auth — server uses **`socket.user.uid`**.

### 7.2 Server → client (Ludo)

| Event | Purpose |
|-------|---------|
| `ludo:gameState` | Full authoritative state for the Socket.IO room. |
| `ludo:diceRolled` | `{ roomId, phase: 'start' \| 'resolved', diceValue?, rolledBy?, currentTurn? }` — UI timing; state still finalized in `ludo:gameState`. |
| `ludo:error` | `{ message, code }` — see §9. |
| `ludo:roomCreated` | Ack to creator after `ludo:createRoom`. |
| `ludo:playerJoined` | Lobby member list update. |
| `ludo:matchFound` | `{ roomId, isHost, maxPlayers, fillBots }` — after queue pairing; client navigates to `/ludo/game/:roomId`. |
| `ludo:gameEnded` | Final payload before room teardown. |
| `ludo:turnComplete` | Optional turn metadata (reason, indices) for advanced UI/diagnostics. |

---

## 8. Security & abuse considerations

- **S1:** All gameplay actions that depend on identity MUST use **`socket.user.uid`**.
- **S2:** Legacy `config.players` MUST NOT grant a seat unless the token UID matches a human seat (`SEAT_MISMATCH`).
- **S3:** Rate limiting / replay protection: not specified in this PRD; recommended for production (per-IP / per-uid throttles on roll/move).
- **S4:** CORS is currently permissive on Socket.IO in dev; production should restrict origins.

---

## 9. Error codes (`ludo:error.code`)

Representative set implemented server-side (non-exhaustive if extended later):

| Code | Meaning |
|------|---------|
| `UNAUTHENTICATED_SOCKET` | Socket not authenticated. |
| `WALLET` | Insufficient coins or wallet error. |
| `ROOM_NOT_FOUND` | Unknown `roomId`. |
| `ROOM_FULL` | Cannot join. |
| `ROOM_CLOSED` | Room not in lobby state. |
| `HOST_LEFT` | Host closed online lobby. |
| `NOT_HOST` | Start denied. |
| `NOT_ENOUGH_PLAYERS` | Start preconditions failed. |
| `BAD_STATE` | Action invalid for current state. |
| `USE_ONLINE_JOIN` | Legacy config used against an online lobby id. |
| `SEAT_MISMATCH` | Legacy config does not include caller as a human seat. |
| `NO_ROOM` | Playing action but room missing/expired. |
| `NOT_PLAYING` | Match not active. |
| `NOT_SEATED` | UID not in `players[*].id`. |
| `NOT_YOUR_TURN` | Turn validation failed. |
| `TURN_LOCKED` | Turn resolving. |
| `ALREADY_ROLLING` | Duplicate roll. |
| `DICE_PENDING` / `NOT_WAITING_MOVE` | Move/roll ordering. |
| `INVALID_MOVE` | Server rejected move. |

---

## 10. Technical architecture

```
Browser (React)
  ├─ Firebase Auth → ID token
  ├─ socket.io-client → auth: { token } → same origin or VITE_SOCKET_URL
  └─ sessionService (localStorage) for /ludo/:gameId bootstrap

Node (Express + Socket.IO)
  ├─ io.use → verifyIdToken → socket.user
  ├─ createLudoHandlers(io, ludoRoomStates)
  │    ├─ in-memory Map roomStates + disk snapshots
  │    ├─ MoveValidator / AIEngine / RULES_CONFIG
  │    └─ wallet + optional Firestore sync on end
  └─ HTTP API (rest of Skilz) separate from Ludo socket namespace
```

**Dev note:** Vite proxies `/socket.io` to the backend (see `vite.config.js`); frontend uses `window.location.origin` by default so the game server must be reachable on that proxy target.

---

## 11. Data model (conceptual)

- **Lobby:** `hostUid`, `maxPlayers`, `members[{ uid, displayName }]`, `fillBots`, `entryFee`, `turnTimerSec`, `settings`, timestamps.
- **Playing:** `gameId`, `status`, `players` (by color: `id`, `name`, `type`, `difficulty`, …), `tokens`, `currentTurn`, `diceValue`, `isRolling`, `waitingForMove`, `winners`, `logs`, `meta`, timers, `turnSequence`, etc.
- **Player colors:** `RED`, `BLUE`, `YELLOW`, `GREEN`; online 2–4 seats use a fixed slot→color mapping on the server.

---

## 12. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR1 | **Latency:** Roll/move should feel responsive; server roll delay ~800ms human / ~700ms bot (as implemented — tune for product). |
| NFR2 | **Reliability:** Socket reconnection + `ludo:joinRoom` without config should re-seat PLAYING users. |
| NFR3 | **Observability:** Optional `LUDO_SOCKET_DEBUG=1` on server for socket auth and Ludo wire logs. |
| NFR4 | **Maintainability:** Single naming scheme for Ludo socket events (`ludo:*`), no duplicate legacy mirrors in active code paths. |

---

## 13. Success metrics (suggested)

- **SM1:** Match completion rate (started → finished without drop).
- **SM2:** Error rate by `ludo:error.code` (dashboard from logs).
- **SM3:** Reconnect success rate after refresh mid-match.
- **SM4:** Average time to first roll after “Start game”.
- **SM5:** Wallet dispute rate (should be ~0 if all mutations are server-side).

---

## 14. Roadmap / backlog (ideas)

- Re-enable or polish **online lobby UI** blocks commented in `LudoLobby.jsx`.
- Per-uid rate limits on `ludo:rollDice` / `ludo:moveToken`.
- Post-game summary modal with rank and coins delta from server refresh.
- Mobile layout and haptics.
- Admin tool to inspect `ludo_room_snapshots.json` and force-close stuck rooms.

---

## 15. Related files (implementation index)

| Area | Path |
|------|------|
| Routes | `frontend/src/App.jsx` |
| Local match page | `frontend/src/games/Ludo.jsx` |
| Lobby | `frontend/src/games/LudoLobby.jsx` |
| Online room | `frontend/src/games/LudoGameRoom.jsx` |
| Hook | `frontend/src/games/ludoGame/hooks/useLudoGame.js` |
| Reducer / types | `frontend/src/games/ludoGame/engine/reducer.js`, `types.js` |
| Socket client | `frontend/src/services/socketService.js` |
| Sessions | `frontend/src/services/sessionService.js` |
| Socket auth + mount | `backend/src/server.js` |
| Ludo realtime | `backend/src/services/ludoRealtime.js` |
| Snapshots | `backend/src/services/ludo/roomManager.js` |
| Rules / AI / economy | `backend/src/game-engine/...` |

---

## 16. Document control

- **Owner:** Product / engineering (Skilz).
- **Review:** Update when changing `ludo:*` events, wallet rules, or route structure.

---

*End of PRD*
