# Full Repo Correctness Audit

## Executive Summary
This repo is not fully correct yet.

- System fully working: `NO`
- Firebase correctly integrated: `PARTIALLY`
- Production-ready: `NO`

The Ludo path is the most mature subsystem: gameplay is mostly server-authoritative through Socket.IO, active rooms are persisted to Firestore, and wallet deduction is intended to be server-side only. But the repo still operates as a hybrid system with multiple authorities:

- Firebase Auth + Firestore profile docs
- Socket.IO gameplay authority
- legacy `users.json` / file-backed routes
- retired Firestore gameplay transport from active Ludo client flow (socket-authoritative path)

The five highest-priority correctness issues are:

1. Firestore snapshot persistence is still vulnerable to stale overwrite and silent divergence from in-memory state.
2. Lobby join and queue charging remain vulnerable to double-charge and no-refund edge cases.
3. Timer expiry and move resolution can still conflict because timeout progression mutates room state outside the room action lock.
4. The legacy Firestore gameplay path is still present in the client hook and service layer, creating a second match authority.
5. Firestore and Storage rules still permit overly broad access in lobby/chat/social areas and incomplete validation in several collections.

This document is correctness-first only. It intentionally excludes UI optimization, refactoring, Redis adoption, and scaling architecture changes except where they are needed to explain a correctness risk.

## System Flow
### 1. Login
Frontend login is Firebase-first.

- Client auth entrypoint: `frontend/src/services/authService.js`
- Firebase config: `frontend/src/firebase/config.js`
- Redux auth sync: `frontend/src/Components/FirebaseAuthSync.jsx`
- User wallet/profile sync: `frontend/src/Components/UserSync.jsx`

Observed flow:

1. User signs in with Firebase Auth.
2. `authService` finalizes sign-in, ensures a Firestore profile exists, and starts RTDB presence.
3. Redux receives Firebase user identity.
4. The backend still supports a parallel legacy JWT path through `backend/src/middleware/auth.js`.

Current identity authority:

- Primary: Firebase Auth `uid`
- Secondary/legacy: Skilz JWT signed with `JWT_SECRET`
- Registration gate: Firestore `users/{uid}`
- Mirrored compatibility store: `users.json`

### 2. Lobby
There are two Ludo entry flows:

- Online room flow: `frontend/src/games/LudoLobby.jsx` -> `/ludo/game/:roomId`
- Legacy local/session flow: `frontend/src/games/LudoLobby.jsx` -> `sessionService.createSession()` -> `/ludo/:gameId`

The online flow uses:

- `socketService.ensureConnected()` for Firebase-authenticated sockets
- `ludo:createRoom`
- `ludo:joinRoom`
- `ludo:queueJoin`

The legacy local flow still constructs a local config and navigates to a separate route backed by `sessionService`, which is a structural correctness hazard because it keeps a second gameplay lifecycle alive.

### 3. Matchmaking
Backend Ludo matchmaking lives in `backend/src/services/ludoRealtime.js`.

Authority during matchmaking:

- runtime room state in memory (`RoomStateStore` with `MemoryRoomStateAdapter`)
- Firestore write-through snapshots using `saveLudoRoomSnapshot()`
- server-side wallet deduction via `ludoWallet.tryDeductEntryFee()`

### 4. Gameplay
Active online gameplay is socket-authoritative.

- frontend reducer/state owner: `frontend/src/games/ludoGame/hooks/useLudoGame.js`
- socket transport: `frontend/src/services/socketService.js`
- server gameplay authority: `backend/src/services/ludoRealtime.js`
- persistence: `backend/src/services/ludo/roomManager.js` and `backend/src/services/ludo/firestoreLudoStore.js`

Client path:

1. `LudoGameRoom.jsx` joins room and hydrates local reducer state.
2. `useLudoGame()` listens to `ludo:gameState`, `ludo:diceRolled`, `ludo:turnComplete`, `ludo:reconnectState`, and vote events.
3. UI renders from reducer state.

Server path:

1. Room state is held in memory.
2. `registerRollDice()` and `registerMoveToken()` mutate in-memory state.
3. Updated state is emitted over Socket.IO.
4. State is persisted to Firestore snapshots with `saveLudoRoomSnapshot()`.

### 5. Result
Match end logic is handled in backend Ludo services.

- winner settlement and XP: `backend/src/services/ludoRealtime.js`
- Firestore match sync: `backend/src/services/ludoFirestoreSync.js`
- wallet and XP operations: `backend/src/services/ludo/ludoFirestoreWallet.js`

