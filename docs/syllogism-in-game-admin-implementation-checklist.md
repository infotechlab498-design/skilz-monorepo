# Syllogism In-Game Admin Edit/Delete — Implementation & QA Checklist

Complete plan to add **edit/delete current (and deck) questions from the Syllogism game room** for admin only (`info@aljazeeragc.com`), with **Firestore persistence** and **live match sync** — no gameplay glitches.

**Reference implementation:** Trivia (`TriviaGameRoom.jsx` + `triviaRealtime.js` `trivia_admin_*` handlers).  
**Target game:** `Syllogism.jsx` + `enigmaPulseRealtime.js`.  
**Source of truth (bank):** Firestore `questions` via `firestoreQuestionAdmin.js`.

---

## Product decisions (locked — implemented)

| # | Decision | Chosen |
|---|----------|--------|
| P1 | Admin auth on socket | Email `ADMIN_EMAIL` **+** Firestore `users/{uid}.role === 'admin'` |
| P2 | Delete in Firestore | **Soft delete:** `active: false` via `updateQuestion` |
| P3 | Delete current round | **Auto-advance** after tombstone + `resolveQuestion(..., 'admin_skip')` |
| P4 | Edit scope | **All deck slots** with same `questionId` |
| P5 | Local/fallback ids (`epq_*`) | **Hidden** in UI; server rejects |
| P6 | Timer on mid-round edit | **Do not reset** `deadlineMs` |
| P7 | Deck index stability on delete | **Tombstone** replace (no splice) — preserves `questionIndex` |

---

## Phase 0 — Prerequisites

- [ ] Admin account signs in with `info@aljazeeragc.com` (or `VITE_ADMIN_EMAIL` / `ADMIN_EMAIL` env).
- [ ] Firestore `users/{adminUid}.role` is `"admin"` (required if P1 = email + role).
- [ ] Backend Firebase Admin SDK configured (`getAdminFirestore()` works).
- [ ] Syllogism questions exist: `gameType: enigma_pulse`, `type: syllogism`, `category: Syllogism`, 4 options, valid `correctIndex`.
- [ ] Read Trivia flow once: `frontend/src/games/TriviaGameRoom.jsx` (admin UI), `backend/src/services/triviaRealtime.js` (lines ~1297–1378).

---

## Phase 1 — Shared contracts

### 1.1 Socket event names (`shared/enigmaPulse/constants.js`)

- [ ] Add to `EnigmaPulseEvents`:
  - `ADMIN_EDIT_QUESTION: 'ep_admin_edit_question'`
  - `ADMIN_DELETE_QUESTION: 'ep_admin_delete_question'`
  - `ADMIN_ACTION_SUCCESS: 'ep_admin_action_success'`
  - `ADMIN_ERROR: 'ep_admin_error'`
- [ ] No collision with MathRush / Trivia event names.

### 1.2 Payload shapes (document in code comments)

**Edit emit (client → server):**

```json
{
  "roomId": "uuid",
  "questionId": "firestore-doc-id",
  "updateFields": {
    "question": "string",
    "options": ["a","b","c","d"],
    "correctIndex": 0,
    "difficulty": "easy|medium|hard",
    "active": true,
    "hint": "",
    "explanation": ""
  }
}
```

**Delete emit:**

```json
{ "roomId": "uuid", "questionId": "firestore-doc-id" }
```

**Success (server → admin socket):**

```json
{ "action": "edit|delete", "questionId": "...", "roomId": "..." }
```

**Error:**

```json
{ "message": "human-readable", "code": "optional" }
```

- [ ] Enforce `type: syllogism`, `category: Syllogism`, `gameType: enigma_pulse` on server merge (do not allow admin to break bank rules).

---

## Phase 2 — Backend (authoritative)

File: `backend/src/services/enigmaPulseRealtime.js` (+ small helper module if needed).

### 2.1 Admin guard

- [ ] `assertEnigmaAdmin(socket)`:
  - Reads `socket.user.email` (lowercase) === `process.env.ADMIN_EMAIL || 'info@aljazeeragc.com'`.
  - If P1: load `users/{uid}.role === 'admin'` via Admin Firestore.
  - On fail: emit `ep_admin_error`, return false.
- [ ] Never trust client `isAdmin` flag.

### 2.2 Match guard

- [ ] Resolve `match = matches.get(roomId)`.
- [ ] Require `match.status === 'playing'` (optional: allow `preparing` — if not, reject).
- [ ] Require `String(match.gameKey).toLowerCase() === 'syllogism'`.
- [ ] Require `questionId` present and non-empty.

### 2.3 Firestore writes (reuse existing service)

- [ ] **Edit:** `updateQuestion(questionId, updateFields, adminUid)` from `firestoreQuestionAdmin.js`.
- [ ] **Delete (P2 soft):** `updateQuestion(questionId, { active: false }, adminUid)` OR hard `deleteQuestion` if P2 = hard.
- [ ] Catch 400/404/409 and map to `ep_admin_error` message.

### 2.4 In-memory deck patch (critical — prevents “UI shows old question”)

