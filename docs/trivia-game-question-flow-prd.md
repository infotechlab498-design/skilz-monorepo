# Trivia Game Question Flow PRD (Code Analysis)

## 1) Purpose

This document explains how Trivia matchmaking and gameplay work across:

- `frontend/src/lobbyPages/TriviaLobby.jsx`
- `frontend/src/games/TriviaGameRoom.jsx`

It also documents the fundamentals behind how Trivia questions are fetched from backend storage, and why the backend can determine that a given question belongs to this game session.

---

## 2) Product Scope

### In Scope

- Trivia lobby setup (category, difficulty, mode)
- Match creation and join via Socket.IO
- Question delivery to clients
- Turn-based answer processing
- Match completion and rewards
- Rules that map questions to this specific game

### Out of Scope

- Admin content creation UI for questions
- Non-trivia game modes (Math Rush, Enigma Pulse, Ludo)

---

## 3) Entry Points and Routing

Frontend routes:

- `/triviaLobby/:gameId` -> `TriviaLobby`
- `/trivia/game/:roomId` -> `TriviaGameRoom`

The lobby is responsible for preparing match parameters and starting/joining sessions.
The game room is responsible for live gameplay state, timers, turns, answer submission, and result handling.

---

## 4) High-Level System Architecture

### Frontend

- `TriviaLobby.jsx` selects:
  - `category` (current options: `history`, `current_affairs`)
  - `difficulty` (`easy`, `medium`, `hard`)
  - mode (`Solo vs Bot`, `1v1`, `Private-Room`)
- `TriviaLobby.jsx` emits matchmaking events over Socket.IO.
- `TriviaGameRoom.jsx` listens to trivia realtime events and sends turn answers.

### Backend

- `backend/src/services/triviaRealtime.js`
  - Owns queueing, pairing, room lifecycle, timers, turn progression, scoring
  - Calls question-bank service to fetch question sets for a room
- `backend/src/services/firestoreQuestionBank.js`
  - Owns question retrieval logic from Firestore
  - Normalizes category/difficulty
  - Filters/validates docs
  - Excludes already played questions per user
  - Resets played history for category+difficulty if needed

### Storage

- Firestore `questions` collection (source of trivia questions)
- Firestore `users/{uid}/playedQuestions` (history used to avoid repeats)
- Optional persisted game snapshot in Firestore `games/{roomId}`

---

## 5) Core Match Lifecycle (Realtime Path)

## 5.1 Lobby -> Queue/Private Creation

From `TriviaLobby`:

- `trivia_join_queue` emitted for:
  - Solo vs Bot (`soloBot: true`)
  - 1v1 (`soloBot: false`)
- `trivia_create_private` emitted for private rooms
- payload includes:
  - `uid`, `displayName`, `photoURL`
  - `difficulty`, `category`
  - `xp` (used for rank bucketing)

## 5.2 Backend Matching Rules

In `triviaRealtime.js`, players are paired only when lobby constraints match:

- Same `difficulty`
- Same normalized `category`
- Similar XP bucket (difference <= 1)

If no human match appears within timeout, user gets `trivia_match_not_found`.

## 5.3 Question Fetch and Room Start

Once a match is formed, backend calls:

- `fetchQuestionsFromFirestore({ uid, category, difficulty, count: 10 })`

Then it initializes room state:

- `_fullQuestions`: full canonical list (includes `correctIndex`)
- `gameState.questions`: stripped/public version (no answer key)
- `gameState.currentQuestion`: current stripped question
- `currentTurnUid` starts with host/player1

Finally emits:

- `trivia_game_started`
- periodic `trivia_timer_update`
- ongoing `trivia_update_game`

## 5.4 Gameplay Loop

From `TriviaGameRoom`:

- User can answer only on own turn
- emits `trivia_submit_answer` with `roomId`, `selectedIndex`

Backend:

- verifies turn ownership (`currentTurnUid`)
- compares `selectedIndex` against server-side `correctIndex` from `_fullQuestions`
- updates score (+10 on correct)
- advances to next question, flips turn, restarts timer
- emits updated match snapshot

## 5.5 Match End

Backend ends when question deck completes or reconnect grace forfeits:

- emits `trivia_game_ended`
- settles coins/xp
- records played question IDs for each human player with category+difficulty

Frontend game room:

- shows result UI
- posts reward reconciliation (`/api/game/reward`)

---

## 6) Fundamentals: How Questions Are Selected for This Game

This is the key logic you asked for.

## 6.1 Game Identity is Encoded by Lobby Parameters

A Trivia match is defined by:

- `gameType = trivia` (room type)
- `category`
- `difficulty`

These parameters are chosen in `TriviaLobby` and sent in socket payload.

## 6.2 Category Normalization Prevents Invalid Buckets