### 6. Wallet Update
Wallet truth is Firestore-based, but the wider repo still contains legacy file-backed account and checkout routes.

- authoritative Ludo entry deduction: backend wallet service
- compatibility user mirror: `backend/src/server.js` and `backend/src/services/dataService.js`
- risk: user state can drift between Firestore and JSON-backed legacy systems

## Source Of Truth
### Current authority map
- Authentication: Firebase Auth
- Socket auth: Firebase Admin verification in `backend/src/server.js`
- HTTP auth: Firebase Admin-verified ID token via `backend/src/middleware/auth.js`
- Online Ludo gameplay: Socket.IO + backend in-memory room state
- Ludo persistence: Firestore `ludoMatches/{matchId}`
- Finished match summaries: Firestore `matches/{matchId}`
- Wallet and user stats: Firestore `users/{uid}`
- Presence: RTDB `/presence/{uid}`
- Legacy platform/account routes: file-backed JSON storage

### Main mismatch
The repo is not running a single clean authority model. The Ludo subsystem is modernized, but the surrounding platform still exposes legacy JSON-backed and legacy-JWT-backed paths. That means correctness issues do not come from one bug alone; they come from multiple active authorities.

## Priority Findings
## 1. Firestore Transaction Bug / Stale Overwrite Risk
### Root cause
The repo improved Firestore persistence by adding revisioned writes, but the runtime model is still memory-first and snapshot persistence is best-effort write-through. If multiple async branches mutate the same in-memory room state and persistence happens out of order, Firestore can reject stale writes while the process continues with divergent in-memory state.

### Exact location
- `backend/src/services/ludo/firestoreLudoStore.js`
  - `writeLudoMatch()`
  - `runLudoMatchTransaction()`
- `backend/src/services/ludo/roomManager.js`
  - `saveLudoRoomSnapshot()`
- `backend/src/services/ludoRealtime.js`
  - every mutation path that calls `saveLudoRoomSnapshot()` after mutating in-memory room state

### Evidence
`writeLudoMatch()` rejects stale callers:

```77:99:backend/src/services/ludo/firestoreLudoStore.js
export async function writeLudoMatch(adb, roomId, state, explicitRevision) {
  const ref = adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId);
  return adb.runTransaction(async (t) => {
    const cur = await t.get(ref);
    const currentRevision = cur.exists ? Number(cur.data()?.revision) || 0 : 0;
    const requestedRevision =
      explicitRevision == null ? null : Number(explicitRevision) || 0;
    const nextRev =
      requestedRevision == null ? currentRevision + 1 : requestedRevision;

    if (nextRev <= currentRevision) {
      const err = new Error('STALE_SNAPSHOT_WRITE');
      err.code = 'STALE_SNAPSHOT_WRITE';
      throw err;
    }
```

But `saveLudoRoomSnapshot()` only logs the failure and continues:

```31:42:backend/src/services/ludo/roomManager.js
export async function saveLudoRoomSnapshot(roomId, state) {
  const adb = getFirestoreOrNull();
  if (!adb || !state) return;
  try {
    const merged = await writeLudoMatch(adb, roomId, state);
    state.revision = merged.revision;
  } catch (e) {
    if (e?.code === 'STALE_SNAPSHOT_WRITE') {
      incMetric('staleSnapshotWriteRejected');
    }
    console.error('[Ludo] Firestore persist failed:', roomId, e?.message || e);
  }
}
```

That means the process can continue serving from memory while Firestore persistence has already rejected an older snapshot. A restart can then restore a state that is older than the live in-memory state that players saw.

### Impact
- server restart can restore stale room state
- reconnecting users can see inconsistent state after persistence failure
- debugging becomes harder because emitted state and persisted state may differ

### Correctness fix
Promote stale snapshot rejection from a metric into a recovery path:

1. On `STALE_SNAPSHOT_WRITE`, re-read the authoritative Firestore document.
2. Compare persisted revision vs current in-memory revision.
3. If in-memory state is older, replace in-memory room state with Firestore state.
4. If in-memory state is newer but persistence failed because of ordering, retry only from the current latest state under the room action lock.

