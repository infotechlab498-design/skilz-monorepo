# Ludo Code Activity Audit (Frontend + Backend)

This document critically analyzes the current Ludo implementation in the codebase and lists what activities/features are already defined, partially defined, or missing.

## Scope Reviewed

- Frontend:
  - `frontend/src/games/LudoLobby.jsx`
  - `frontend/src/games/Ludo.jsx`
  - `frontend/src/games/LudoGameRoom.jsx`
  - `frontend/src/games/ludoGame/**`
  - Supporting auth/session/socket wiring used by Ludo
- Backend:
  - `backend/src/services/ludoRealtime.js`
  - `backend/src/services/ludo/**`
  - `backend/src/game-engine/**`
  - `backend/src/services/ludoFirestoreSync.js`
  - `backend/src/server.js` (Ludo attach + restore)
- Rules/docs context:
  - `backend/firebase/firestore.rules`
  - `docs/LUDO_*.md`

---

## 1) Activities Defined in Frontend

### 1.1 Routing and Entry Activities
- Protected Ludo routes are defined:
  - `/ludoLobby`
  - `/ludo/:gameId`
  - `/ludo/game/:roomId`
- Route gating uses `ProtectedGameRoute` and Firebase readiness checks.

Status: **Defined**

### 1.2 Lobby Activities
- Local-mode setup UI is defined:
  - Player mode selection
  - Human/bot configuration
  - Bot difficulty selection UI
  - Session creation and navigation
- Friend/online room area exists but parts are commented in lobby JSX.

Status: **Partially Defined**

### 1.3 Gameplay UI Activities
- Board rendering, token rendering, valid-move click behavior.
- Dice panel and roll button.
- Live players, leaderboard panel, match history panel.
- Quit/reset flow.

Status: **Defined**

### 1.4 Local Gameplay State Activities
- Reducer-driven game state (`START_GAME`, `SET_ROLL`, `MOVE_TOKEN`, `PASS_TURN`, hydrate/reset).
- Valid move computation via shared validator path.
- Winner and ranking state modeling.

Status: **Defined**

### 1.5 Bot Activities (Frontend-side)
- Bot turn detection exists in hook.
- Bot auto-roll and auto-move automation is present.
- Difficulty state is carried and shown in UI.
- Adaptive difficulty fields exist.

Status: **Defined, but behavior depth is partially defined**  
(current move choice heuristic is basic and not fully strategy-rich in hook orchestration)

### 1.6 Realtime Sync Activities (Frontend)
- Firestore `onSnapshot` hydration flow exists for game doc updates.
- Firestore transaction path exists for roll/move/finish.
- Error logging and state hydration guards exist.

Status: **Defined**

### 1.7 Frontend Risk Activities
- Architecture ambiguity remains between Socket-driven room lifecycle and Firestore-driven gameplay state in different screens.
- Some legacy assumptions still appear in comments/older code paths.

Status: **Partially Defined / Needs consolidation**

---

## 2) Activities Defined in Backend

### 2.1 Socket Domain Activities
- Event handlers implemented:
  - `ludo:createRoom`
  - `ludo:joinRoom`
  - `ludo:leaveRoom`
  - `ludo:startGame`
  - `ludo:rollDice`
  - `ludo:moveToken`
- Outbound events:
  - `ludo:roomCreated`, `ludo:playerJoined`, `ludo:gameState`, `ludo:diceRolled`, `ludo:turnComplete`, `ludo:gameEnded`, `ludo:error`

Status: **Defined**

### 2.2 Room Lifecycle Activities
- Lobby creation and host ownership.
- Join/rejoin behavior.
- Start-game validations.
- Host leave / room close behavior.

Status: **Defined**

### 2.3 Rule Enforcement Activities
- Turn ownership checks.
- Roll/move phase checks.
- Triple-six logic.
- Capture, safe cells, exact-finish logic through validator.
- Illegal move rejection and error codes.

Status: **Defined**

### 2.4 Bot Engine Activities (Backend)
- Bot turn processing and decisioning through AI engine.
- Bot action cadence/profile behavior support.

Status: **Defined**

### 2.5 Economy Activities
- Entry fee deduction.
- Rank prize payout.
- XP award hooks.

Status: **Defined**

### 2.6 Persistence and Recovery Activities
- Runtime room state snapshot save.
- Startup restore from persisted room state.
- Match-end sync behavior for records/stats.

Status: **Defined**

### 2.7 Backend Gaps / Risks
- Ludo service lacks explicit disconnect cleanup symmetry in some paths.
- Some hot-path persistence calls are fire-and-forget.
- Concurrency model is primarily in-memory + snapshot persistence (multi-instance strictness needs explicit strategy if scaling horizontally).

Status: **Partially Defined**

---

## 3) Firestore and Security Activities

### 3.1 Rules Activities
- Owner-scoped user profile protections exist.
- Public profile collection exists for cross-user safe reads.
- Ludo gameplay collection rules now include participant and revision constraints.

Status: **Defined**

### 3.2 Security Boundary Activities
- Firebase-auth socket identity exists.
- Firestore client write constraints added for game docs.

Status: **Defined with ongoing hardening needed**

---

## 4) Critical Alignment Summary

### Fully Defined (Operational)
- Core Ludo rules engine integration.
- Room lifecycle and gameplay event surface.
- Game UI shell and reducer-based game state.
- Firestore snapshot/transaction path for game state.
- Basic bot automation flow.

### Partially Defined (Needs Final Consolidation)
- Unified authority model (Socket vs Firestore gameplay responsibility across all screens).
- Bot strategy sophistication layer (easy/medium/hard behavior depth orchestration in frontend hook path).
- Some robustness concerns (disconnect cleanup, persistence reliability under scale).

### Missing or Weakly Defined
- Single, explicit architecture contract document in code that states the canonical gameplay authority path for every Ludo route.
- Full production-grade consistency checks for hybrid paths (if both socket and Firestore paths remain active).

---

## 5) Recommended Next Activities (Priority)

1. **Authority Consolidation**
   - Finalize one canonical runtime authority per Ludo flow (or clearly separate local-vs-online contracts).
2. **Bot Strategy Upgrade**
   - Keep current working bot automation, then layer difficulty-specific strategy adapters without touching core mechanics.
3. **Reliability Hardening**
   - Add explicit disconnect reconciliation in Ludo service.
   - Tighten persistence await strategy for critical transitions.
4. **Architecture Documentation Refresh**
   - Update outdated Ludo docs to match actual current implementation and remove drift.

---

## 6) Conclusion

The Ludo project is **substantially implemented and functional** across core gameplay, backend validation, and real-time state pathways.  
The main remaining work is **consolidation and hardening**, not a rewrite: clarify authority boundaries, deepen strategy modularity, and finalize reliability/security polish for production confidence.

