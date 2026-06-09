# Ludo multiplayer — architecture and integration

This document describes the current **online socket-authoritative Ludo flow**. Legacy local/session gameplay route is retired from active navigation.

## Development (runtime checklist)

- **Vite** dev server (default **5173**) proxies **`/socket.io`** and **`/api`** to **`http://127.0.0.1:3000`** ([`vite.config.js`](../vite.config.js)). The Ludo client’s `socket.io-client` uses same-origin in dev, so the **Node/Express server must listen on port 3000** or rolls/moves will never receive `ludo:gameState`.
- **Legacy local route**: `/ludo/:gameId` is redirected to `/ludoLobby` and no longer a supported active match entry path.
- **Online room**: `/ludo/game/:roomId` → `ludo:joinRoom` `{ roomId, displayName }` → host `ludo:startGame` → board. Gameplay sync is **Socket.IO only** (`ludo:gameState`, `ludo:rollDice`, `ludo:moveToken`). Do not use the legacy **`ludo:joinRoom` + `config`** shape for an id that is already an online **LOBBY** (server returns `USE_ONLINE_JOIN`).

## Wire payload shape (reference)

Authoritative state is a single object (see also [`buildPlayerListFromLudoState`](../src/games/ludoGame/ludoStateViewModel.js) for a derived `players[]` view):

| Field | Notes |
| --- | --- |
| `gameId` / `roomId` | Same string as socket room; required for client listeners. |
| `status` | `LOBBY` \| `PLAYING` \| `FINISHED` |
| `players` | Map by color (`RED`, …); values include `id`, `name`, `type` (`HUMAN` \| `BOT` \| `EMPTY`). |
| `tokens` | Per-color arrays of `{ id, position, color? }` |
| `currentTurn`, `diceValue`, `isRolling`, `waitingForMove` | `diceValue` is **1–6** when a move is expected, otherwise **null** (never rely on `0` on the wire). |

## Online route: authoritative transport

- **`/ludo/game/:roomId`**: [`LudoGameRoom.jsx`](../frontend/src/games/LudoGameRoom.jsx) calls **`useLudoGame({ socketRoomId: roomId })`** ([`useLudoGame.js`](../frontend/src/games/ludoGame/hooks/useLudoGame.js)). The client hydrates from **`ludo:gameState`**, **`ludo:playerJoined`**, and **`ludo:gameEnded`**, and sends **`ludo:rollDice`** / **`ludo:moveToken`** for actions. There is **no** active Firestore gameplay transport.
- **Mapping**: server payloads are normalized in [`mapServerLudoStateToClient`](../frontend/src/games/ludoGame/services/gameService.js) before **`HYDRATE_GAME`**.

## Matchmaking (MVP, single server)

- **Lobby UI**: [`PlayerSelection.jsx`](../frontend/src/games/ludoGame/components/PlayerSelection.jsx) — **`GameMode.ONLINE_MATCH`** and **`GameMode.LOCAL_1V1`** use **`ludo:queueJoin`** → **`ludo:matchFound`** → `/ludo/game/:roomId`. **`GameMode.LOCAL_4P`** (“Classic 4P”) uses the same transport with **`matchVariant: 'CLASSIC_4P_ONLINE'`** (constant `LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE` in [`ludoRealtime.js`](../backend/src/services/ludoRealtime.js)).
- **`ludo:queueJoin` payload (bucket key fields):** `maxPlayers`, `fillBots`, `entryFee`, `turnTimerSec`, `botFallbackMs`, `settings`, **`matchVariant`** (default `'DEFAULT'`), **`waitWindowMs`** (used when `matchVariant === 'CLASSIC_4P_ONLINE'`; default **12000**). Buckets only pair players with identical criteria JSON.
- **Classic 4P online rules:** Wait until **four** humans share a bucket (**immediate** lobby), or **at least two** humans and **`waitWindowMs`** elapsed since the **oldest** ticket in that bucket — then flush with **`fillBots: true`** and **`autofillAggressiveBots`** so empty seats get **HARD** bots (`default_hard` profile). A single human alone never flushes.
- **Autostart (optional):** If **`LUDO_MATCHMADE_AUTOSTART_MS`** is unset, default **2500** ms after **`ludo:matchFound`** for classic 4P only, the server runs the same path as host **`ludo:startGame`**. Set to **`0`** to disable (host must click **Start game** in [`LudoGameRoom.jsx`](../frontend/src/games/LudoGameRoom.jsx)). Host closing the lobby clears the timer.
- **Server**: [`ludoRealtime.js`](../backend/src/services/ludoRealtime.js) — in-memory queue buckets; **`ludo:queueCancel`** and **`socket.disconnect`** dequeue; flush creates **LOBBY**, joins sockets, saves snapshot, emits **`ludo:matchFound`** then **`ludo:gameState`**.

