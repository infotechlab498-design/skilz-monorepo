# Ludo Firebase migration — manual test checklist

Run backend with Firestore Admin configured (`FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`). Ensure each test user has a `users/{uid}` document with `coins` sufficient for entry fees.

## Socket / auth

- [ ] Connect without token → connection rejected.
- [ ] Connect with valid Firebase ID token → `ludo:createRoom` succeeds.

## Wallet (Firestore only)

- [ ] Create room / join lobby deducts `users/{uid}.coins` in Firestore (not `users.json`).
- [ ] Insufficient coins → `ludo:error` with `WALLET` / message.

## Persistence

- [ ] After creating a lobby, document exists at `ludoMatches/{roomId}` in Firestore.
- [ ] Restart Node server → LOBBY/PLAYING rooms reload from Firestore (not JSON).

## Gameplay

- [ ] Two browsers: host start → both receive `ludo:gameState` with same `revision` sequence.
- [ ] Reconnect second player → receives current state; `revision` non-decreasing on client after hydrates.
- [ ] Invalid move → `ludo:error`, Firestore `revision` unchanged for that action (inspect before/after).
- [ ] Rapid roll clicks → only one roll applied per turn.

## End / cleanup

- [ ] Match finishes → `matches/{matchId}` updated via `syncLudoMatchEnd`; `ludoMatches` doc shows `FINISHED` after final persist; in-memory room cleared.
- [ ] Host leaves lobby → `ludoMatches/{roomId}` deleted.

## Regression

- [ ] Legacy `/ludo/:gameId` flow with `ludo:joinRoom` + `config` still creates `PLAYING` doc when Firestore user exists and human seat matches UID.
