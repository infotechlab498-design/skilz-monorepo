# Skilz

Monorepo: **React (Vite)** in `frontend/`, **Express + Socket.IO** in `backend/`, Firebase Cloud Functions under `backend/functions/`.

## Prerequisites

- Node.js 18+ (backend dev uses `node --watch`)
- npm 9+ (workspaces)

## Install

From the repo root (`SkilzProject/`):

```bash
npm install
```

## Development

Run **Vite** (port **5173**) and the **API + Socket.IO** server (port **3000**) together:

```bash
npm run dev
```

Open **http://localhost:5173** — the dev server proxies `/api` and `/socket.io` to the backend.

Separate terminals:

```bash
npm run dev:frontend
npm run dev:backend
```

**Dev layout:** Vite serves the SPA on **5173** and proxies `/api` and `/socket.io` to **127.0.0.1:3000**. The backend alone binds **3000** (`PORT`, default `3000`). Do not run two backends on the same port.

## Troubleshooting

### `EADDRINUSE` / "address already in use" on port 3000

Something else is already listening on **3000** (often a second Skilz backend). **Do not** run `npm run dev` in two terminals at once, and do not run `npm run dev:backend` while root `npm run dev` is already running.

- **Free the port (cross-platform):** `npx kill-port 3000` (use the [`kill-port`](https://www.npmjs.com/package/kill-port) package, not the Unix-only `kill` package from `npx kill`).
- **Windows (PowerShell):** `Get-NetTCPConnection -LocalPort 3000` to find `OwningProcess`, then `Stop-Process -Id <pid> -Force`.
- **Use another port:** set `PORT` in `.env` (see `backend/.env.example`). For local dev you must point Vite at the same port: edit `target` in `frontend/vite.config.js` for `/api` and `/socket.io`.

## Production

Build the SPA, then start the backend with `NODE_ENV=production` so it serves `frontend/dist`:

```bash
npm run build
set NODE_ENV=production
npm run start
```

On Unix: `NODE_ENV=production npm run start`

Override the static path with `FRONTEND_DIST` (absolute or relative to `backend/`).

## Firebase

Use the **`backend/`** directory as the Firebase project root:

```bash
cd backend
firebase deploy --only firestore:rules
firebase deploy --only functions
```

Emulators:

```bash
npm run emulate:functions
```

(from repo root; runs the backend workspace script)

### Callable “CORS” errors from `localhost` (Gen2)

If the browser reports **CORS** on `https://REGION-PROJECT.cloudfunctions.net/...` but the Network tab shows **403** on the **OPTIONS** preflight, the Cloud Run service is usually **not publicly invokable**. Gen2 callables need **`invoker: "public"`** in function options (auth is still enforced via the Firebase ID token inside the callable request). This repo sets that in [`backend/functions/index.js`](backend/functions/index.js). After changing it, redeploy: `cd backend && firebase deploy --only functions`.

**Verify preflight (replace project/region/function if needed):**

```bash
curl.exe -i -X OPTIONS "https://us-central1-skilz-63d0a.cloudfunctions.net/getPlayerDashboard" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization"
```

You want a **2xx** response with CORS headers, not **403** HTML from “Google Frontend”.

#### If OPTIONS is still 403 after deploy

Firebase deploy should apply public invoke, but org policies or manual IAM changes can leave the **Cloud Run** service private.

1. Open [Google Cloud Console → Cloud Run](https://console.cloud.google.com/run) and select project **`skilz-63d0a`** (or your Firebase project).
2. Set region **us-central1** (or the region in your function URL).
3. Find the service for the callable (name is often similar to the function, e.g. **`getplayerdashboard`** — use the row that matches your failing URL).
4. Open the service → **Security** (or **Permissions**) → ensure **Allow unauthenticated invocations** is on, or add principal **`allUsers`** with role **Cloud Run Invoker**.

**CLI alternative** (with [Google Cloud SDK](https://cloud.google.com/sdk) installed and authenticated):

```bash
gcloud run services add-iam-policy-binding SERVICE_NAME --region=us-central1 --project=skilz-63d0a --member=allUsers --role=roles/run.invoker
```

Replace **`SERVICE_NAME`** with the Cloud Run service name shown in the console for that function.

**Player dashboard (`PlayerDashboardHome`):** loads **`users/{uid}`** and **`stats/{uid}`** via the **Firestore web SDK** (same rules as owner read), not the `getPlayerDashboard` callable, so local dev is not blocked by Cloud Run preflight/CORS when IAM is still misconfigured. The callable remains deployed for other potential callers.

## Environment

- **`backend/.env.example`** — JWT, Firebase Admin paths, optional **`PORT`** (default **3000**), server flags. Paths like `FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/...` are resolved from **`backend/`**, not the monorepo cwd.
- **`frontend/.env.example`** — `VITE_*`, `GEMINI_API_KEY` (loaded from `frontend/` by Vite).
- The server also loads **`../.env`** (monorepo root) first, then **`backend/.env`**, so a single root `.env` still works for backend vars.

## Verify the full stack (after refactor)

From the monorepo root:

```bash
npm install
npm run build
```

**Development (recommended)** — API + sockets on **3000**, UI + HMR on **5173** (proxies `/api` and `/socket.io`):

```bash
npm run dev
```

Open **http://localhost:5173** (not 3000). Confirm browser console shows `Connected to game server` after entering a game.

**Local production build + one Node server** — backend serves the built SPA from `frontend/dist`:

```bash
npm run build
# Windows PowerShell:
$env:NODE_ENV = "production"; npm run start
# macOS / Linux:
# NODE_ENV=production npm run start
```

Open **http://localhost:3000**.

**Preview built SPA + separate backend** (both must be running; preview proxies like dev):

```bash
# terminal 1
npm run dev:backend
# terminal 2
npm run preview
```

Open **http://localhost:4173**.

**Split origins (e.g. static site + API host)** — set on the **frontend** build:

```bash
# frontend/.env.production
VITE_SOCKET_URL=https://your-api.example.com
```

Rebuild; the client will connect sockets to that origin (ensure backend CORS/socket config matches your deployment).

## Firebase: Admin vs client

| Surface | Package | Location |
|--------|---------|----------|
| **Firebase client** (Auth, Firestore SDK, RTDB, callables) | `firebase` | `frontend/src/firebase/*`, `frontend/src/services/*` |
| **Firebase Admin** (server verification, Firestore writes) | `firebase-admin` | `backend/src/services/firebaseAdmin.js`, `ludoFirestoreSync.js`, `userFirestoreAdmin.js` |
| **ID token verify (HTTP)** | REST + `FIREBASE_WEB_API_KEY` | `backend/src/services/firebaseIdTokenVerify.js` (no Admin required for verify) |
| **Cloud Functions** | `firebase-admin` + `firebase-functions` | `backend/functions/` |

Do not add `firebase-admin` to the frontend workspace or `firebase` (client) to the backend workspace for normal builds.

## Docs

See [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) for folder layout and data flow.

**Production on Hostinger VPS (skilz.pk):** [docs/HOSTINGER_VPS_DEPLOYMENT.md](docs/HOSTINGER_VPS_DEPLOYMENT.md) — nginx + PM2 + Node (not Render).
