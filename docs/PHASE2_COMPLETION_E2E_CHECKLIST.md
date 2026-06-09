# Phase 2 Completion + E2E Verification Checklist

## Phase 2 Completion Checkpoint

Completed in code:

- `useLudoGame()` active gameplay transport is socket-authoritative.
  - `frontend/src/games/ludoGame/hooks/useLudoGame.js`
- Legacy local/session Ludo route is retired from active navigation.
  - `frontend/src/App.jsx`
  - `frontend/src/games/Ludo.jsx`
  - `frontend/src/games/LudoLobby.jsx`
- Protected HTTP auth uses Firebase Admin verification (no mixed REST/JWT fallback).
  - `backend/src/middleware/auth.js`
  - `backend/src/server.js`

## Remaining Correctness Risks (Post-Phase-2)

- Trivia and Math Rush realtime handlers still trust client-provided `uid` in some events.
  - `backend/src/services/triviaRealtime.js`
  - `backend/src/services/mathRushRealtime.js`
- Checkout/top-up and gameplay spend must use the same wallet source of truth (`users/{uid}` in Firestore).
  - `backend/src/controllers/checkoutController.js`
  - `frontend/src/payment/CheckoutPage.jsx`
  - `frontend/src/services/userService.js`
- Docs drift: older docs still mention legacy Ludo path and pre-Phase-2 auth model.

## Auth + Session E2E Matrix

- [ ] **Protected route guard**
  - Step: Open `/ludoLobby` while signed out.
  - Expected: Redirect to `/signin`.
  - Files: `frontend/src/Components/ProtectedGameRoute.jsx`, `frontend/src/App.jsx`
- [ ] **Session restore**
  - Step: Sign in, open `/ludo/game/<roomId>`, refresh page.
  - Expected: Session restores without forced logout and route remains protected.
  - Files: `frontend/src/Components/FirebaseAuthSync.jsx`, `frontend/src/Components/UserSync.jsx`
- [ ] **Admin-verified HTTP auth**
  - Step: Hit a protected API route with a valid Firebase ID token, then with an invalid token.
  - Expected: Valid token succeeds; invalid token returns 403; missing token returns 401.
  - Files: `backend/src/middleware/auth.js`

## Ludo E2E Matrix

- [ ] **Queue join and single charge**
  - Step: Join queue from `PlayerSelection`.
  - Expected: Entry fee deducts once; `ludo:matchFound` arrives.
  - Files: `frontend/src/games/ludoGame/components/PlayerSelection.jsx`, `backend/src/services/ludoRealtime.js`
- [ ] **Queue cancel/disconnect refund**
  - Step: Join queue, then cancel search or disconnect before match starts.
  - Expected: Refund occurs once; receipt transitions to `refunded`.
  - Files: `backend/src/services/ludoRealtime.js`, `backend/src/services/ludo/ludoFirestoreWallet.js`
- [ ] **Lobby vote flow**
  - Step: Trigger <4 human classic flow and wait for vote cycle.
  - Expected: `ludo:voteRequested` -> `ludo:voteUpdated` -> `ludo:voteClosed` sequencing.
  - Files: `frontend/src/games/LudoGameRoom.jsx`, `backend/src/services/ludoRealtime.js`
- [ ] **Reconnect during active match**
  - Step: Disconnect and rejoin same room/account mid-game.
  - Expected: `ludo:reconnectState` emitted and state rehydrated without extra entry charge.
  - Files: `frontend/src/games/ludoGame/hooks/useLudoGame.js`, `backend/src/services/ludoRealtime.js`

## Wallet Consistency Matrix

- [ ] **Checkout credits Firestore wallet**
  - Step: Buy a plan on `/checkout`.
  - Expected: `users/{uid}.coins` increases by selected plan amount.
  - Files: `backend/src/controllers/checkoutController.js`, `frontend/src/payment/CheckoutPage.jsx`
- [ ] **Top-up spend interoperability**
  - Step: Top-up, then join paid Ludo queue.
  - Expected: Post-top-up coins are spendable by Ludo entry deduction.
  - Files: `backend/src/services/ludo/ludoFirestoreWallet.js`, `frontend/src/services/userService.js`

## Sign-off Criteria

- Protected HTTP routes accept only Firebase Admin-verified ID tokens.
- Ludo queue/lobby/match lifecycle has no double-charge/no-refund regressions.
- Trivia and Math Rush use verified socket identity for authoritative actions.
- Checkout and gameplay spend mutate the same Firestore wallet source of truth.
- Docs no longer describe retired legacy paths as active.

