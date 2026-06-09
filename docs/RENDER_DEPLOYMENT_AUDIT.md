# Render Deployment Compatibility Audit — Skilz

**Date:** 2026-05-31  
**Target:** Render Web Service (Node)  
**Repo:** Monorepo — `frontend/` (Vite/React), `backend/` (Express/Socket.IO), `backend/functions/` (Firebase, deploy to Google)

---

## Executive summary

| Question | Answer |
|----------|--------|
| Can Express run on Render Web Service? | **Yes** |
| Is Socket.IO compatible? | **Yes** (single instance; use Redis adapter if scaling) |
| Ephemeral disk / JSON data risk? | **Yes** — `backend/src/data/*.json` resets on redeploy |
| Firebase Admin on Render? | **Yes** — via `FIREBASE_SERVICE_ACCOUNT_JSON` + `scripts/render-prepare-firebase.mjs` |
| Render **Free** viable for production games? | **Limited** — spin-down, cold starts, RAM, no persistent disk |
| **Compatibility score** | **7.5 / 10** |

**Verdict:** **GO for Render Web Service** (Starter recommended for production). **Conditional NO-GO on Free** for serious multiplayer traffic.

---

## PHASE 1 — Architecture (from code)

| # | Item | Evidence |
|---|------|----------|
| 1 | Frontend | React 19 + Vite 6 — `frontend/package.json`; build: `vite build` → `frontend/dist/` |
| 2 | Backend entry | `backend/src/bootstrapEnv.js` → `import('./server.js')` — `backend/package.json` `"start": "node src/bootstrapEnv.js"` |
| 3 | Express | `express` ^5.2.1 — `backend/src/server.js` |
| 4 | Socket.IO | `socket.io` ^4.8.3 — attached to same `http.Server` (`server.js` 749–756) |
| 5 | Firebase client | `frontend/src/firebase/config.js` |
| 6 | Firebase Admin | `backend/src/services/firebaseAdmin.js` — file-based service account |
| 7 | Cloud Functions | `backend/functions/index.js` — **not run on Render**; deploy with Firebase CLI |
| 8 | Auth | Firebase ID tokens verified by Admin SDK (`middleware/auth.js`, socket `io.use`) |
| 9 | Env loading | Root `.env` then `backend/.env` — `bootstrapEnv.js` 22–23 |
| 10 | Build output | `frontend/dist` — `backend/src/config/paths.js` 24 |
| 11 | Root start | `npm run start` → `@skilz/backend` — root `package.json` |
| 12 | Production static | `NODE_ENV=production` → `express.static` + SPA fallback — `server.js` 1123–1131 |
| 13 | Port | `process.env.PORT \|\| 3000` — `server.js` 1106; **Render injects `PORT`** |

---

## PHASE 2 — Render compatibility matrix