### Fix direction
```js
// backend/src/services/ludo/roomManager.js
export async function saveLudoRoomSnapshot(roomId, state, roomStates) {
  const adb = getFirestoreOrNull();
  if (!adb || !state) return { ok: true, revision: state.revision || 0 };
  try {
    const merged = await writeLudoMatch(adb, roomId, state, state.revision);
    state.revision = merged.revision;
    return { ok: true, revision: merged.revision };
  } catch (e) {
    if (e?.code !== 'STALE_SNAPSHOT_WRITE') throw e;
    const latest = await readLudoMatch(adb, roomId);
    if (latest && Number(latest.revision || 0) >= Number(state.revision || 0)) {
      roomStates.set(roomId, { ...latest, sockets: state.sockets || {} });
      return { ok: false, recoveredFrom: 'firestore', revision: latest.revision };
    }
    throw e;
  }
}
```

### Priority
`P0`

## 2. Lobby Join Race / Double Charge Risk
### Root cause
Lobby joining is better than before because `withRoomJoinLock()` exists, but charging still occurs in multiple entry paths and queue cancellation does not show any refund path. The system reduces double-charge inside a single room by keeping `joinChargeReceiptByRoom`, but it does not provide a full transaction ledger or cancellation/refund safety across queue join, room create, room join, disconnect, and abandoned lobby states.

### Exact location
- `backend/src/services/ludoRealtime.js`
  - `tryDeductForUser()`
  - `socket.on('ludo:queueJoin', ...)`
  - `socket.on('ludo:createRoom', ...)`
  - `handleLudoJoinOrReconnect()`
  - `handleLegacyLudoJoin()`
- `frontend/src/games/LudoLobby.jsx`
  - local/session flow still bypasses the online room model and can trigger legacy join behavior

### Evidence
Queue join charges immediately:

```1620:1624:backend/src/services/ludoRealtime.js
removeUidFromAllLudoQueues(uid);
removeSocketFromLudoQueue(socket.id);

const d = await tryDeductForUser(uid, entryFee, socket.user || {}, 'queue_join');
```

Create room also charges immediately:

```1698:1701:backend/src/services/ludoRealtime.js
const d = await tryDeductForUser(uid, entryFee, socket.user || {}, 'create_room_host');
if (!d.ok) {
  return socket.emit('ludo:error', { message: d.error, code: 'WALLET' });
}
```

Guest join can charge again unless prepaid / charge receipt exists:

```1798:1809:backend/src/services/ludoRealtime.js
const prepaid =
  Array.isArray(st.lobby.prepaidMemberUids) &&
  st.lobby.prepaidMemberUids.some((id) => String(id) === String(uid));
const needsCharge = uid !== st.lobby.hostUid && !prepaid && !chargeReceipt.has(chargeKey);
if (needsCharge) {
  const d = await tryDeductForUser(uid, st.lobby.entryFee, socket.user || {}, 'join_lobby_guest');
  ...
  chargeReceipt.add(chargeKey);
}
```

Queue cancel only removes queue state:

```1635:1637:backend/src/services/ludoRealtime.js
socket.on('ludo:queueCancel', () => {
  removeSocketFromLudoQueue(socket.id);
});
```

No matching refund/compensation flow is visible here.

### Impact
- charged users can leave queue or disconnect without compensation
- retries across queue/join/create can produce inconsistent financial state
- “double charge” becomes a money-ledger issue, not only a concurrency issue

### Correctness fix
Introduce a server-side charge receipt ledger with idempotency keys and explicit refund states.

Minimal correctness-first version:

1. Every charge path must generate an idempotency key:
   - `queue:${uid}:${bucketKey}`
   - `room_host:${uid}:${roomId}`
   - `room_guest:${uid}:${roomId}`
2. Wallet deduction service must reject duplicate idempotency keys.
3. Queue cancel, host room close, and expired lobby teardown must trigger refund of unused receipts.

### Fix direction
```js
// backend/src/services/ludoRealtime.js
const chargeKey = `queue:${uid}:${bucketKey}`;
const d = await ludoWallet.tryDeductEntryFee(uid, entryFee, { idempotencyKey: chargeKey });

// queueCancel / room teardown
await ludoWallet.refundEntryFee(uid, entryFee, {
  idempotencyKey: `refund:${chargeKey}`,
  reason: 'queue_cancelled_before_match',
});
```

### Priority
`P0`

## 3. Timer Vs Move Conflict
### Root cause
Roll and move actions are protected with `withRoomActionLock()`, but the global timeout loop mutates room state directly instead of taking the same lock. It skips when `state.actionLock` is already set, but it does not itself acquire the lock before timing out a turn. That leaves a race window between state reads, action completion, and timer mutation.

