# Ludo — player selection modes, matchmaking logic, and what actually runs today

This document is a **critical, code-grounded** view of how players are selected and seated for Ludo in this repo. It separates **what the UI exposes**, **what the Socket.IO server implements**, and **legacy or unused definitions** so you can reason about production behavior without relying on older docs alone.

---

## 1. Executive summary

| Path | “Mode” in practice | Player selection | Authority |
| --- | --- | --- | --- |
| **Lobby → “Classic 4P Match” (`START MATCH`)** | `CLASSIC_4P_ONLINE` via `ludo:queueJoin` | Global queue buckets; match when **4 humans** **or** **≥2 humans** after **wait window**; optional **lobby vote** if seats &lt; 4 | Socket.IO + in-memory room state; Firestore snapshots (`ludoMatches`) |
| **Invite link / room id → `/ludo/game/:roomId`** | Online **private** lobby (`ludo:createRoom` **or** host-shared id) | Humans join until room full or host starts (rules in `ludo:startGame`) | Same |
| **`GameMode` enum in `types.js`** | `VS_BOT`, `LOCAL_1V1`, `LOCAL_4P`, `ONLINE_MATCH` | **Not all are wired** in the current lobby UI; see §5 | N/A |

**Gameplay sync** is **Socket.IO only** for online rooms (`useLudoGame({ socketRoomId })`). There is **no** client-driven Firestore gameplay path for Ludo in the active flow.

---

## 2. What the lobby UI actually offers today

### 2.1 Primary: Classic four-player online queue

**Component:** `frontend/src/games/ludoGame/components/PlayerSelection.jsx`

- Single surface: **“Classic 4P Match”** with **START MATCH**.
- Emits **`ludo:queueJoin`** with fixed-ish parameters:
  - `maxPlayers: 4`
  - `fillBots: false`
  - `botFallbackMs: 0` (no DEFAULT-style bot fallback timer from this UI)
  - `waitWindowMs: 12000` (12s search window for classic variant)
  - `matchVariant: 'CLASSIC_4P_ONLINE'` (must match server constant `LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE`)
  - `entryFee: 10`, `turnTimerSec: 30`, `settings: { turnTimerSec: 30, exactRollToHome: true, safeStars: true }`
- On **`ludo:matchFound`**, navigates to **`/ludo/game/:roomId`** with `state.isHost` from payload.
- **Cancel:** emits **`ludo:queueCancel`** and clears listeners.

**Wallet note (UX vs truth):** The lobby shows coins as a **pre-check**; **entry fee is enforced on the server** when the queue ticket is created (`tryDeductEntryFee` on `ludo:queueJoin` in `backend/src/services/ludoRealtime.js`).

### 2.2 Secondary UI affordances (same screen)

**`frontend/src/games/LudoLobby.jsx`**

- **Friend-style invite list** (`LobbySliders` / `LobbyRightSidebar`) still lets you pick “invited” players, but **`handleConfirmInvite`** explicitly blocks starting a **local/session** match and tells the user to use **online matchmaking** instead.
- **“Create online room” / “Join via link”** block exists in source but is **commented out** in the JSX at the time of this doc — so **private room creation from this page may be unavailable** unless that block is re-enabled or another route calls `ludo:createRoom`.

---

## 3. Server: queue buckets and “modes” (match variants)

**Implementation:** `backend/src/services/ludoRealtime.js`

### 3.1 Bucket identity (who you can match with)

Queue tickets are grouped by a JSON key from `ludoQueueBucketKey(criteria)`:

- `maxPlayers` (clamped 2–4; forced to **4** for classic variant on join)
- `fillBots`
- `entryFee`, `turnTimerSec`, `botFallbackMs`
- `matchVariant` (string; default `'DEFAULT'` if omitted/blank)
- `waitWindowMs` (meaningful for classic; stored in key)
- `settings` (object; must match for same bucket)

**Implication:** Two clients with different `settings` or `entryFee` **never** share a queue bucket even if both say “Classic 4P”.

### 3.2 Variant A — `CLASSIC_4P_ONLINE` (the productized 4P flow)

**Flush rules** (`tryFlushLudoQueueBucket`):