## Active entry path

### Online room (`/ludoLobby` → `/ludo/game/:roomId`)

- **Lobby actions**: `LudoLobby.jsx` — optional **Create online room** (when UI enabled) → **`ludo:createRoom`**. **Join via link** or **matchmaking** → same `/ludo/game/:roomId` route.
- **Room screen**: `src/games/LudoGameRoom.jsx` — hydrates from **`ludo:gameState`**, emits **`ludo:joinRoom`** `{ roomId, displayName }`, shows waiting UI while `status === LOBBY`, host emits **`ludo:startGame`**, then renders `LudoRoom` for **PLAYING** / **FINISHED**.
- **Server snapshots**: [`services/ludo/roomManager.js`](../backend/src/services/ludo/roomManager.js) → Firestore **`ludoMatches`** (not legacy JSON in current code).

## Server map isolation

- Ludo online rooms live in a dedicated **`ludoRoomStates`** `Map` in `server.js` (not the legacy trivia `roomStates`), so a generic **`leaveRoom`** for another game cannot delete an active Ludo match by mistaken id collision.

## Socket events (authoritative)

| Event | Role |
| --- | --- |
| `ludo:createRoom` | Host pays entry fee (server), creates **LOBBY**, joins socket.io room, emits `ludo:roomCreated` + `ludo:gameState`. |
| `ludo:joinRoom` | Online: `{ roomId, displayName }` — validates room, wallet for non-host guests, adds member in **LOBBY** or re-seats **PLAYING** reconnection; emits `ludo:playerJoined` (lobby) + `ludo:gameState`. Legacy: `{ roomId, config }` starts **PLAYING** local-style (see §1). |
| `ludo:leaveRoom` | **LOBBY**: host closes room or member leaves; **PLAYING**: leaves socket room (see handler). |
| `ludo:startGame` | Host-only; **LOBBY** → **PLAYING** via `buildPlayingFromLobby` (2–4 seats, optional bot fill). |
| `ludo:queueJoin` / `ludo:queueCancel` | Public matchmaking queue (fee on join; cancel drops ticket). |
| `ludo:matchFound` | `{ roomId, isHost, maxPlayers, fillBots, fallbackToBot?, matchVariant? }` after pairing. |
| `ludo:rollDice` | Human roll. |
| `ludo:moveToken` | Human move. |
| `ludo:gameState` | Full state broadcast to the Socket.IO room. |
| `ludo:diceRolled` | Roll animation / phase hints; authoritative state still in `ludo:gameState`. |
| `ludo:gameEnded` | Final payload before room row may be removed from memory. |
| `ludo:error` | `{ message, code }` e.g. `ROOM_NOT_FOUND`, `ROOM_FULL`, `WALLET`, `NOT_HOST`, `USE_ONLINE_JOIN`, `NO_ROOM`, `NOT_PLAYING`, `NOT_SEATED`, `DICE_PENDING`, `NOT_WAITING_MOVE`, `TURN_LOCKED`. |

### Spec vs actual event names (hybrid docs)

Some architecture write-ups use different names than the wire. **Canonical names are what the code emits today.**

