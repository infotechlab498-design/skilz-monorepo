# Firestore lobby chat: internal assertion errors (`b815` / `ca9`)

This document explains console errors like:

```text
FIRESTORE (12.11.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)
CONTEXT: {"Pc":"Error: ... INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9) CONTEXT: {\"ve\":-1}\n
    at __PRIVATE_TargetState.We ...
    at __PRIVATE_WatchChangeAggregator.forEachTarget ...
    at __PRIVATE_onWatchStreamChange ...
```

It ties together **`frontend/src/firebase/chat.js`**, **`frontend/src/lobbyPages/components/ChatBox.jsx`**, **`frontend/src/main.jsx`**, and **`backend/firebase/firestore.rules`**.

---

## 1. Where the error actually originates

| Layer | Role |
|--------|------|
| **Your app code** | Calls `onSnapshot` via `subscribeToChat()` in `chat.js`. |
| **Firebase Web SDK** (`firebase/firestore`, bundled by Vite as `firebase_firestore.js`) | Maintains watch streams and aggregates server updates in `WatchChangeAggregator` / `TargetState`. |
| **Thrown location** | Inside minified helpers such as `__PRIVATE_TargetState.We`, `__PRIVATE_WatchChangeAggregator.tt`, `__PRIVATE_onWatchStreamChange` — **not** from your own `try/catch` around chat logic. |

So this is **not** a JavaScript syntax error in `chat.js`; it is an **internal invariant failure** inside the Firestore client when it processes watch-stream updates or teardown.

---

## 2. Known SDK issue (not a Firestore “backend” misconfiguration)

The exact pattern **`b815`** wrapping **`ca9`** with **`"ve":-1`** matches **open Firebase JS SDK bug reports**, for example:

- [firebase/firebase-js-sdk#9267](https://github.com/firebase/firebase-js-sdk/issues/9267) — `ca9` / `ve:-1`, `WatchChangeAggregator`, reproduced with **React Strict Mode** and rapid listener lifecycle.
- [firebase/firebase-js-sdk#9491](https://github.com/firebase/firebase-js-sdk/issues/9491) — same **`b815`** / **`ca9`** nesting, including failures during **unsubscription**.

Maintainers have described this as a **race in snapshot listener / watch teardown handling**. A fix was tracked via SDK development (e.g. discussion around PR **#9842** on that issue thread — verify changelog when upgrading).

**Important:** This class of failure is **not** explained by “wrong composite index” or “missing Cloud Function” for lobby chat. Your listener query is a single `orderBy("createdAt")` on a subcollection, which uses Firestore’s automatic single-field indexing.

---

## 3. Why your stack trace mentions Vite and `localhost:5173`

Dev builds serve prebundled dependencies from `node_modules/.vite/deps/firebase_firestore.js`. The stack only shows **where the SDK threw**, not a bug in Vite itself.

---

## 4. Chat-related files and how they interact

### 4.1 `frontend/src/firebase/chat.js`

| Piece | Purpose |
|--------|---------|
| `ensureLobbyInitialized` | Transaction: create `lobbies/{lobbyId}` if missing; optionally add a welcome message under `messages`. Used by `sendMessage`, `fetchRecentMessages`, `sendVoiceMessage`. |
| `subscribeToChat` | `onSnapshot` on `query(..., orderBy("createdAt", "asc"), limitToLast(N))` (bounded window), forwards **`docChanges()`** (including **`removed`** when rows fall out of the window) to the UI callback. |
| `sendMessage` / `sendVoiceMessage` | `addDoc` on `lobbies/{lobbyId}/messages`. |

**Note:** There is a **`debugLog`** helper posting to `http://127.0.0.1:7889/...`. That is local instrumentation; it fails silently (`.catch(() => {})`) but should not ship to production as-is.

### 4.2 `frontend/src/lobbyPages/components/ChatBox.jsx`

- Mounts a subscription when `lobbyId` changes (`useEffect`).
- Clears state and **`messageIdsRef`** on lobby change.
- Uses **React `StrictMode`** globally (see below).

### 4.3 `frontend/src/lobbyPages/components/VoiceRecorder.jsx`

- Calls `sendVoiceMessage` from `chat.js` only; **no** separate Firestore listener. Not on the hot path for **`WatchChangeAggregator`** errors unless uploads trigger concurrent writes while listens run.

### 4.4 `frontend/src/main.jsx`

```jsx
<StrictMode>
  ...
</StrictMode>
```

In **development**, Strict Mode **double-invokes** effects and cleanup to surface side-effect bugs. That **subscribes and unsubscribes listeners quickly**, which matches **reported reproducers** for **`ca9`/`b815`** in the SDK issue tracker.

Even if your production build disables Strict Mode, similar races can still occur with **fast route changes**, **conditional mounts**, or **multiple listeners** elsewhere in the app.

### 4.5 Direct messages (different code path)

`frontend/src/components/chat/DirectMessageModal.jsx` uses **`frontend/src/api/dmApi.js`** (`dmThreads`, not `lobbies/.../messages`). DM issues would be analyzed separately; the stack you pasted is consistent with **lobby `onSnapshot`**, not DM-specific paths.

---

## 5. Firestore security rules (backend policy, not SDK internals)

Relevant sections of `backend/firebase/firestore.rules`:

- **`match /lobbies/{lobbyId}`** — read allowed when `lobbyAllowsUser(resource.data)` (includes **`isSimpleChatLobby`** shape used by chat initialization).
- **`match /lobbies/{lobbyId}/messages/{messageId}`** — read allowed when `lobbyAllowsUser(get(.../lobbies/$(lobbyId)).data)`.

If the **parent lobby document does not exist**, the `get(...)` in the messages rule **fails the rule check** → clients typically see **`permission-denied`** in the **`onSnapshot` error callback**, **not** an internal assertion.

To align client behavior with rules, the lobby document should exist **before** listening (see code change: **`ensureLobbyInitialized` before `subscribeToChat`** for authenticated users).

**Deployed rules:** Ensure `firebase deploy --only firestore:rules` has been run so production matches this repo; mismatch causes **`permission-denied`**, still not **`ca9`**.

---

## 6. Application-level caveats (real bugs, but different symptoms)

| Topic | Symptom | Relation to `b815`/`ca9` |
|--------|---------|---------------------------|
| **`docChanges()` only** | If listener semantics ever omit expected batches in edge cases, UI might miss updates. | Unrelated to internal assertion; would show as missing messages. |
| **Optimistic `opt_*` messages** | Real server IDs never dedupe against optimistic rows unless reconciled by correlation ID. | UX issue only. |
| **`permission-denied`** | Rules / missing lobby doc / unauthenticated user. | Proper Firestore error; handled by error callback. |

---

## 7. Recommended mitigations

1. **Upgrade `@firebase/firestore` / `firebase`** periodically and read release notes for fixes to **`ca9`** / **`WatchChangeAggregator`** (see GitHub issues above).
2. **Development:** Temporarily disable **`StrictMode`** around the app root **only to confirm** whether the crash frequency drops (diagnostic, not a long-term product strategy).
3. **Ensure lobby exists before `onSnapshot`** for authed flows so rules’ `get(/lobbies/...)` succeeds (`ensureLobbyInitialized` before subscribe).
4. **Avoid redundant overlapping listeners** on the same query in multiple components.
5. **Optional:** `setLogLevel('debug')` from `firebase/firestore` briefly during repro to capture SDK logs for a Firebase issue report.

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Is `chat.js` “wrong” syntactically? | No. |
| Is this caused by missing Firestore indexes for this query? | No — single-field `orderBy` on `createdAt` is fine. |
| Is it a Cloud Function gap? | No — chat writes directly from the client with rules. |
| What is the primary explanation? | **Known Firestore Web SDK race** around snapshot watches (`ca9` / `b815`), worsened by **Strict Mode–style rapid subscribe/unsubscribe**. |
| What still matters in your codebase? | **Rules require a lobby doc** before message reads; initialize lobby before listen; remove localhost debug ingest for production. |

---

## References

- [Issue #9267 — ca9 / ve:-1 / Strict Mode / WatchChangeAggregator](https://github.com/firebase/firebase-js-sdk/issues/9267)
- [Issue #9491 — b815 during unsubscription](https://github.com/firebase/firebase-js-sdk/issues/9491)