1. **Immediate full lobby:** if `arr.length >= 4`, take **first 4** tickets → one **LOBBY** room, **no vote**, up to **4 humans**.
2. **Partial lobby after wait:** if `arr.length >= 2` **and** `Date.now() - oldestTicket.joinedAt >= waitWindowMs` (clamped **1000–120000** ms; client sends **12000**), take **up to 4** current tickets (`batch = slice(0, min(4, length))`).
   - If `batch.length < 4`, **`needsVote = true`**: server opens a **15s** vote (`openClassicVote`).
3. **Solo wait fallback (1 human):** if the bucket has **exactly one** ticket and **`waitWindowMs`** has elapsed since the oldest ticket’s `joinedAt`, the server creates a **2-seat** lobby (`maxPlayers: 2`), **`fillBots: true`**, **`autofillAggressiveBots: false`** (standard **MEDIUM** / `default_medium` bot via `buildPlayingFromLobby`), **`meta.soloFallback: true`**, **no vote**, then **`scheduleMatchmadeAutostart`** as for other non-vote classic matches. If a second human joins **before** that wait elapses, the normal **≥2 humans** branch runs instead.

**After room creation:**

- Everyone gets **`ludo:matchFound`** including `voteRequired: true/false`.
- If **no vote**: `scheduleMatchmadeAutostart` may auto-run **`ludo:startGame`** logic for the host after **`LUDO_MATCHMADE_AUTOSTART_MS`** (default **2500** ms if env unset; **`0`** disables).
- If **vote open**: autostart is **not** scheduled until the vote resolves; **`ludo:startGame`** is also rejected while `lobby.vote.open` (`VOTE_PENDING`).

### 3.3 Variant B — `DEFAULT` (generic queue; still in server code)

If `matchVariant !== CLASSIC_4P_ONLINE`, flush uses the **generic** branch:

- Waits until enough humans: `minHumans` is **2** unless `fillBots` **or** `botFallbackMs` elapsed (then **1**).
- Takes `take = min(maxPlayers, arr.length)` tickets.
- **`fallbackToBot`**: if `!fillBots && botFallbackMs > 0` and time elapsed, can pad with bots when batch smaller than `maxPlayers`.

**Important:** The current **`PlayerSelection.jsx` UI does not emit `DEFAULT`** queue joins, so this path is **only** reachable from **another client** or **future UI** that sends a different `matchVariant` / `fillBots` / `botFallbackMs`.

---

## 4. Bot vs humans-only vote (classic under-fill)

### 4.1 When it runs

- Opened only from **`CLASSIC_4P_ONLINE`** flush when `needsVote === true` (2–3 humans after the wait window, still under 4 seats filled).

### 4.2 Wire events

| Event | Direction | Purpose |
| --- | --- | --- |
| `ludo:voteRequested` | server → room | Opens vote; includes `deadlineAt` (+15s from server) |
| `ludo:voteUpdated` | server → room | Tallies after each `ludo:submitVote` |
| `ludo:voteClosed` | server → room | Final outcome + closed vote |
| `ludo:submitVote` | client → server | `{ roomId, choice }` with `ADD_BOTS` or `HUMANS_ONLY` |

**Client UI:** `frontend/src/games/LudoGameRoom.jsx` renders vote buttons and emits **`ludo:submitVote`**. `useLudoGame.js` also listens for vote events for state consistency.

### 4.3 Outcome logic (critical)

**Module:** `backend/src/services/ludo/application/voteLogic.js`

- Votes are counted **per lobby member uid** (`computeVoteSummary`).
- **`resolveVoteOutcome`** sets:

```text
outcome = addBotsCount >= humanOnlyCount ? 'ADD_BOTS' : 'HUMANS_ONLY'
```

**Interpretation:**

- **Ties favor bots** (`ADD_BOTS`), including **0–0** if nobody votes before timeout (both counts 0 → `ADD_BOTS`).
- After outcome:
  - **`ADD_BOTS`:** `lobby.fillBots = true`, `maxPlayers = 4`, `autofillAggressiveBots = true` (hard bot profile when building playing state).
  - **`HUMANS_ONLY`:** `fillBots = false`, `maxPlayers = clamp(members.length, 2, 4)`, `autofillAggressiveBots = false`.

Then **`resolveClassicVote`** calls **`executeLudoStartGame`** for the host (starts **PLAYING**).

---

## 5. `GameMode` enum vs reality (documentation hygiene)

**File:** `frontend/src/games/ludoGame/types.js`

Defines:

- `VS_BOT`, `LOCAL_1V1`, `LOCAL_4P`, `ONLINE_MATCH`

**Reality check:**