Implement helpers:

- [ ] `findQuestionSlots(match, questionId)` → `[{ uid, index }, ...]` scanning `match.questionsByUid`.
- [ ] `applyUpdatedQuestionToMatch(match, updatedDoc)`:
  - For each slot: set `questionsByUid[uid][index]` = `enrichQuestionForPlay(normalizedRow)`.
  - Set `clientQuestionsByUid[uid][index]` = `normalizeQuestionForClient(..., 'syllogism')`.
- [ ] `removeQuestionFromDecks(match, questionId)`:
  - Remove all indices with that id from each uid’s arrays (splice from end to start to preserve indices).
  - Recompute `match.questionTarget = min(deckA.length, deckB.length)` or keep 10 and pad — **align with P3**.

### 2.5 Live broadcast after patch

- [ ] If edited/removed slot `index === match.questionIndex` for a connected player:
  - Emit `EnigmaPulseEvents.SYNC_STATE` with `roomPayloadForUid(match, uid)` to that player’s socket.
  - Or re-emit `QUESTION_START` for that uid only (either is fine; pick one and use consistently).
- [ ] Do **not** reset timer unless product says so (P6).
- [ ] If delete hits **current** round (P3): after deck patch, call existing `resolveQuestion(roomId, 'admin_skip')` (or new reason string) so turn advances cleanly.

### 2.6 Delete edge cases (no glitches)

- [ ] If deck length &lt; `ENIGMA_PULSE.QUESTION_COUNT` after delete:
  - Either inject replacement question from `fetchSyllogismCandidatesMerged` (complex), or
  - Allow short match + log warning (existing pattern for Sequence IQ), or
  - Abort match with `ep_admin_error` + graceful `MATCH_END` — **pick one in P3**.
- [ ] Bot match: same deck rules for `uid` human + bot decks.
- [ ] `questionSummary` / scoring: if current question deleted mid-turn, clear `answersByQuestion` for that index before advance.

### 2.7 Cache invalidation

- [ ] After successful edit/delete: `clearSyllogismPoolCache()` from `syllogismPoolCache.js`.
- [ ] Optional: clear `enigmaCandidatePoolCache` entries for `syllogism|Syllogism|*` if exposed.

### 2.8 Audit (recommended)

- [ ] Write `adminLogs` doc: `{ action, questionId, roomId, adminUid, adminEmail, createdAt }`.

### 2.9 Socket registration

- [ ] `socket.on(EnigmaPulseEvents.ADMIN_EDIT_QUESTION, async (data) => { ... })`
- [ ] `socket.on(EnigmaPulseEvents.ADMIN_DELETE_QUESTION, async (data) => { ... })`
- [ ] Register inside same connection setup as other `ep_*` handlers.

---

## Phase 3 — Frontend (`Syllogism.jsx`)

### 3.1 Admin detection

- [ ] Import `ADMIN_EMAIL` from `frontend/src/config/admin.js` (not hardcoded string).
- [ ] `const isAdmin = String(gameUser?.email || '').toLowerCase() === ADMIN_EMAIL`.
- [ ] Optional: also require `gameUser.role === 'admin'` if P1 includes role (must match server).

### 3.2 UI (only when playing + question loaded)

- [ ] Show Edit / Delete below question panel when `isAdmin && room?.question?.id && status === 'playing'`.
- [ ] Hide admin actions for ids matching `/^epq_/` (local fallback) if P5.
- [ ] Reuse styles from `triviaGame.css` (`GameView-Admin-*`) or add minimal classes in `Syllogism.css`.

### 3.3 Edit modal

- [ ] `handleOpenEditModal`: `api.getAdminQuestion(room.question.id)` (Firebase ID token — same as dashboard).
- [ ] Fields: question text, option1–4, correctIndex, difficulty, active, hint, explanation.
- [ ] Lock read-only in UI: category `Syllogism`, type `syllogism`, gameType `enigma_pulse`.
- [ ] `handleSaveEdit`: validate 4 non-empty options; emit `ep_admin_edit_question`.

### 3.4 Delete

- [ ] Confirm dialog: explains Firestore + live match impact.
- [ ] Emit `ep_admin_delete_question` with `roomId`, `questionId`.

### 3.5 Socket listeners

- [ ] `ep_admin_action_success` → toast success; if current question id matches, rely on server `SYNC_STATE` / `QUESTION_START` to refresh `room`.
- [ ] `ep_admin_error` → toast error via `resolveEnigmaPulseErrorToast` or plain message.
- [ ] Cleanup listeners on unmount.

### 3.6 No regression to core play

- [ ] Normal players never see admin buttons.
- [ ] `handleOptionClick` unchanged for non-admin.
- [ ] Power-ups remain removed (no dependency on admin flow).

---

## Phase 4 — Security & consistency

- [ ] Server rejects non-admin socket emits (403-style message on `ep_admin_error`).
- [ ] REST `/api/admin/questions/*` still works for off-game editing (unchanged).
- [ ] Align Trivia socket admin check with `ADMIN_EMAIL` env (future refactor — optional).
- [ ] Firestore security rules: clients cannot write `questions` directly (verify rules unchanged).
- [ ] Admin REST calls from game room use same Bearer token as dashboard (`authToken.js` / Firebase ID token).

