# Codebase Weak Points Audit

This document captures concrete weak points found across the current codebase and why they are risky.  
Focus areas: security, reliability, data integrity, operational safety, and testability.

## Scope

- Backend: `backend/src`, `backend/functions`, Firebase rules.
- Frontend: `frontend/src` (auth, API client, game flows).
- Findings are based on direct code evidence and a broader static audit pass.

## High Severity

1. **Unauthenticated gameplay routes allow unauthorized operations**
   - **Where:** `backend/src/routes/gameRoutes.js`
   - **Evidence:** `matchmake`, `matchmake/bot`, `room/:id`, `game/submit`, `game/end`, and `GET /:id` are registered without `authenticateToken`.
   - **Why this is weak:** Anyone can call these endpoints without auth and manipulate or read game state.
   - **Impact:** Account impersonation, tampered matches, unauthorized state updates.
   - **Fix direction:** Enforce auth middleware for all sensitive game routes and authorize per-room/match membership.

2. **Server trusts client-controlled identity in game controller flows**
   - **Where:** `backend/src/controllers/gameController.js`
   - **Why this is weak:** Controllers using `req.body.userId` instead of trusted server auth context allow user spoofing.
   - **Impact:** A user can act as another user if body values are accepted.
   - **Fix direction:** Derive actor identity only from verified auth (`req.userId` / Firebase auth context), reject mismatches.

3. **Economy mutation values are client-controlled**
   - **Where:** `backend/functions/handlers/payments.js`
   - **Evidence:** `amountSpent` and `coinsEarned` come directly from `request.data` and are incremented in profile totals.
   - **Why this is weak:** Authenticated clients can submit inflated values and mint currency.
   - **Impact:** Economic abuse, leaderboard corruption, fraud.
   - **Fix direction:** Validate purchases server-side from trusted payment proof/webhooks and enforce strict value bounds.

4. **Debug telemetry endpoint is hardcoded into frontend runtime path**
   - **Where:** `frontend/src/api/cloudFunctionsApi.js`
   - **Evidence:** hardcoded `http://127.0.0.1:7889/ingest/...` and multiple debug `fetch()` calls in error/success paths.
   - **Why this is weak:** Runtime metadata is exfiltrated to an out-of-band endpoint; can leak internal behavior and fail noisily in production clients.
   - **Impact:** Privacy/operational risk, noisy client failures, accidental sensitive leakage.
   - **Fix direction:** Gate debug logging behind strict `DEV` checks or remove before production build.

5. **Password reset flow is mock behavior with plaintext password logging**
   - **Where:** `frontend/src/Components/authPages/SetNewPassword.jsx`
   - **Evidence:** `console.log("New password set:", password)` and mock-success behavior.
   - **Why this is weak:** Users may believe password changed when it did not; plaintext password appears in logs.
   - **Impact:** User lockouts, credential exposure in console/session capture tools.
   - **Fix direction:** Remove plaintext logging immediately; wire real secure reset flow (Firebase token-based reset) and fail closed.

## Medium Severity

6. **Firestore read rules are broad for game collections**
   - **Where:** `backend/firebase/firestore.rules`
   - **Why this is weak:** If rules allow read for all authenticated users on sensitive game docs, users can inspect other players' data.
   - **Impact:** Privacy leaks and gameplay intelligence exposure.
   - **Fix direction:** Restrict reads/writes to participant membership checks.

7. **Default JWT secret fallback exists**
   - **Where:** `backend/src/middleware/auth.js`
   - **Why this is weak:** A predictable fallback secret makes JWT forgery possible if fallback is used in non-dev contexts.
   - **Impact:** Auth bypass in misconfigured environments.
   - **Fix direction:** Fail startup when required secrets are missing in non-local environments.

8. **In-memory rate limiting can be bypassed**
   - **Where:** `backend/functions/handlers/social.js`
   - **Why this is weak:** Per-instance memory limits do not hold under scale, restarts, or multiple instances.
   - **Impact:** Spam/invite abuse under load.
   - **Fix direction:** Move limits to shared durable store (Redis/Firestore with TTL + atomic checks).

9. **Async bootstrap and polling flows swallow errors in game UI**
   - **Where:** `frontend/src/games/EnigmaPulse/EnigmaPulseGameRoom.jsx`, `frontend/src/games/EnigmaPulse/EnigmaPulseLobby.jsx`
   - **Why this is weak:** Unhandled/silenced failures leave users stuck in search/connect states with weak recovery.
   - **Impact:** Poor UX, hard-to-debug live issues, unnecessary retries.
   - **Fix direction:** Centralize async guards, show user-visible error states, add deterministic retry/backoff strategy.

10. **Aggressive polling without robust backoff**
    - **Where:** `frontend/src/games/neurochain/NeuroChainGame.jsx`, `frontend/src/games/EnigmaPulse/EnigmaPulseLobby.jsx`
    - **Why this is weak:** Tight loops create avoidable load and amplify failures during backend degradation.
    - **Impact:** Higher infrastructure load, battery/network churn, increased timeout risk.
    - **Fix direction:** Prefer push events; if polling remains, implement capped exponential backoff + jitter.

## Low Severity (But Important Hygiene)

11. **SetTimeout cleanup gaps in UI**
    - **Where:** `frontend/src/home/NewsletterSection.jsx`, `frontend/src/payment/CheckoutPage.jsx`
    - **Why this is weak:** Timers can outlive component lifecycle and cause stale updates.
    - **Impact:** Intermittent UI bugs/warnings.
    - **Fix direction:** Track timer IDs and clear on unmount.

12. **Hard navigation in error boundary**
    - **Where:** `frontend/src/Components/ErrorBoundary.jsx`
    - **Why this is weak:** Full reload loses SPA context and state.
    - **Impact:** Rough recovery UX and loss of useful error context.
    - **Fix direction:** Use router navigation and context-aware recovery path.

13. **Mock/test data patterns can normalize insecure behavior**
    - **Where:** `frontend/src/players.js` and auth mock flows
    - **Why this is weak:** Plaintext-style mock credential patterns can leak into real flows.
    - **Impact:** Security hygiene degradation.
    - **Fix direction:** Keep mock auth fixtures isolated and non-sensitive.

## Critical Operational Note: Callable "CORS" vs Cloud Run IAM

- For Firebase Gen2 callable functions, browser CORS errors can be a symptom of **Cloud Run IAM deny**.
- If preflight returns `403` without `Access-Control-Allow-Origin`, the request may be blocked before callable runtime executes.
- This is consistent with observed split behavior (some callables returning `204`, others `403`).
- **Fix direction:** Ensure failing callable-backed Cloud Run services grant `allUsers -> roles/run.invoker` where appropriate for callable entrypoints, then rely on Firebase auth/app checks inside handler.

## Priority Remediation Plan (Suggested)

1. **Immediate (P0):** Lock down unauthenticated game routes and identity spoofing paths.
2. **Immediate (P0):** Remove plaintext password logs and remove/guard debug ingest fetch calls.
3. **High (P1):** Harden economy transaction validation with trusted payment verification.
4. **High (P1):** Tighten Firestore participant-based rules.
5. **Medium (P2):** Add durable rate limiting and improve async error UX/backoff in game flows.
6. **Medium (P2):** Add targeted automated tests for authz, economy, and multiplayer state transitions.

## Recommended First Test Cases

- Unauthorized request to each game route must fail with `401/403`.
- User cannot submit/update as another user ID.
- Payment callable rejects manipulated `coinsEarned`.
- Callable endpoints with IAM drift are detected by preflight check in CI smoke tests.
- Lobby/game room gracefully recovers from socket/function failures (no infinite loading state).