- **`PlayerSelection.jsx`** no longer presents multiple cards; it **only** starts **`CLASSIC_4P_ONLINE`** queue joins.
- **Local/session** Ludo from lobby invites is **explicitly retired** (`handleConfirmInvite` error).
- **`/ludo/:gameId`** is redirected away from legacy gameplay in routing (see `App.jsx` / `Ludo.jsx` in repo history).

**Conclusion:** Treat `GameMode` as **partially historical** unless you grep the repo and find an active UI path still emitting those flows.

---

## 6. Private rooms (when enabled): player selection model

**Socket:** `ludo:createRoom` (host) and `ludo:joinRoom` (guests).

- **Selection** is not algorithmic: the **host shares `roomId` / URL**; guests are whoever joins with a valid wallet and capacity.
- **Host** pays on create; **guests** pay on join (server-side ledger / receipts — see wallet helpers in `ludoRealtime.js`).
- **Start:** host **`ludo:startGame`** subject to `executeLudoStartGame` rules (min humans unless `fillBots`, cannot start during open vote, etc.).

---

## 7. End-to-end mental model (happy paths)

### Path A — Classic queue, 4 humans found quickly

1. User clicks **START MATCH** → `ludo:queueJoin` … `matchVariant: CLASSIC_4P_ONLINE`.
2. Bucket accumulates 4 compatible tickets → flush → **LOBBY** with 4 members, **`voteRequired: false`**.
3. Optional **autostart** after short delay → **PLAYING** (or host starts manually if autostart disabled).
4. Moves/dice only via **`ludo:rollDice` / `ludo:moveToken`**; everyone hydrates from **`ludo:gameState`**.

### Path B — Classic queue, 2–3 humans after 12s

1. Same queue join.
2. After `waitWindowMs`, flush partial batch → **`ludo:voteRequested`**.
3. Players vote; on timeout or all votes in → outcome (ties → bots) → **`executeLudoStartGame`**.
4. Bots may fill empty seats if `ADD_BOTS` won.

### Path C — DEFAULT queue (API-level “mode”, not current lobby UI)

Any client sending `matchVariant` other than classic (or omitting to get `DEFAULT`) uses **generic** pairing rules with optional **`fillBots`** and **`botFallbackMs`**.

---

## 8. Critical analysis (strengths, sharp edges, doc drift)

### Strengths

- **Single authoritative transport** (Socket.IO) for online play reduces split-brain between Firestore and sockets.
- **Classic 4P** has explicit **anti-solo-flush** behavior and a structured **vote** for under-filled lobbies.
- **Wallet idempotency** hooks exist around queue join / cancel / disconnect refunds (see `ludo:queueJoin` and refund helpers in `ludoRealtime.js`).

### Sharp edges to remember

1. **Vote tie-breaker favors bots** (`>=`). Product-wise, confirm that matches expectations.
2. **Autostart** after matchmaking can start a game **without** an explicit host click (unless env disables it); interacts with vote gating (`VOTE_PENDING`).
3. **`LUDO_MULTIPLAYER.md`** still mentions multiple `GameMode` cards and Firestore defaults in places; **trust the code paths above** first, then align docs in a follow-up edit if desired.
4. **Lobby “Create online room”** may be **commented out**; operational docs should mention whether private rooms are currently exposed in UI.

### Operational dependency

- Vite proxies **`/api`** and **`/socket.io`** to **`127.0.0.1:3000`**. If the Node server is not running, the client will show proxy errors — that is an **environment/process** issue, not a Ludo rules issue.

---

## 9. File index (quick navigation)

| Concern | Primary files |
| --- | --- |
| Lobby UI + queue entry | `frontend/src/games/LudoLobby.jsx`, `frontend/src/games/ludoGame/components/PlayerSelection.jsx` |
| Room + vote UI | `frontend/src/games/LudoGameRoom.jsx`, `frontend/src/games/ludoGame/hooks/useLudoGame.js` |
| Queue, flush, vote, wallet | `backend/src/services/ludoRealtime.js` |
| Vote tally / tie | `backend/src/services/ludo/application/voteLogic.js` |
| Snapshots / persistence | `backend/src/services/ludo/roomManager.js` and Firestore match writes |
| High-level multiplayer overview (may drift) | `docs/LUDO_MULTIPLAYER.md` |

---

*Generated from repository inspection; behavior should be re-verified after any UI change to `PlayerSelection.jsx` or queue payload defaults.*
