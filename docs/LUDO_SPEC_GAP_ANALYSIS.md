







 # Ludo Implementation — Specification vs Codebase

This document compares the **target specification** (full classic Ludo + human-like bots + UI requirements) against the **current Skilz implementation** (`src/games/ludoGame/**`, `game-engine/**`, `services/ludoRealtime.js`).

---

## Executive summary

| Area | Verdict |
|------|---------|
| Core geometry & movement | **Strong** — centralized `MoveValidator` + `RULES_CONFIG` (52-cell track, home stretch, exact finish, yard exit on 6). |
| Captures, safe cells, blocks | **Implemented** — aligns with common digital Ludo rules. |
| Authoritative gameplay | **Server-first** — `ludoRealtime.js` + Socket.IO; client reducer is mostly legacy/optimistic. |
| **Triple-six penalty** | **Met (server)** — `registerRollDice` / `handleBotRoll` in `ludoRealtime.js` use `consecutiveSixes` with `RULES_CONFIG.MOVEMENTS.TRIPLE_SIX_PENALTY`. Client reducer may still mirror for local-only UI. |
| Bot strategic hierarchy | **Partial** — server uses `AIEngine` (weighted capture/finish/safe/progress/enter + mistake chance); **not** the full 6-step spec (threat avoidance, explicit “furthest token” tier). |
| Player setup (1–4 humans + auto bots) | **Partial** — slots can be **EMPTY**; not a single “how many humans?” prompt with guaranteed bot fill. |
| End-game standings UI | **Partial** — `winners[]` exists; banner shows **first** winner only, not full ordered standings. |

---

## Rule checklist (spec → implementation)

### Board & pieces

| Requirement | Status | Evidence |
|-------------|--------|----------|
| 4 home bases, shared 52 path, 5-square home column, center finish | **Met (model)** | `RULES_CONFIG.BOARD`: `TRACK_LENGTH: 52`, `HOME_STRETCH_START: 53`, `HOME_POSITION: 58`, `YARD_POSITION: 0`. |
| Standard *visual* layout | **Met (approximation)** | `Board.jsx`: 15×15 grid, `POSITION_MAP` / `HOME_STRETCH_MAP` map logical positions to cells. Not a photoreal board but functionally clear. |
| 4 tokens per player, start in yard | **Met** | `initialGameState` / server state: four tokens at `position: 0`. |

### Turn & dice

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Single D6 | **Met** | `Math.floor(Math.random() * 6) + 1` in `ludoRealtime.js` (human + bot roll). |
| Exit yard only on 6 | **Met** | `MoveValidator.calculateNextPosition` when `tokenPos === YARD_POSITION`. |
| Rolling 6 grants extra turn | **Met** | `applyBotChosenMove` / `registerMoveToken`: extra turn if roll is 6 or move is CAPTURE/FINISH. |
| **Three 6s in a row → turn forfeited, no move** | **Met (server)** | `ludoRealtime.js` `registerRollDice` (human) and `handleBotRoll` (bot): `consecutiveSixes` + `TRIPLE_SIX_PENALTY`. |
| Must move if any legal move exists | **Met** | No “pass” action; if timer expires, turn advances (forced pass when no moves after roll is handled separately). |

### Combat & safety

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Capture on landing (non-safe) | **Met** | `MoveValidator.checkCapture`; safe cells excluded. |
| Safe squares (stars) | **Met** | `SAFE_CELLS` in `rulesConfig.js`; UI stars in `Board.jsx`. Count/placement = simplified “standard” set (may differ from physical board variants). |
| Same-color block; opponent cannot pass/land | **Met** | `getBlocks`, `isPathBlocked` in `MoveValidator.js`. |

### Home column & win

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Enter home column by exact count; overshoot illegal | **Met** | Home stretch branch in `calculateNextPosition` with `REQUIRE_EXACT_FINISH`. |
| Reaching center finishes token; bonus roll | **Met** | `FINISH` move type + extra turn logic. |
| First to finish all 4 tokens wins | **Met (with nuance)** | `winners` + `isLudoGameOver` (game ends when `winners.length >= active - 1` — classic “last one loses” style). |

---

## Bot behavior (spec → implementation)

**Specified priority order**

1. Capture if possible (non-safe)  
2. Move to safe square  
3. Enter / advance home column (close to finishing)  
4. Bring token out on 6  
5. Advance furthest token  
6. Avoid exposing to threats  

**Actual (`game-engine/ai/aiEngine.js`, used by `ludoRealtime.js`)**

- Weighted scoring: **capture**, **finish**, **safe target**, **progress** (normalized by `HOME_POSITION`), **enter yard**, plus **randomness** by difficulty.  
- **Mistake simulation**: optional second-best move via `mistakeProbability` (from bot profile / default).  

**Gaps vs spec**