### Exact location
- `backend/src/services/ludoRealtime.js`
  - `registerRollDice()`
  - `registerMoveToken()`
  - `startGlobalTimer()`

### Evidence
Gameplay actions use the action lock:

```408:430:backend/src/services/ludoRealtime.js
async function withRoomActionLock(roomId, socket, actionName, fn) {
  const st = roomStates.get(roomId);
  ...
  if (st.actionLock) {
    socket?.emit?.('ludo:error', { ... });
    return false;
  }
  st.actionLock = actionName;
  try {
    await fn(st);
    return true;
  } finally {
    ...
  }
}
```

But timer expiry mutates directly:

```1214:1231:backend/src/services/ludoRealtime.js
if (state.timeLeft <= 0) {
  state.logs.push(`${state.currentTurn} timed out! Turn passed.`);
  state.turnPhase = 'END';
  advanceLudoTurn(state);
  state.diceValue = null;
  state.waitingForMove = false;
  state.isRolling = false;
  state.turnPhase = 'ROLL';
  ...
  emitLudoState(io, roomId, state);
  void saveLudoRoomSnapshot(roomId, state);
  emitTurnComplete(roomId, state, { reason: 'timeout' });
}
```

The timer only checks `if (state.actionLock) continue;`, which is weaker than actually taking the same lock.

### Impact
- timeout can advance turn immediately after a valid move/roll resolves
- stale timer tick can erase `diceValue` or `waitingForMove`
- clients can observe a skipped or duplicated turn transition

### Correctness fix
Route timeout and disconnect auto-pass through `withRoomActionLock()` using a dedicated lock name. That makes timeout resolution use the same serialization path as human actions and bot actions.

### Fix direction
```js
// backend/src/services/ludoRealtime.js

if (state.timeLeft <= 0) {
  void withRoomActionLock(roomId, null, `timeout:${Date.now()}`, async (locked) => {
    if (locked.status !== 'PLAYING' || locked.isRolling || locked.timeLeft > 0) return;
    locked.logs.push(`${locked.currentTurn} timed out! Turn passed.`);
    locked.turnPhase = 'END';
    advanceLudoTurn(locked);
    locked.diceValue = null;
    locked.waitingForMove = false;
    locked.isRolling = false;
    locked.turnPhase = 'ROLL';
    resetLudoTurnTimer(locked);
    locked.lastUpdated = Date.now();
    ensureTurnMeta(locked);
    emitLudoState(io, roomId, locked);
    await saveLudoRoomSnapshot(roomId, locked);
    emitTurnComplete(roomId, locked, { reason: 'timeout' });
    checkBotTurn(roomId);
  });
}
```

### Priority
`P0`

## 4. Legacy Firestore Gameplay Path Conflict
### Root cause
The frontend hook still supports a Firestore gameplay transport alongside the socket-authoritative room flow. Even though it is gated by `VITE_ENABLE_FIRESTORE_LUDO`, keeping both codepaths inside the same hook preserves a second authority model and increases the risk of accidental reactivation or confusion during future fixes.

### Exact location
- `frontend/src/games/ludoGame/hooks/useLudoGame.js`
- `frontend/src/games/ludoGame/services/gameService.js`
- `frontend/src/games/Ludo.jsx`
- `frontend/src/games/LudoLobby.jsx`
- `frontend/src/App.jsx`

### Evidence
`useLudoGame()` still contains a full Firestore subscription branch:

```60:87:frontend/src/games/ludoGame/hooks/useLudoGame.js
useEffect(() => {
  if (syncTransport === 'socket') return;
  const gameId = state.gameId;
  if (!gameId) return;
  ...
  const unsubscribe = subscribeGame(...)
```

It also still contains Firestore roll and move transaction paths:

```242:260:frontend/src/games/ludoGame/hooks/useLudoGame.js
if (syncTransportRef.current === 'socket') {
  socketService.emit('ludo:rollDice', { roomId: gid });
  return;
}
void rollDiceTx(...)
```

The Firestore gameplay service still writes to `/games/{gameId}`:

```164:183:frontend/src/games/ludoGame/services/gameService.js
export async function createOrJoinGame({ gameId, state, actorUid }) {
  if (!FIRESTORE_GAMEPLAY_ENABLED) {
    throw new Error('FIRESTORE_GAMEPLAY_DISABLED');
  }
  ...
  await setDoc(gameRef, docData, { merge: false });
}
```