---

## Phase 5 — Manual QA matrix (must pass before ship)

### 5.1 Auth

| # | Steps | Expected |
|---|--------|----------|
| A1 | Non-admin in Syllogism, emit edit via devtools | `ep_admin_error`, no Firestore change |
| A2 | Admin email but `role !== admin` (if P1) | Rejected on socket |
| A3 | Admin full credentials | Edit/delete allowed |

### 5.2 Edit — Firestore

| # | Steps | Expected |
|---|--------|----------|
| E1 | Edit question text in room | `questions/{id}.question` updated in console |
| E2 | Edit `correctIndex` | Document `correctIndex` updated |
| E3 | Invalid payload (3 options) | 400, no partial write |

### 5.3 Edit — live match (no glitch)

| # | Steps | Expected |
|---|--------|----------|
| L1 | Edit **current** question mid-turn | UI updates without stuck overlay; timer continues (P6) |
| L2 | Edit question in **future** slot (same id in deck) | Later round shows new text |
| L3 | Both players have **different** questions at same index | Each deck slot with that id updated independently |
| L4 | Submit answer after edit | Grading uses **new** `correctIndex` from `questionsByUid` |
| L5 | Reconnect after edit | `ep_sync_state` shows updated `room.question` |

### 5.4 Delete

| # | Steps | Expected |
|---|--------|----------|
| D1 | Soft-delete (P2) | `active: false`; absent from **new** match decks after cache clear |
| D2 | Delete **future** question in deck | Match continues; round count consistent |
| D3 | Delete **current** question (P3) | Turn advances; no blank screen; no infinite timer |
| D4 | Delete last question in deck | Behavior per P3 (advance / end / replace) — no server crash |

### 5.5 Modes

| # | Mode | Expected |
|---|------|----------|
| M1 | Practice (bot) | Admin edit works; bot still answers |
| M2 | 1v1 | Both humans see sync after edit |
| M3 | Invite / private | Same admin behavior |

### 5.6 Regression

| # | Area | Expected |
|---|------|----------|
| R1 | Match without admin | Unchanged gameplay |
| R2 | Admin dashboard Questions tab | Still CRUD works |
| R3 | New Syllogism match after edit | Uses updated bank (after cache clear) |
| R4 | Sequence IQ / Word Cipher | No new socket handlers breaking them |

---

## Phase 6 — Observability & rollout

- [ ] Log prefix `[EnigmaPulse][admin_question]` for edit/delete with `roomId`, `questionId`, `adminUid`.
- [ ] Document env vars: `ADMIN_EMAIL`, `VITE_ADMIN_EMAIL`.
- [ ] Deploy note: multi-instance Socket.IO — admin action must hit the node hosting the room (document limitation or add Redis adapter later).
- [ ] Update `docs/ENIGMAPULSE_GAME_AND_QUESTIONS.md` with in-game admin section (one paragraph + link to this checklist).

---

## Phase 7 — Implementation order (suggested)

1. Shared events (`constants.js`)  
2. Backend helpers + socket handlers + cache clear  
3. Manual test with `socket.emit` from admin client (before UI)  
4. `Syllogism.jsx` UI + listeners  
5. Full QA matrix (Phase 5)  
6. Docs update  

---

## Definition of done

- [x] Admin can edit/delete Syllogism questions **during play** only when authorized.
- [x] Every successful change is reflected in **Firestore `questions`**.
- [x] Every successful change is reflected in **active match** decks and current UI without desync.
- [x] Non-admin cannot perform actions via socket or UI (server enforced).
- [ ] Phase 5 QA matrix passed manually in staging.
- [x] Implementation files listed below landed.

**Implemented:** `shared/enigmaPulse/constants.js`, `backend/src/services/enigmaPulse/matchQuestionAdmin.js`, `backend/src/services/enigmaPulseRealtime.js`, `frontend/src/games/EnigmaPulse/Syllogism.jsx`.

---

## Files to touch (implementation map)

| Layer | File |
|-------|------|
| Events | `shared/enigmaPulse/constants.js` |
| Server | `backend/src/services/enigmaPulseRealtime.js` |
| Server (optional helper) | `backend/src/services/enigmaPulse/matchQuestionAdmin.js` (new) |
| Firestore | `backend/src/services/firestoreQuestionAdmin.js` (reuse only) |
| Cache | `backend/src/services/enigmaPulse/syllogismPoolCache.js` |
| Client | `frontend/src/games/EnigmaPulse/Syllogism.jsx` |
| Styles | `frontend/src/games/EnigmaPulse/Syllogism.css` and/or `frontend/src/lobbyPages/triviaGame.css` |
| Config | `frontend/src/config/admin.js`, `backend/src/middleware/adminMiddleware.js` |

---

*Checklist version: 1.0 — aligned with codebase analysis (Trivia precedent + EnigmaPulse per-player decks).*
