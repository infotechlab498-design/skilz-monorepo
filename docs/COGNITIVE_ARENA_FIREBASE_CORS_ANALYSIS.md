# Cognitive Arena Firebase CORS Analysis

## Error

The browser reports:

```txt
Access to fetch at 'https://us-central1-skilz-63d0a.cloudfunctions.net/cognitiveStartPractice'
from origin 'http://localhost:5173' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

This happens when the EnigmaPulse lobby starts the new `logic_grid` / Cognitive Arena flow and calls `cognitiveStartPractice`.

## What Our Code Is Doing

Frontend callable wrapper:

- `frontend/src/api/cloudFunctionsApi.js` creates:
  - `httpsCallable(functions, 'cognitiveStartPractice')`
  - `callCognitiveStartPractice()`

Firebase Functions client:

- `frontend/src/firebase/functionsClient.js` uses:
  - region: `VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1'`
  - emulator only when `VITE_USE_FUNCTIONS_EMULATOR=true`

Because the current request is going to:

```txt
https://us-central1-skilz-63d0a.cloudfunctions.net/cognitiveStartPractice
```

the frontend is calling deployed Firebase Cloud Functions, not the local emulator.

Backend export exists locally:

- `backend/functions/index.js` exports:
  - `cognitiveStartPractice`
  - `cognitiveEnqueue1v1`
  - `cognitiveLeaveQueue`
  - `cognitiveTryMatch`
  - `cognitiveSubmitAnswer`
  - `cognitiveProcessBotTurn`
  - `cognitiveResolveRoundIfStale`

The callable options are already configured locally:

```js
const callableOpts = { invoker: 'public', cors: true };
```

So this is probably not a React component bug. It is almost certainly a Firebase deployment/runtime mismatch.

## Most Likely Root Cause

The deployed Firebase project does not currently have the updated `cognitiveStartPractice` callable deployed with the local code in `backend/functions/index.js`.

Common variants:

1. The function has not been deployed yet.
2. An older deployed revision exists without `invoker: 'public'` / callable CORS support.
3. The frontend is expected to use the emulator, but `VITE_USE_FUNCTIONS_EMULATOR=true` is not enabled.
4. The function is deployed to a different region/project than the frontend is calling.

## Why It Looks Like CORS

For Firebase Gen 2 HTTPS callable functions, browsers send a preflight `OPTIONS` request before the callable `POST`.

If Cloud Run rejects the preflight before the Firebase callable handler runs, the response may not include:

```txt
Access-Control-Allow-Origin
```

The browser then reports a CORS failure even if the underlying problem is one of:

- function missing
- function not deployed
- Cloud Run invoker not public
- wrong region
- wrong project
- stale deployed revision

## Required Firebase Implementation

### Option A: Use Deployed Firebase Functions

From the `backend` directory:

```bash
npx -y firebase-tools@latest use
npx -y firebase-tools@latest deploy --only functions
```

Confirm the active project is:

```txt
skilz-63d0a
```

If you only want to deploy the new Cognitive functions:

```bash
npx -y firebase-tools@latest deploy --only functions:cognitiveStartPractice,functions:cognitiveEnqueue1v1,functions:cognitiveLeaveQueue,functions:cognitiveTryMatch,functions:cognitiveSubmitAnswer,functions:cognitiveProcessBotTurn,functions:cognitiveResolveRoundIfStale
```

After deploy, restart the frontend dev server and try the lobby again.

### Option B: Use Local Functions Emulator

Create or update `frontend/.env`:

```env
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
VITE_USE_FUNCTIONS_EMULATOR=true
```

Start the Functions emulator from `backend`:

```bash
npm run emulate:functions
```

Then restart Vite:

```bash
npm run dev -w @skilz/frontend
```

When emulator mode is active, the browser should no longer call:

```txt
https://us-central1-skilz-63d0a.cloudfunctions.net/cognitiveStartPractice
```

It should route through the local emulator instead.

## How To Verify

### Verify the Function Exists Remotely

From `backend`:

```bash
npx -y firebase-tools@latest functions:list
```

Look for:

```txt
cognitiveStartPractice
cognitiveSubmitAnswer
cognitiveProcessBotTurn
cognitiveResolveRoundIfStale
```

If they are missing, deploy functions.

### Verify Project and Region

From `backend`:

```bash
npx -y firebase-tools@latest use
```

Expected:

```txt
Active Project: skilz-63d0a
```

The frontend uses `us-central1` by default, and backend functions are configured with:

```js
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });
```

So the deployed function must exist in `us-central1`.

## Important Local Code Notes

There is temporary debug instrumentation currently in `frontend/src/api/cloudFunctionsApi.js` from debugging this issue.

It sends local debug logs to:

```txt
http://127.0.0.1:7889/ingest/...
```

That instrumentation is not the cause of the Firebase CORS error. The failing request is the Firebase callable request to:

```txt
https://us-central1-skilz-63d0a.cloudfunctions.net/cognitiveStartPractice
```

After the Firebase issue is confirmed fixed, remove the temporary debug logging from `cloudFunctionsApi.js`.

## Recommended Resolution

For this project, the cleanest path is:

1. Deploy the updated functions from `backend`.
2. Confirm `cognitiveStartPractice` appears in `functions:list`.
3. Restart Vite.
4. Retry the Logic Grid / Cognitive Arena lobby flow.

If you are actively developing locally, use the emulator instead:

1. Set `VITE_USE_FUNCTIONS_EMULATOR=true` in `frontend/.env`.
2. Start the functions emulator from `backend`.
3. Restart Vite.

## Short Diagnosis

The frontend code is correctly calling a Firebase callable named `cognitiveStartPractice`, and the backend code defines it locally with CORS-enabled callable options. The error means the browser is reaching Firebase Hosting/Cloud Functions infrastructure, but the deployed endpoint is not responding as a valid callable CORS endpoint. Deploy the new functions or switch the frontend to the Functions emulator.