At the same time, Firestore rules now intentionally deny gameplay writes:

```128:133:backend/firebase/firestore.rules
match /games/{gameId} {
  allow read: if isAuthed();
  allow create, update: if false;
  allow delete: if false;
}
```

So the path is both deprecated and still implemented.

### Impact
- duplicate mental model for developers
- future code can accidentally target the wrong transport
- legacy `/ludo/:gameId` route remains capable of feeding the wrong lifecycle

### Correctness fix
Remove Firestore gameplay as an active transport from the client hook and freeze it behind a clearly separated deprecated module, or fully delete it once no route uses it.

Correctness-first minimal option:

1. Make `useLudoGame()` socket-only.
2. Remove Firestore gameplay subscription and transaction branches.
3. Prevent `Ludo.jsx` and `sessionService` from pretending to be an alternative match authority.

### Fix direction
```js
// frontend/src/games/ludoGame/hooks/useLudoGame.js
export const useLudoGame = ({ socketRoomId = null } = {}) => {
  // remove firestore branch entirely
  // only hydrate from socket events
  // only emit socket actions
};
```

### Priority
`P1`

## 5. Missing / Incomplete Firestore Rules
### Root cause
The ruleset correctly protects sensitive match and wallet writes, but several social/lobby/storage paths are still too broad for a production correctness and privacy posture.

### Exact location
- `backend/firebase/firestore.rules`
- `backend/firebase/storage.rules`
- `backend/firebase/database.rules.json`

### Evidence
Any authenticated user can read all lobbies and all lobby messages:

```87:115:backend/firebase/firestore.rules
match /lobbies/{lobbyId} {
  allow read: if isAuthed();
  ...
}

match /lobbies/{lobbyId}/messages/{messageId} {
  allow read: if isAuthed();
```

All authenticated users can read and upload voice files for any lobby:

```8:15:backend/firebase/storage.rules
match /chatVoice/{lobbyId}/{fileName} {
  allow read: if isAuthed();
  allow write: if isAuthed()
```

`dmThreads` update is too broad:

```184:191:backend/firebase/firestore.rules
match /dmThreads/{threadId} {
  ...
  allow update: if isAuthed() && resource.data.participantMap[request.auth.uid] == true;
}
```

RTDB still contains a legacy-looking nested `presence/ludo` branch that does not match the primary client write path:

```3:16:backend/firebase/database.rules.json
"presence": {
  "$uid": { ... },
  "ludo": {
```

### Impact
- private lobby/chat data exposure
- broad client write surface on social docs
- storage abuse risk
- increased mismatch between actual app behavior and intended data ownership

### Correctness fix
Restrict reads and writes to actual participants or owners, and validate schema where client writes are still allowed.

### Fix direction
```firestore
match /lobbies/{lobbyId} {
  allow read: if isAuthed()
    && resource.data.memberMap[request.auth.uid] == true;
}

match /lobbies/{lobbyId}/messages/{messageId} {
  allow read: if isAuthed()
    && get(/databases/$(database)/documents/lobbies/$(lobbyId)).data.memberMap[request.auth.uid] == true;
}
```

```storage
match /chatVoice/{lobbyId}/{fileName} {
  allow read, write: if request.auth != null
    && firestore.get(
      /databases/(default)/documents/lobbies/$(lobbyId)
    ).data.memberMap[request.auth.uid] == true;
}
```

### Priority
`P1`

## Additional Correctness Risks
### Mixed auth verification model
- `backend/src/middleware/auth.js` accepts a legacy JWT signed with a fallback secret.
- The HTTP path verifies Firebase ID tokens via Identity Toolkit REST instead of Admin verification.
- Socket auth uses Firebase Admin verification, so HTTP and websocket auth are not aligned.

### Dual Ludo route model
- `frontend/src/App.jsx` still exposes both `/ludo/:gameId` and `/ludo/game/:roomId`.
- `LudoLobby.jsx` can still create local sessions with `sessionService`.

### Silent fatal process handling
The backend’s `uncaughtException` and `unhandledRejection` handlers were recently reduced to empty handlers again after instrumentation cleanup, which means the process does not crash or recover explicitly on fatal runtime errors. That is not safe for correctness in a money-sensitive system.