| Typical spec name | Actual event in this repo | Notes |
| --- | --- | --- |
| `ludo:gameStarted` | `ludo_game_started` **and** `ludo:gameStarted` | Both are emitted on online start (same payload). Prefer listening to one; `ludo_game_started` is legacy. |
| `ludo:gameEnded` | `ludo_game_ended` | Underscore form only today. |
| `ludo:turnUpdate` | `ludo:turnComplete` | Metadata after turn steps. |

**Deprecation plan (optional):** keep dual server emits for one release where aliases were added; remove legacy names only after all clients migrate (search `src/` for listeners).

### Post-game Firebase (not realtime gameplay)

- **Canonical path today:** when a Ludo match ends, Node calls [`syncLudoMatchEnd`](../services/ludoFirestoreSync.js) from the **Express process** using **Firebase Admin** — writes `matches/{matchId}` and patches `users/{uid}` (wallet fields only if `FIREBASE_SYNC_WALLET=1`).
- **Cloud Function `finalizeMatch`:** not used. Adding a callable **without** removing Admin writes would **double-apply** rewards. Safer evolutions: (1) shared economy in [`game-engine/services/ludoEconomy.js`](../game-engine/services/ludoEconomy.js) (done), or (2) Node writes a `matchResults/{id}` doc and a **Firestore trigger** runs finalize once, **or** (3) replace Admin user patches with a **secured** server-only callable — pick one path only.

**Rule:** Firebase must **not** participate in dice/move/turn loops; only Socket.IO + in-memory `ludoRoomStates`.

### Leaderboard: query-time vs rollup

- **Today:** callable **`getLeaderboard`** ([`functions/handlers/leaderboard.js`](../functions/handlers/leaderboard.js)) queries `users` ordered by `xp` (requires index).
- **Scheduled rollup:** [`refreshLeaderboardRollup`](../functions/index.js) (every 6 hours) writes **`leaderboardRollup/current`** via [`handlers/leaderboardRollup.js`](../functions/handlers/leaderboardRollup.js). Use for dashboards, caching, or future public reads (add Firestore rules if clients read it).
- **When to rely on rollup more:** if `getLeaderboard` volume grows (many concurrent reads) or you need historical seasons, add `leaderboard/{seasonId}/…` and extend the rollup job; until then query-time is fine for typical traffic.

## Client hooks and UI

- **`useLudoGame`** ([`useLudoGame.js`](../frontend/src/games/ludoGame/hooks/useLudoGame.js)): default **Firestore** `games/{gameId}` + transactions for **`/ludo/:gameId`**. With **`{ syncTransport: 'socket', socketRoomId }`** (online room route), subscribes to **`ludo:gameState`** / **`ludo:playerJoined`** / **`ludo:gameEnded`** and emits **`ludo:rollDice`** / **`ludo:moveToken`**.
- **`LudoRoom`**: optional **`onPlayAgain`** and **`enforceSeatForRoll`** — online flow uses **“Back to lobby”** and only the seated Firebase user may roll on their turn.

## Redux / context

- **`GameSessionContext`**: `LudoGameRoom` mirrors `{ gameType: 'ludo', roomId, match }` for parity with Trivia / Math Rush session tracking.
- **Auth**: `/ludo/game/:roomId` is behind **`ProtectedGameRoute`** (JWT). Wallet and `ensureGameUserFromAuth` / API user id alignment follow the same pattern as Math Rush where applicable.

## Data files

- **`data/ludo_room_snapshots.json`** — persisted Ludo **LOBBY** / **PLAYING** rows (online + legacy joined rooms).
- **`data/users.json`** (via `dataService`) — coin deduction / rewards on join and on ranked finish paths handled in `ludoRealtime.js`.

## Existing features preserved

- **Online 4P matchmaking / vote flow / bots (`PlayerSelection`)** — active path on `/ludo/game/:roomId`.
- **Board, `MoveValidator`, AI bot turns, timers, economy hooks** — server implementation in `ludoRealtime.js`; client board unchanged.

## Manual verification checklist