Backend normalization (`normalizeTriviaCategory`) maps inputs to canonical categories:

- any current-affairs variant -> `current_affairs`
- everything else -> `history`

So even if frontend sends variant strings, question retrieval uses stable category keys.

## 6.3 Difficulty Normalization Locks to Supported Tiers

`normalizeTriviaDifficulty` allows:

- `easy`, `medium`, `hard`
- defaults to `easy` for unknown values

This prevents off-spec values from pulling mixed data.

## 6.4 Firestore Query Filters Define “Belongs to This Game”

A question is considered eligible when it matches:

- `category == normalizedCategory`
- `difficulty == normalizedDifficulty`
- `active` is true (or treated active in fallback stage)
- valid shape (question text, 4 options, `correctIndex` in range 0..3)

Therefore, belonging is data-contract based, not guessed by frontend.

## 6.5 User-Specific De-duplication

Fetcher excludes questions in:

- `users/{uid}/playedQuestions`

If fewer than required count remain:

- resets played history for this category+difficulty
- retries selection once

If still insufficient:

- throws `INSUFFICIENT_QUESTIONS`
- realtime service maps to user-facing error

## 6.6 Server-Authoritative Correctness

Frontend never decides answer correctness in realtime path.
Backend holds `_fullQuestions.correctIndex` and only sends stripped questions to clients.
This is why the game can reliably evaluate answers and prevent answer-key leakage.

---

## 7) Why the Backend Knows a Question Belongs to Trivia (Not Another Game)

Because the question pipeline is scoped by trivia-specific services and contracts:

1. Trivia sockets (`trivia_*`) create trivia room state only.
2. Trivia service requests question bank with trivia category/difficulty.
3. Question docs are filtered by trivia schema fields (`category`, `difficulty`, `options`, `correctIndex`).
4. Retrieved set is attached to trivia match state and used only by that room.
5. Match completion writes played markers under trivia lifecycle.

In short: game identity is enforced by service boundary + room metadata + Firestore filters.

---

## 8) Frontend Behavior Notes (Important)

There are two gameplay patterns visible in `TriviaLobby.jsx`:

1. **Current production flow (primary)**  
   Uses `trivia_*` socket events and navigates to `TriviaGameRoom`.

2. **Legacy/embedded flow (secondary in same file)**  
   Contains local in-component game logic and REST calls like:
   - `/api/game/submit`
   - `/api/game/end`

`TriviaGameRoom.jsx` is the modern realtime room implementation and aligns with `triviaRealtime.js`.

---

## 9) Realtime Event Contract Summary

## Client -> Server

- `trivia_join_queue`
- `trivia_leave_queue`
- `trivia_create_private`
- `trivia_join_private`
- `trivia_cancel_private`
- `trivia_submit_answer`
- `trivia_reconnect_user` / `reconnect_user`

## Server -> Client

- `trivia_waiting`
- `trivia_match_found`
- `trivia_game_started`
- `trivia_update_game`
- `trivia_timer_update`
- `trivia_game_ended`
- `trivia_private_created`
- `trivia_private_cancelled`
- `trivia_match_not_found`
- `trivia_error`
- `trivia_reconnect_grace`
- `trivia_reconnect_cleared`

---

## 10) Data Contract for Runtime Trivia Question

Runtime question object used by game room:

- `id: string`
- `category: string`
- `difficulty: string`
- `text: string`
- `options: string[4]`
- `imageUrl: string`
- `correctIndex: number` (server-only in `_fullQuestions`; stripped from client payload)

---

## 11) Risks / Gaps Observed

- `TriviaLobby.jsx` is very large and mixes modern realtime orchestration with legacy local gameplay code, increasing maintenance risk.
- Some user-facing category assumptions default to history when category is unrecognized.
- Legacy REST submit/end endpoints and realtime endpoints coexist, which can confuse future contributors unless formally separated.

---

## 12) Recommended Refactor Backlog

1. Split `TriviaLobby.jsx` into:
   - `TriviaLobbyConfigPanel`
   - `TriviaModeSelector`
   - `TriviaMatchmakingController`
2. Move legacy REST gameplay path behind a feature flag or remove if unused.
3. Add explicit typed contract file for trivia socket payloads shared by frontend/backend.
4. Add integration tests for:
   - category normalization
   - insufficient-question handling
   - turn enforcement
   - reconnect grace forfeit

---

## 13) Acceptance Checklist for “Question Belongs to Game”

- [x] Lobby sends category+difficulty with player identity
- [x] Backend normalizes category/difficulty to canonical values
- [x] Firestore fetch filters to matching category+difficulty
- [x] Question docs validated for trivia format
- [x] Played-history excludes repeats per user
- [x] Server keeps answer key private and authoritative
- [x] Only trivia room lifecycle consumes fetched set