## Top 10 System Risks
1. Stale in-memory room state can diverge from Firestore after rejected snapshot writes.
2. Queue join / room join / create room charging lacks end-to-end idempotent refund-safe accounting.
3. Timeout/disconnect auto-pass mutates state outside the room action lock.
4. Legacy Firestore gameplay transport remains in the same hook as socket gameplay.
5. Legacy local-session Ludo route remains active beside the online room route.
6. HTTP auth and socket auth do not use the same Firebase verification path.
7. Legacy JWT fallback secret is dangerous if enabled outside controlled dev usage.
8. Lobby and chat rules are too broad for privacy and abuse safety.
9. Storage voice uploads are not restricted to lobby members.
10. The repo still mixes Firestore-backed authoritative services with legacy file-backed routes.

## Firebase Verification
### Correct
- Firebase Auth is the primary client sign-in mechanism.
- Socket auth is tied to Firebase identity.
- `users/{uid}` acts as the main wallet/profile authority.
- `ludoMatches/{matchId}` and `matches/{matchId}` are server-write-only.

### Incorrect / incomplete
- HTTP token verification path is weaker and inconsistent with socket verification.
- Lobby/chat/social rules are too broad.
- Storage rule membership checks are missing.
- RTDB rules still carry legacy presence structure.
- The repo still mirrors Firebase users into file-backed legacy storage.

## Final Verdict
### Is the system fully working?
`NO`

Main reasons:
- stale persistence can still desync recovered state
- money-safety around queue/join lifecycle is incomplete
- timer and gameplay mutation are not fully serialized
- legacy gameplay path is still present

### Is Firebase correctly integrated?
`PARTIALLY`

Main reasons:
- Firebase Auth and Firestore are real authorities
- but verification paths, rules coverage, and legacy compatibility layers are not fully aligned

### Is it production-ready?
`NO`

Main reasons:
- correctness bugs remain in persistence, turn resolution, and wallet lifecycle
- privacy/security rules are still too broad
- hybrid legacy architecture is still active

## Execution Plan
### Phase 2 Status Update (implemented)
- Firestore gameplay transport has been removed from active `useLudoGame()` path.
- Legacy local/session Ludo route has been retired from active navigation and lobby start flow.
- HTTP auth verification is aligned with Firebase Admin verification and no longer uses mixed REST/JWT fallback for protected routes.

### Phase 1: Critical Fixes
Order matters.

1. Fix timeout/disconnect mutation to run through `withRoomActionLock()`.
   - File: `backend/src/services/ludoRealtime.js`
2. Add wallet charge idempotency keys and refund paths for queue cancel / abandoned lobby / host close.
   - Files:
     - `backend/src/services/ludoRealtime.js`
     - `backend/src/services/ludo/ludoFirestoreWallet.js`
3. Turn stale snapshot rejection into explicit recovery logic instead of metric-only logging.
   - Files:
     - `backend/src/services/ludo/roomManager.js`
     - `backend/src/services/ludo/firestoreLudoStore.js`
4. Tighten Firestore and Storage rules for lobbies, messages, voice uploads, and DM updates.
   - Files:
     - `backend/firebase/firestore.rules`
     - `backend/firebase/storage.rules`
     - `backend/firebase/database.rules.json`

### Phase 2: Stability
1. Remove the Firestore gameplay transport from `useLudoGame()` as an active codepath.
   - Files:
     - `frontend/src/games/ludoGame/hooks/useLudoGame.js`
     - `frontend/src/games/ludoGame/services/gameService.js`
2. Retire or hard-disable the legacy local/session Ludo route.
   - Files:
     - `frontend/src/App.jsx`
     - `frontend/src/games/LudoLobby.jsx`
     - `frontend/src/games/Ludo.jsx`
     - `frontend/src/services/sessionService.js`
3. Align HTTP auth verification with Firebase Admin verification instead of mixed REST/JWT fallback.
   - Files:
     - `backend/src/middleware/auth.js`
     - `backend/src/services/firebaseIdTokenVerify.js`
     - `backend/src/server.js`

### Phase 3: Deferred Work After Correctness
These are intentionally deferred:

- UI optimization
- render-performance tuning
- refactoring of monolithic files
- Redis / distributed state
- multi-server scaling work

## Non-Goals For This Pass
The following are intentionally excluded from this correctness audit and should not be mixed into the first execution pass:

- UI optimization
- render tuning
- architecture refactoring
- Redis adoption
- scaling design

The correct order is:

1. make state transitions correct
2. make wallet operations safe
3. make Firebase access rules correct
4. remove conflicting legacy gameplay paths
5. only then optimize or scale