| Test | Expected |
| --- | --- |
| Create online room | Navigates to `/ludo/game/:roomId`, waiting room shows link |
| Join via URL | Guest appears in member list; entry fee enforced server-side |
| Start with 2 humans | `ludo_start_game` → **PLAYING**, all clients synced |
| Bot fill | Host can start with 1 human if `fillBots` was enabled at create |
| Moves / dice | State matches across clients; invalid move returns `ludo:error` |
| Host leave in lobby | Others receive error / redirect behavior per client |

## Production hardening status (implemented)

The following items from the production hardening plan are now implemented in code:

| Phase | Status | What was implemented |
| --- | --- | --- |
| Phase 0 — LAN readiness | DONE | Backend listens on `0.0.0.0`; Vite LAN host enabled; socket URL uses env-based strategy (`VITE_SOCKET_URL`) with same-origin fallback. |
| Phase 1 — reconnect/grace | DONE | Added disconnect presence metadata (`connected`, `disconnectedAt`, `graceUntil`), explicit `ludo:rejoinRoom`, reconnect state re-seat + sync, and grace-expiry sweep behavior. |
| Phase 2 — turn phases | DONE | Added strict `turnPhase` (`ROLL` → `MOVE` → `END`) and phase-gated roll/move handlers. |
| Phase 3 — action lock | DONE | Added per-room `actionLock` and wrapped roll/move/bot resolution paths to prevent overlapping actions. |
| Phase 4 — snapshots | DONE | Added snapshot calls at reconnect/disconnect and key state transitions (roll/move/turn timeout/disconnect timeout). |
| Phase 5 — bot finalization | DONE | Bot tiers mapped as EASY=random, MEDIUM=heuristic priority, HARD=weighted AI path; retained human-like delay profile integration. |
| Phase 6 — wallet integration | DONE | Added wallet APIs (`getUserWallet`, `addCoins`, `deductCoins`, `distributeMatchRewards`), kept pre-match entry deductions, moved rank payout settlement to match end, and ensured signup bonus defaults from backend profile creation path. |
| Phase 7 — scale prep | DONE | Added runtime normalization helpers (`turnPhase`, `actionLock`, `presence`) to reduce implicit process-local assumptions and improve room-context isolation. |
| Phase 8 — QA matrix | IN PROGRESS | Local static/build checks completed; live cross-device/cross-network checks require manual execution (see matrix below). |

### Phase 8 strict QA matrix (current)

| Scenario | Result | Evidence / notes |
| --- | --- | --- |
| Frontend compiles after hardening | PASS | Production build succeeds (`vite build`). |
| Backend modified files parse cleanly | PASS | `node --check` passes for updated server/realtime/wallet files. |
| Lint diagnostics on changed files | PASS | IDE lint diagnostics report no errors on edited files. |
| 4 players in one room across different devices/networks | PENDING (manual) | Requires live multi-device run on LAN/internet deployment target. |
| Disconnect/rejoin during ROLL and MOVE phases | PENDING (manual) | Requires interactive socket test with deliberate network drop. |
| Multiple rooms concurrently | PENDING (manual) | Requires 2+ simultaneous live matches. |
| Wallet lifecycle check (+200 signup, -10 entry, reward totals) | PENDING (manual) | Requires Firestore balance assertions before/after full matches. |
| Restart server and recover active room snapshot | PENDING (manual) | Requires kill/restart of backend during active room and state-restore verification. |

### Live QA script for operator run

Use this short sequence to complete pending Phase 8 items:

1. Start backend + frontend with LAN/public URLs configured.
2. Open 4 authenticated players (2 browsers + 2 devices) and enter one match.
3. During **ROLL** and **MOVE**, disconnect one player (toggle network / close tab), then rejoin with same account and room link.
4. Run at least two rooms in parallel and perform interleaved roll/move actions.
5. Capture wallet balances before queue/join and after game end for all players; confirm: signup +200 (new users), entry -10 per player, reward sum equals pool distribution.
6. Restart backend during an active room and verify room state is recovered from snapshot path and play continues correctly.

---

*This file documents the integrated system as implemented in-repo; regenerate if server events or routes change materially.*
