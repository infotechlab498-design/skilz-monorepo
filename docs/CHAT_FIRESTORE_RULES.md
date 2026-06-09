# Firestore rules — lobby chat (`lobbies` + `messages`)

## Critical analysis (what was wrong)

1. **`match /lobbies/{lobbyId}` — `allow read`**  
   Previously: `allow read: if lobbyAllowsUser(resource.data);`  
   For a **document that does not exist**, `resource.data` does not satisfy `lobbyAllowsUser` (e.g. no `lobbyId` field). The client’s `ensureLobbyInitialized` runs **`runTransaction` → `tx.get(lobbyRef)`** first; that **read** was denied, so the transaction never created `math-rush` (or any new simple-chat lobby).

2. **`match /lobbies/{lobbyId}/messages/{messageId}` — `allow read`**  
   Previously used `lobbyAllowsUser(get(.../lobbies/$(lobbyId)).data)` only. If the parent lobby doc was missing, the same logic failed for listeners.

3. **`allow create` on messages**  
   Still requires **`parent.exists && lobbyAllowsUser(parent.data)`** so users cannot create orphan messages under a non-existent lobby path.

## What the rules now require for chat

| Path | Read | Create / update |
|------|------|-------------------|
| `lobbies/{lobbyId}` | **Signed-in** and (**doc missing** OR **member/host** OR **simple-chat shape** without membership fields). | Unchanged: host-style create **or** `isSimpleChatLobby` create; simple-chat updates only via allowed field diff. |
| `lobbies/{lobbyId}/messages/{messageId}` | **Signed-in** and (parent **missing** OR parent passes `lobbyAllowsUser`). | **Signed-in**, parent **exists** and passes `lobbyAllowsUser`, `uid` matches auth, `type` in `text` / `voice` / `system`, `createdAt == request.time`, required keys. |

`lobbyAllowsUser` is unchanged: host, `memberMap`, `participantMap`, `memberUids`, or open **simple chat** (no membership keys + string `lobbyId`).

## Deploy to Firebase

Rules file (per `backend/firebase.json`): `backend/firebase/firestore.rules`.

From the **`backend`** directory (where `firebase.json` lives):

```bash
cd backend
firebase login
firebase use skilz-63d0a
firebase deploy --only firestore:rules
```

If your default project is already set in `.firebaserc`, you can omit `firebase use`.

**Dry run (compile + validate without publishing):**

```bash
cd backend
firebase deploy --only firestore:rules --dry-run
```

**Using npx (no global CLI):**

```bash
cd backend
npx firebase-tools deploy --only firestore:rules
```

After deploy, reload the app (signed in with Firebase Auth) and open Math Rush chat again.

## Trivia category chat IDs

`TriviaLobby` uses **`lobbyId = trivia_chat_${category}`** (e.g. `trivia_chat_history`) so the chat subcollection never shares a document id with an unrelated `lobbies/history` lobby row that could deny reads under `lobbyAllowsUser`.

## Reserved `lobbies/history` (global chat)

Rules also treat **`lobbyId == "history"`** as an **authenticated-only** global chat path: any signed-in user may **read** the parent doc and **read/create** `messages` there, without `hostUid` / `memberMap`. This is an explicit carve-out alongside `lobbyAllowsUser` / simple-chat logic; private match lobbies are unchanged.

Long term, a dedicated collection (e.g. `globalChat/messages`) avoids overloading the `lobbies` namespace and makes policy and retention easier to reason about.