| Spec item | In AIEngine? |
|-----------|----------------|
| (1) Capture first | **Yes** (strong weight). |
| (2) Safe square | **Yes**. |
| (3) Home column / finish pressure | **Partial** — `FINISH` + progress, not a dedicated “distance to finish” tier. |
| (4) Bring out on 6 | **Partial** — `ENTER` weighted; not strictly “only if no higher priority”. |
| (5) Furthest token | **Partial** — progress score approximates; not explicit. |
| (6) Avoid exposing to threats | **No** — no opponent threat / “in front of attacker” modeling. |

**Delays**

- Spec: ~1–2 s “thinking”.  
- **Implementation**: `botDelayMs()` default ~1200–2200 ms before roll/move branch; bot roll animation ~700 ms + follow-up timers — **roughly aligned**, configurable via `data/bots.default.json` / Firestore `bots` docs.

**Note:** `src/games/ludoGame/engine/botStrategies.js` is a richer “personality” heuristic but is **not** wired into `ludoRealtime.js` (server uses `AIEngine` only). That file also contains a **bug** (`scoredMoves` referenced before assignment in a mistake branch) if ever re-enabled.

---

## Technical / UI requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Browser UI | **Met** | React + `Board.jsx` + `LudoRoom.jsx` + `ludo.css`. |
| Tokens visible, positions update | **Met** | Token rendering + `positionMap` stacking. |
| Dice feedback | **Partial** | Framer-motion spin + numeric display; not a full die mesh animation. |
| Current turn clear | **Met** | Sidebar + active styles. |
| Valid moves for human | **Met** | `validMoves` + `Board` click handling. |
| Game log | **Met** | `state.logs` / Match History panel. |
| **1–4 humans, remainder bots** | **Partial** | `PlayerSelection.jsx`: per-color Human/Bot/**Empty** — empty seats are not always auto-filled with bots; depends on mode and server `fillBots` for online. |
| **Winner + final standings** | **Partial** | `state.winners` populated; UI: “MATCH OVER — `winners[0]` wins”; **no dedicated 2nd/3rd/4th podium screen**. |

---

## Additional qualities (beyond the raw spec)

These are **project strengths** not demanded by the board-game spec:

- **Multiplayer architecture**: Socket.IO authoritative state, room snapshots (`data/ludo_room_snapshots.json`), reconnect path.  
- **Economy integration**: entry fee, `EconomyService` prizes, `dataService` wallet updates on rank.  
- **Optional Firestore match sync** (`ludoFirestoreSync.js`) for profiles/stats.  
- **AFK turn timer** (global interval in `ludoRealtime.js`).  
- **Online lobby** flow (`ludo_create_room`, bot fill, wallet checks) alongside **local** session via `sessionService`.  
- **Adaptive bot difficulty** fields in client `reducer.js` — **note**: server bots currently use `AIEngine` + static profile; adaptive reducer path may not drive live server difficulty.  
- **Error boundary** around `Ludo.jsx` for resilience.

---

## Gaps & recommended work (priority order)

1. **P0 — Triple six on server**  
   - Add `consecutiveSixes` (or equivalent) to room state in `ludoRealtime.js` for **both** `registerRollDice` / `handleBotRoll`. On third consecutive 6: clear dice, advance turn, log; **no token move**.

2. **P1 — Bot strategy parity (optional but spec-faithful)**  
   - Extend `AIEngine.evaluateMove` with threat/heuristic for spec item (6), or merge logic from `botStrategies.js` **after** fixing bugs and routing server to one module only.

3. **P1 — Player setup UX**  
   - “How many human players?” (1–4) then **auto-assign bots** to remaining colors (no EMPTY in canonical mode), matching spec wording.

4. **P2 — End-game standings**  
   - Render full `state.winners` order + remaining players; show 1st–4th (or “eliminated” last).

5. **P2 — Unify AI entry point**  
   - Remove or fix dead `botStrategies.js`; single source of truth to avoid drift.

6. **P3 — Dice presentation**  
   - Richer roll animation (optional polish).

---

## File reference map

| Concern | Primary files |
|---------|----------------|
| Rules & validation | `game-engine/rules/rulesConfig.js`, `game-engine/services/MoveValidator.js` |
| Server gameplay | `services/ludoRealtime.js` |
| Bot delay / profiles | `services/ludoBotProfiles.js`, `data/bots.default.json` |
| Bot scoring (live) | `game-engine/ai/aiEngine.js` |
| Client UI shell | `src/games/Ludo.jsx`, `ludoGame/components/LudoRoom.jsx`, `Board.jsx` |
| Local lobby config | `ludoGame/components/PlayerSelection.jsx` |
| Client-only reducer (triple-six only here today) | `ludoGame/engine/reducer.js` |

---

*Generated from static code review; re-run after server triple-six and AI changes to mark items closed.*
