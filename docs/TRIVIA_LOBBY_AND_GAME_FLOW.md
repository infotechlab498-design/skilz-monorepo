


# Trivia lobby, chat, and realtime game — brief technical overview

This note describes how the **Trivia lobby** (`frontend/src/lobbyPages/TriviaLobby.jsx`), **lobby chat** (`ChatBox`), and **live trivia matches** work together, including **where questions come from** and **how answers are judged**.

---

## 1. Lobby layout and chat (not the quiz itself)

- **Lobby UI**: Category cards (History, Current Affairs), difficulty, and modes — Practice (solo vs bot), Quick Match (queue), Private room — are rendered in `TriviaLobby.jsx`.
- **Chat**: The lobby mounts `ChatBox` with `lobbyId={category}` (the selected trivia category value, e.g. `history` or `current_affairs`).
  - **Messages** are stored and synced via **Firestore** (`ensureLobbyInitialized`, `subscribeToChat`, `sendMessage` in `frontend/src/firebase/chat.js`).
  - **Presence, typing, and optional realtime relay** use the separate **Socket.IO lobby channel** (`socketService`, events such as `lobby:typing`) — this is **social lobby chat**, not the trivia match socket protocol.
- **Important separation**: Lobby chat channels follow **category**, not **match `roomId`**. Actual gameplay uses a different Socket.IO contract once you enter `/trivia/game/:roomId`.

---

## 2. How a match starts (frontend → backend)

All realtime trivia flows share the **same Socket.IO client** as Math Rush (`frontend/src/games/mathRush/lib/socket.js`), authenticated per user.

| Mode | Client emission | Server behavior (high level) |
|------|-----------------|------------------------------|
| **Solo vs Bot** | `trivia_join_queue` with `soloBot: true` | Immediately pairs the player with an internal bot opponent and starts the match. |
| **Quick Match (1v1)** | `trivia_join_queue` with `soloBot: false` | Enters a queue; pairs with another human when **same difficulty + category** and **similar XP bucket**; if nobody is found within ~12s, server emits `trivia_match_not_found` (frontend also stops searching around the same window). |
| **Private room** | `trivia_create_private` | Host pays entry fee; gets a `roomId`. Second player opens `/trivia/game/:roomId`, emits `trivia_join_private`; when guest joins, server loads questions from Firestore and starts play. |

On successful start, the lobby listens for **`trivia_game_started`** (and private **`trivia_private_created`**) and **navigates** to `TriviaGameRoom` at `/trivia/game/:roomId` with initial match state in router state.

---

## 3. Live gameplay (`TriviaGameRoom`)

- **Room**: `frontend/src/games/TriviaGameRoom.jsx` joins the Socket.IO room by emitting `trivia_join_private` with `{ roomId, uid, displayName, photoURL }` (used for both private invites and reconnection paths aligned with the server).
- **State**: Match snapshots arrive as **`trivia_game_started`**, **`trivia_update_game`**, **`trivia_timer_update`**, **`trivia_game_ended`**, plus error/reconnect events (`trivia_error`, `trivia_private_cancelled`, reconnect grace).
- **Answering**: When `gameState.currentTurnUid` equals the signed-in user, the client emits **`trivia_submit_answer`** with `{ roomId, uid, selectedIndex }`. The **server** validates turn and correctness; the client does not decide scores alone.

---

## 4. Where questions come from (backend)

Implementation: `backend/src/services/triviaRealtime.js` calls **`fetchQuestionsFromFirestore`** (`backend/src/services/firestoreQuestionBank.js`) when a match begins (queue/bot or private when the second player joins).

### Firestore question bank

1. Active questions live in **`questions/{docId}`** with `category`, `difficulty`, `question`, `options` (4 strings), `correctIndex`, `active`, `tags`, `questionHash`, timestamps.
2. For each match, the server loads candidates with **`category` + `difficulty` + `active == true`**, excludes IDs already present under **`users/{uid}/playedQuestions/{questionId}`** for the **host / queue initiator** (`p1.uid`), shuffles, and picks **10**. Both players receive the **same** `_fullQuestions` payload.
3. If fewer than 10 unplayed questions remain for that user/category/difficulty, the server **clears** that slice of `playedQuestions` and retries once (full cycle).
4. After the match ends, **`recordPlayedQuestions`** writes the 10 IDs for **each human player** and **prunes** `playedQuestions` to a rolling cap (**500** oldest removed by `playedAt`).

### Admin + API

- Admins manage the bank from **Admin Dashboard → Questions** (`frontend/src/admin/AdminQuestions.jsx`), backed by **`/api/admin/questions`** (`backend/src/routes/adminQuestionsRoutes.js`).
- No AI or OpenTDB is used for live trivia.

**Supported categories** (normalized on server): `history`, `current_affairs`.

### Constants (server)

- **`QUESTION_COUNT`**: 10 questions per match (`triviaRealtime.js`).
- **`QUESTION_SEC`**: 15 seconds per question; server drives **`trivia_timer_update`** and advances on timeout.

Full question objects (including **`correctIndex`**) live server-side in **`_fullQuestions`**; clients receive **`publicMatch`** payloads where **`correctIndex` is stripped** — answers are resolved only on the server.

---

## 5. Scoring, turns, and bot behavior

- **Turn order**: After each answered or timed-out question, **`currentQuestionIndex`** increments and **`currentTurnUid`** switches to the **other** player (`advanceAfterResult` in `triviaRealtime.js`).
- **Human answer**: Correct option adds **+10** score and increments **`correctCount`**; incorrect adds **0**.
- **Timeout**: Timer expiry advances without awarding points for that turn.
- **Bot**: When it is the bot’s turn, after a random delay within configured bounds, the bot picks the correct index with probability **`botCorrectRate(difficulty)`** (easy ≈ 60%, medium ≈ 75%, hard ≈ 85%); otherwise it picks a wrong option.

Economy (entry fee, refunds, win/draw rewards, XP) is settled in **`settleMatchEconomy`** when the match ends; **`TriviaGameRoom`** may also call **`postGameReward`** for client-visible rewards.

---

## 6. Persistence

- During play, the server may **`persistGameDoc`** to Firestore collection **`games`** (`roomId` doc) with status, players, stripped question list, and pointers — useful for debugging/recovery; authoritative live play remains in-memory on the Socket.IO server unless extended elsewhere.

---

## 7. Related files (quick reference)

| Area | Path |
|------|------|
| Lobby UI + chat mount | `frontend/src/lobbyPages/TriviaLobby.jsx` |
| Lobby chat component | `frontend/src/lobbyPages/components/ChatBox.jsx` |
| Firestore chat helpers | `frontend/src/firebase/chat.js` |
| Game room UI | `frontend/src/games/TriviaGameRoom.jsx` |
| Trivia Socket.IO handlers | `backend/src/services/triviaRealtime.js` |
| Firestore fetch + played tracking | `backend/src/services/firestoreQuestionBank.js` |
| Admin CRUD / CSV / bulk | `backend/src/services/firestoreQuestionAdmin.js` |

---

*This document reflects the codebase behavior at authoring time; env flags (`TRIVIA_*`) and provider availability can change runtime outcomes without code edits.*