| Component | Status | Notes |
|-----------|--------|-------|
| **Render Web Service (Node)** | ✅ | Long-running process; matches Express + Socket.IO model |
| **`PORT` env** | ✅ | Server reads `process.env.PORT` (`server.js` 1106) |
| **`0.0.0.0` bind** | ✅ | `server.listen(PORT, '0.0.0.0', ...)` (`server.js` 1157) |
| **WebSockets / Socket.IO** | ✅ | [Render supports WebSockets](https://render.com/docs/websocket) on web services |
| **Multi-instance Socket.IO** | ⚠ | In-memory rooms break without `REDIS_URL` + adapter (`server.js` 758–771) — use **1 instance** or Render Redis |
| **Ephemeral filesystem** | ⚠ | Writes under `backend/src/data/` lost on redeploy/restart |
| **Firebase Admin (file path)** | ⚠ → ✅ | Use `FIREBASE_SERVICE_ACCOUNT_JSON` + `scripts/render-prepare-firebase.mjs` at build |
| **Monorepo workspaces** | ✅ | `npm ci` + `npm run build` + `npm run start` from repo root |
| **Node 20** | ✅ | README: Node 18+; use `NODE_VERSION=20` on Render |
| **Cloud Functions** | N/A on Render | Deploy from `backend/` to Firebase |

---

## 1. Can Express run on Render Web Service?

**Yes.**

- Entry: `node src/bootstrapEnv.js` (cwd = `backend/` when started via workspace — **Render must use repo root** so `npm run start` resolves workspace correctly).
- Express 5 + JSON body + route mounts in `server.js`.
- Render health check can use `/` (SPA `index.html` in production).

**Evidence:** root `package.json` scripts `build` / `start`; `server.js` creates `http.createServer(app)`.

---

## 2. Is Socket.IO compatible with Render Web Services?

**Yes**, with caveats:

| Scenario | Works? |
|----------|--------|
| Single Render instance, same URL as SPA | ✅ Same-origin `/socket.io` (no `VITE_SOCKET_URL` needed) |
| Multiple instances without Redis | ❌ Split rooms / desync |
| Multiple instances + `REDIS_URL` + adapter | ✅ `server.js` 758–771 |
| Render Free spin-down | ⚠ Cold start disconnects all sockets |

Socket auth uses Firebase ID token (`server.js` ~776+). CORS: set `SOCKET_CORS_ORIGINS` if UI is on another domain (e.g. Vercel static + Render API).

---

## 3. Filesystem dependencies on ephemeral storage

| Path / usage | Ephemeral risk | Evidence |
|--------------|----------------|----------|
| `backend/src/data/*.json` | **High** — recreated empty on fresh deploy | `dataService.js` `ensureDataFiles`, `safeWrite` |
| `backend/src/data/matches.json` | **High** | `server.js` `MATCHES_FILE`, atomic writes |
| `backend/secrets/*.json` | Build-time only — OK if written in `buildCommand` | `render-prepare-firebase.mjs` |
| Enigma local JSON banks | **Read-only** from repo — OK | `localQuestionBank.js` reads bundled files |
| Ludo room snapshots | **Firestore** (not JSON file) | `roomManager.js` header: "Firestore only" |
| `proper-lockfile` on JSON | OK on Linux Render; useless if data ephemeral | `dataService.js` 59 |

**Read-only repo files** (no write): `bots.default.json`, enigma fallback JSON under `backend/src/services/enigmaPulse/data/`.

---

## 4. Will `backend/src/data/*.json` cause issues?

**Yes — operational issues, not boot failures.**

| File | Purpose | On Render redeploy |
|------|---------|-------------------|
| `users.json` | Legacy wallet mirror, auth bootstrap | **Reset** to `[]` if missing; Firebase users may need re-bootstrap |
| `game_rooms.json`, `invitations.json`, `scores.json`, `games.json`, `plans.json` | Legacy/local features | **Reset** |
| `matches.json` | Legacy match store | **Reset** |

**Mitigation:** Primary data is **Firestore** for profiles, payments, Ludo matches. Treat JSON as **cache/legacy**; expect re-hydration from Firebase after deploy.

**Games impact:**

- Features still using `dataService` JSON heavily may lose local state after deploy.
- Firestore-first flows (Ludo persist, payments, user docs) survive.

---

## 5. Firebase Admin SDK on Render

**Works** if you configure credentials.

| Method | Supported? |
|--------|------------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` → file | ✅ After `render-prepare-firebase.mjs` in build |
| `GOOGLE_APPLICATION_CREDENTIALS` → file path | ✅ Same file |
| Inline JSON env only (no code change) | ❌ Not in `firebaseAdmin.js` today — use prepare script |

**Required env:**

- `FIREBASE_SERVICE_ACCOUNT_JSON` (secret, full JSON)
- `FIREBASE_SERVICE_ACCOUNT_PATH=secrets/render-service-account.json` (relative to `backend/`)
- `FIREBASE_DATABASE_URL=https://skilz-63d0a-default-rtdb.firebaseio.com`

Without these: `getAdminFirestore()` returns `null` — auth bootstrap 503, payments fail (`paymentController.js`).

**Cloud Functions:** Remain on Google; browser calls `cloudfunctions.net` — unaffected by Render.

---

## 6. Required environment variables for Render

### Required (production)

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` — enables static SPA (`server.js` 1123) |
| `PORT` | Set automatically by Render |
| `NODE_VERSION` | `20` (recommended) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret — service account JSON string |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `backend/secrets/render-service-account.json` |
| `FIREBASE_DATABASE_URL` | RTDB for Admin presence |
| `JWT_SECRET` | Strong secret (no default in prod) — `auth.js` line 4 |
| `ADMIN_EMAIL` | Admin API gate — `adminMiddleware.js` |
| `APP_BASE_URL` | `https://<your-service>.onrender.com` or custom domain — Enigma invites (`enigmaPulseRealtime.js` 1357) |
| `CLOUDINARY_CLOUD_NAME` | Payment screenshots |
| `CLOUDINARY_API_KEY` | |
| `CLOUDINARY_API_SECRET` | |

### Recommended

| Variable | Purpose |
|----------|---------|
| `SOCKET_CORS_ORIGINS` | Only if SPA on another origin |
| `FIREBASE_PROJECT_ID` | `skilz-63d0a` |
| `CONTACT_IP_PEPPER` | Contact form hashing |

### Optional

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Socket.IO adapter + Ludo queue (`server.js` 758+) |
| `LUDO_QUEUE_BACKEND=redis` | |
| `LUDO_ROOM_STATE_BACKEND=redis` | |
| `SMTP_*`, `MAILCHIMP_*` | Email features |
| `OPENAI_API_KEY`, `TRIVIA_AI_*` | Admin AI generation |
| `MEILI_*`, `ALGOLIA_*` | Search |
| `ENIGMA_PULSE_QUESTION_SOURCE` | `auto` / `firestore` / `local` |

### Do NOT set on Render production

| Variable | Why |
|----------|-----|
| `VITE_USE_FUNCTIONS_EMULATOR=true` | Breaks callables |
| `ENABLE_DEV_CONSOLE_OTP=1` | Dev only (`server.js` 86) |
| `VITE_SOCKET_URL` | Omit if SPA served from same Render URL |

---

## 7. Deployment configuration

- **Blueprint:** `render.yaml` (repo root)
- **Build helper:** `scripts/render-prepare-firebase.mjs`

Manual Dashboard equivalent:

- **Root directory:** (repo root)
- **Build:** `npm ci && npm run build && node scripts/render-prepare-firebase.mjs`
- **Start:** `npm run start`
- **Health check path:** `/`

---

## 8. Blockers on Render Free

| Blocker | Severity | Detail |
|---------|----------|--------|
| **Spin down after ~15 min idle** | 🔴 High | All Socket.IO games disconnect; cold start 30s+ |
| **512 MB RAM** | 🟠 Medium | Large JS heap + in-memory game rooms |
| **Ephemeral disk** | 🟠 Medium | JSON legacy data wiped each deploy |
| **No persistent disk** | 🟠 Medium | Cannot rely on local JSON |
| **750 instance hours/month** | 🟡 Low | One service usually enough |
| **Single region latency** | 🟡 Low | Pick region near users (e.g. Frankfurt / Singapore) |
| **Default JWT secret** | 🔴 High if unset | `auth.js` line 4 — must set `JWT_SECRET` |
| **Unauthenticated `/api/ops/ludo-metrics`** | 🟠 Medium | `server.js` 739–744 |
| **Service account missing** | 🔴 High | Admin 503 |

**Free tier OK for:** demos, QA, staging.  
**Not OK for:** 24/7 production multiplayer without accepting spin-down.

**Upgrade to Starter ($7/mo):** always on, more RAM, better for Socket.IO.

---

## 9. Multiplayer & lobby chat on Render

| Feature | Mechanism | On Render (single instance, always on) | On Render Free (spin-down) |
|---------|-----------|--------------------------------------|----------------------------|
| **Ludo** | Socket.IO + Firestore snapshots | ✅ | ⚠ disconnect when sleeping |
| **Trivia** | `triviaRealtime.js` Socket.IO | ✅ | ⚠ |
| **Math Rush** | `mathRushRealtime.js` | ✅ | ⚠ |
| **Enigma Pulse** | `enigmaPulseRealtime.js` | ✅ | ⚠ |
| **Lobby chat** | Socket + Firestore (`lobbyChatRealtime.js`) | ✅ | ⚠ |
| **Firebase callables** | Google Cloud | ✅ | ✅ (independent) |
| **RTDB presence** | Client + Admin | ✅ | ✅ |

**Requirement:** `NODE_ENV=production`, Firebase Admin configured, **one** web instance (or Redis).

---

## PHASE 5 — Readiness summary

### Ready

- Monorepo build/start scripts
- `PORT` + `0.0.0.0` listen
- Production serves `frontend/dist` from same service
- Socket.IO on same origin
- Ludo persistence → Firestore (not local JSON)
- `render.yaml` + Firebase JSON build script

### Warnings

- Legacy `backend/src/data/*.json` ephemeral
- Debug `fetch` to `127.0.0.1:7889` / `7476` in server/game code (harmless but noise)
- `firebase-admin` v10 on backend vs v13 in functions
- Storage rules: `dmVoice/` client path vs rules (`frontend/src/api/dmApi.js`)
- Large frontend bundle — memory on Free

### Critical (fix before public launch)

1. Set `JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, Cloudinary  
2. Set `APP_BASE_URL` to Render URL  
3. Firebase Auth authorized domain = Render URL  
4. Deploy rules/functions to Firebase  
5. Use **Starter** or accept Free spin-down  
6. Lock down ops metrics routes  

---

## Compatibility score: **7.5 / 10**

| Criterion | Weight | Score |
|-----------|--------|-------|
| Express on Render | 20% | 10/10 |
| Socket.IO | 25% | 8/10 (Free spin-down) |
| Ephemeral / JSON | 15% | 6/10 |
| Firebase Admin | 15% | 8/10 (with prepare script) |
| Free tier production | 15% | 4/10 |
| Multiplayer features | 10% | 9/10 (paid always-on) |

---

## Deploy checklist

1. [ ] Push `render.yaml` + `scripts/render-prepare-firebase.mjs`  
2. [ ] Render → New Blueprint → connect repo  
3. [ ] Set secrets: `FIREBASE_SERVICE_ACCOUNT_JSON`, `JWT_SECRET`, Cloudinary, `ADMIN_EMAIL`, `APP_BASE_URL`  
4. [ ] `cd backend && firebase deploy --only firestore,storage,database,functions`  
5. [ ] Firebase Console → Auth → authorized domains → `*.onrender.com` + custom domain  
6. [ ] Verify: login, Ludo room, Trivia lobby, `/api/plans`  
7. [ ] Upgrade to Starter for production  

---

## Related files

| File | Role |
|------|------|
| `render.yaml` | Render Blueprint |
| `scripts/render-prepare-firebase.mjs` | Write SA JSON at build |
| `package.json` | `build` / `start` |
| `backend/src/server.js` | Express + Socket.IO + static |
| `backend/src/services/dataService.js` | JSON persistence |
| `backend/src/services/firebaseAdmin.js` | Admin SDK |
