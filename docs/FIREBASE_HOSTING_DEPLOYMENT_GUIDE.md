# Firebase Hosting Deployment Guide — Skilz

This document is a **critical, code-based checklist** for deploying the Skilz monorepo using **Firebase Hosting**. It is written for the actual project layout:

| Package | Stack | Role |
|---------|--------|------|
| `frontend/` | React 19 + Vite 6 | SPA (`frontend/dist` after build) |
| `backend/` | Express 5 + Socket.IO 4 | REST `/api/*` + realtime games |
| `backend/functions/` | Firebase Cloud Functions Gen2 | Callable + scheduled jobs |
| `backend/firebase/` | Rules + indexes | Firestore, Storage, RTDB |

**Firebase project (from repo):** `skilz-63d0a` (`backend/.firebaserc`)

---

## 1. Critical truth: Hosting is not the whole app

Firebase Hosting serves **static files only** (HTML, JS, CSS, images). It does **not** run your Express server or Socket.IO.

Your app today depends on:

| Capability | Where it lives | Works on Hosting alone? |
|------------|----------------|-------------------------|
| React UI | `frontend/dist` | **Yes** |
| REST API (`/api/...`) | `backend/src/server.js` | **No** — needs rewrite to Cloud Run / VPS / other |
| Socket.IO (`/socket.io`) | Same Node process | **No** — needs WebSocket-capable backend |
| Firebase Auth / Firestore / RTDB / Storage | Client SDK + rules | **Yes** (after Console + rules deploy) |
| Callable functions | `backend/functions/` | **Yes** (after `firebase deploy --only functions`) |

**Conclusion:** Deploying **only** `firebase deploy --only hosting` gives you the marketing shell and Firebase-client features. **Ludo, Math Rush, Trivia, Enigma Pulse, lobby chat sockets, payments upload API, admin REST, contact form, etc.** need a **live Node backend** unless you re-architect them.

Choose one of these models before you start:

### Model A — Hosting + separate API host (common)

- **Firebase Hosting:** SPA at `https://your-app.web.app` or custom domain  
- **Express + Socket.IO:** Railway, Render, Fly.io, VPS, or **Cloud Run** at e.g. `https://api.yourdomain.com`  
- **Build-time env:** `VITE_SOCKET_URL=https://api.yourdomain.com`  
- **Backend env:** `SOCKET_CORS_ORIGINS=https://your-app.web.app,https://yourdomain.com`

### Model B — Hosting + Cloud Run rewrites (single domain, advanced)

- Hosting serves static files  
- `firebase.json` rewrites `/api/**` and `/socket.io/**` to a **Cloud Run** service running the same Express app  
- Requires Docker/Cloud Run setup, WebSocket support, and session affinity for multiplayer  
- **Not configured in this repo today** — you must add it

### Model C — Hosting only (limited / demo)

- Only pages that use Firestore/Auth/callables directly  
- **Do not expect multiplayer or `/api` routes to work**

This guide covers **Model A** (recommended first launch) and the **Hosting-specific steps** shared by all models.

---

## 2. Prerequisites checklist

Complete these before your first production deploy.

### Tools & access

- [ ] **Node.js 18+** installed locally (Functions package targets Node 24 — use 20+ for deploy CLI)
- [ ] **npm** 9+ at monorepo root: `npm install`
- [ ] **Firebase CLI:** `npm install -g firebase-tools` then `firebase login`
- [ ] Access to Firebase project **`skilz-63d0a`** (Editor or Owner)
- [ ] **Billing enabled** on the GCP project (Blaze plan) if you use Cloud Functions, outbound APIs, or Cloud Run

### Firebase Console (project `skilz-63d0a`)

- [ ] **Authentication** → enable providers you use: Email/Password, Google, Facebook, Phone (if used)
- [ ] **Authentication** → **Settings** → **Authorized domains** → add:
  - `your-project.web.app`
  - `your-project.firebaseapp.com`
  - Your **custom domain** (when added)
- [ ] **Firestore** database created (production mode)
- [ ] **Realtime Database** URL matches app config (`https://skilz-63d0a-default-rtdb.firebaseio.com` in examples)
- [ ] **Storage** bucket exists
- [ ] Download **service account JSON** for backend (Admin SDK) → store as `backend/secrets/serviceAccountKey.json` (gitignored)

### Code / repo hygiene

- [ ] Never commit `.env` or `backend/secrets/*.json` (already in `.gitignore`)
- [ ] Rotate any credentials that were pasted into `backend/.env.example` (SMTP examples)
- [ ] Understand `frontend/src/firebase/config.js` uses **hardcoded** web config — acceptable for Firebase web apps, but use `VITE_FIREBASE_*` overrides for staging/prod if you add them later

### Backend host (required for full app)

- [ ] Decide API URL (e.g. `https://api.skilz.example.com`)
- [ ] Plan env vars on that host (see Section 6)
- [ ] If multiple Node instances: plan **Redis** (`REDIS_URL`, `LUDO_QUEUE_BACKEND=redis`)

---

## 3. Add Firebase Hosting to this repo

`backend/firebase.json` currently has **no `hosting` block**. Add the following (paths are relative to `backend/` because that is the Firebase CLI root).

### 3.1 Example `hosting` section

Edit `backend/firebase.json` to include:

```json
{
  "hosting": {
    "public": "../frontend/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public,max-age=31536000,immutable"
          }
        ]
      },
      {
        "source": "/index.html",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      }
    ]
  }
}
```

**SPA routing:** The `** → /index.html` rewrite is required so React Router paths (`/triviaLobby/x`, `/player/dashboard`, etc.) work on refresh.

**Optional API rewrite (Model B only):** Add *before* the SPA catch-all:

```json
{
  "source": "/api/**",
  "run": {
    "serviceId": "skilz-api",
    "region": "us-central1"
  }
}
```

You must deploy Express to Cloud Run as service `skilz-api` first. Socket.IO on Cloud Run needs extra configuration (not covered step-by-step here).

### 3.2 Checkpoint

- [ ] `hosting.public` points to `../frontend/dist` (built output)
- [ ] SPA rewrite to `index.html` is present
- [ ] You did **not** deploy Hosting before running `npm run build`

---

## 4. Production frontend build (Hosting artifact)

All commands from **monorepo root** unless noted.

### 4.1 Environment for build

Create or update `frontend/.env.production` (or use monorepo root `.env` — Vite loads root + frontend per `vite.config.js`):

```env
# Required when API is NOT on the same origin as Hosting
VITE_SOCKET_URL=https://YOUR_API_HOST

# RTDB (must match Firebase Console)
VITE_FIREBASE_DATABASE_URL=https://skilz-63d0a-default-rtdb.firebaseio.com

# Optional overrides (if you stop using hardcoded config.js)
# VITE_FIREBASE_API_KEY=
# VITE_FIREBASE_AUTH_DOMAIN=
# VITE_FIREBASE_PROJECT_ID=
# VITE_FIREBASE_STORAGE_BUCKET=
# VITE_FIREBASE_APP_ID=

VITE_FIREBASE_FUNCTIONS_REGION=us-central1
```

**Why `VITE_SOCKET_URL` matters:** In production, `socketService.js` uses same-origin when unset. On Hosting, same-origin is `*.web.app` — there is **no** Socket.IO server there. You **must** point sockets at your API host.

**API calls:** `frontend/src/services/api.js` uses `const API_BASE = '/api'`. On Hosting-only origin, `/api` hits Hosting (404) unless you add Cloud Run rewrites. For Model A, either:

- Put API on same custom domain behind a reverse proxy, **or**
- Change build to use absolute API base (code change not in repo today — document as limitation), **or**
- Use Model B rewrites for `/api/**`

**Checkpoint — Model A with separate API subdomain:**

- [ ] You will expose API at `https://api.example.com`  
- [ ] You accept that **relative `/api` will fail** until you add a reverse proxy on one domain OR change `API_BASE` / Vite proxy strategy  
- [ ] **Recommended interim:** Use one custom domain: CDN/Hosting for `/` and proxy `/api` + `/socket.io` to Node (nginx/Cloudflare) — not pure Hosting-only

### 4.2 Build commands

```bash
cd /path/to/SkilzProject
npm install
npm run build
```

Verify:

- [ ] Folder exists: `frontend/dist/index.html`
- [ ] No build errors (bundle size warnings are OK)
- [ ] `dist/assets/*.js` present

---

## 5. Deploy Firebase rules & functions (do before or with Hosting)

From **`backend/`** directory:

```bash
cd backend
firebase use skilz-63d0a
firebase deploy --only firestore:rules,firestore:indexes,storage,database
firebase deploy --only functions
```

### Checkpoints

- [ ] Firestore rules deployed (`firebase/firestore.rules`)
- [ ] Storage rules deployed — note: client uses `dmVoice/` but rules may only allow `chatVoice/` and `profileImages/`; fix rules before enabling DM voice
- [ ] RTDB rules deployed (`firebase/database.rules.json`)
- [ ] Functions deploy succeeds (Node 24 runtime in `functions/package.json`)

### Callable CORS / 403 on OPTIONS

If browser shows CORS errors with **403 on OPTIONS** to `cloudfunctions.net`, Gen2 callables need **public HTTP invoke** on the Cloud Run service behind the function. See root `README.md` Firebase section and `backend/functions/index.js` comments.

Test preflight (replace domain):

```bash
curl -i -X OPTIONS "https://us-central1-skilz-63d0a.cloudfunctions.net/getPlayerDashboard" \
  -H "Origin: https://YOUR_HOSTING_DOMAIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization"
```

- [ ] OPTIONS returns 2xx with CORS headers, not 403 HTML

---

## 6. Deploy Firebase Hosting

```bash
cd backend
firebase deploy --only hosting
```

CLI prints Hosting URL, e.g. `https://skilz-63d0a.web.app`.

### Checkpoints

- [ ] Deploy completes without error
- [ ] `https://<project>.web.app` loads homepage
- [ ] Hard refresh on `/signin`, `/triviaLobby/test`, `/player/dashboard` loads (SPA rewrite works)
- [ ] Browser console: Firebase Auth initializes (no `auth/invalid-api-key` if config matches project)

---

## 7. Custom domain on Firebase Hosting

In Firebase Console → **Hosting** → **Add custom domain**:

1. Enter domain (e.g. `app.skilz.com`)
2. Verify DNS (TXT records)
3. Wait for SSL provisioning (automatic)

### DNS checklist

- [ ] Apex or subdomain CNAME/A records as instructed by Firebase
- [ ] SSL certificate status: **Connected**
- [ ] Domain added under **Authentication → Authorized domains**
- [ ] OAuth providers (Google/Facebook) updated with new redirect URIs if required

---

## 8. Backend deployment (required for full Skilz experience)

Hosting does not replace this. Minimum production env on your Node host:

```env
NODE_ENV=production
PORT=3000
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/serviceAccountKey.json
FIREBASE_DATABASE_URL=https://skilz-63d0a-default-rtdb.firebaseio.com
JWT_SECRET=<strong-random-secret>
ADMIN_EMAIL=info@aljazeeragc.com
APP_BASE_URL=https://YOUR_PUBLIC_APP_URL
SOCKET_CORS_ORIGINS=https://skilz-63d0a.web.app,https://YOUR_CUSTOM_DOMAIN
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Optional: `REDIS_URL`, `SMTP_*`, `MAILCHIMP_*`, `OPENAI_API_KEY`, etc.

### Start server (same machine / VM)

```bash
npm run build
NODE_ENV=production npm run start
```

This serves `frontend/dist` **from Express** on port 3000 — useful for smoke tests, but **not** what Hosting uses.

### Checkpoints on API host

- [ ] `GET https://API_HOST/api/plans` returns JSON (or 401 where expected)
- [ ] Socket connects: browser Network → WS to `API_HOST/socket.io`
- [ ] Firebase Admin configured (no 503 on `/api/auth/bootstrap-json-user`)
- [ ] `SOCKET_CORS_ORIGINS` includes your Hosting URL(s)

---

## 9. End-to-end verification matrix

After Hosting + backend + rules + functions:

| Test | Expected |
|------|----------|
| Hosting URL loads `/` | Home page renders |
| `/signin` refresh | No 404 |
| Email / Google / Facebook login | Redirects succeed; session persists |
| Firestore profile read | Player dashboard data loads |
| Callable (e.g. billing) | No CORS 403 |
| REST `/api/contact` | Submits when backend reachable |
| Join Trivia / Ludo room | Socket connects to **API host**, not Hosting |
| Profile image upload | Storage rules allow `profileImages/{uid}/` |
| Admin `/admin/payments` | Admin user only |
| Custom domain HTTPS | Valid certificate |

---

## 10. Common failures (MERN + Hosting)

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| 404 on `/api/*` from Hosting URL | No backend on same origin | Deploy Node API; use rewrites or shared domain proxy |
| `connect_error` on Socket.IO | `VITE_SOCKET_URL` unset or wrong | Set to API URL; rebuild; redeploy Hosting |
| CORS on socket | `SOCKET_CORS_ORIGINS` missing Hosting origin | Add Hosting + custom domains to env |
| `auth/unauthorized-domain` | Domain not in Firebase Auth | Add to Authorized domains |
| Callable CORS / 403 OPTIONS | Cloud Run invoker private | Public invoker on function service (README) |
| Blank page after deploy | Wrong `public` path or build not run | `npm run build`; check `frontend/dist` |
| Refresh 404 on routes | Missing SPA rewrite | Add `** → /index.html` in hosting config |
| DM voice upload fails | Storage rules lack `dmVoice/` | Update `storage.rules` and redeploy |
| Multiplayer desync on 2+ servers | In-memory rooms without Redis | Set `REDIS_URL` and Ludo redis backends |

---

## 11. Ordered deployment runbook (copy-paste sequence)

Use this order on release day:

1. [ ] Merge/release branch ready  
2. [ ] `npm install` (root)  
3. [ ] Set `frontend/.env.production` (`VITE_SOCKET_URL`, RTDB URL, etc.)  
4. [ ] `npm run build` → verify `frontend/dist`  
5. [ ] Add `hosting` block to `backend/firebase.json` (Section 3)  
6. [ ] `cd backend && firebase use skilz-63d0a`  
7. [ ] `firebase deploy --only firestore:rules,firestore:indexes,storage,database`  
8. [ ] `firebase deploy --only functions`  
9. [ ] Deploy / start Express + Socket.IO on API host with production env  
10. [ ] `firebase deploy --only hosting`  
11. [ ] Add custom domain + DNS + Auth authorized domains  
12. [ ] Run verification matrix (Section 9)  
13. [ ] Monitor Firebase Console → Hosting, Functions logs, and API host logs  

---

## 12. What this repo does NOT include (you must add separately)

- [ ] `hosting` section in `firebase.json` (you add per Section 3)  
- [ ] Cloud Run service + rewrite for `/api` on one domain (Model B)  
- [ ] `VITE_API_BASE_URL` pattern (API is hardcoded to `/api` today)  
- [ ] CI/CD workflow for `build → deploy hosting`  
- [ ] Firebase App Check (recommended before public launch)  
- [ ] Stripe — payments use manual JazzCash/EasyPaisa/bank + Cloudinary screenshots  

---

## 13. Quick reference — commands

```bash
# Build SPA
npm run build

# Firebase (from backend/)
cd backend
firebase login
firebase use skilz-63d0a
firebase deploy --only firestore:rules,firestore:indexes,storage,database
firebase deploy --only functions
firebase deploy --only hosting

# Preview hosting locally (optional)
firebase hosting:channel:deploy preview --expires 7d
```

---

## 14. GO / NO-GO for “Hosting only”

| Scenario | GO? |
|----------|-----|
| Deploy marketing site + Auth + Firestore-only flows | **GO** (with rules + Auth domains) |
| Full Skilz games + `/api` + admin + payments | **NO-GO** on Hosting alone — **requires API host** (Section 8) |
| Single custom domain with nginx proxy to Node for `/api` + `/socket.io` + Hosting for static | **GO** (operational pattern, not pure Firebase-only) |

---

*Document version: 2026-05-31 — based on `frontend/`, `backend/`, `backend/firebase.json`, `README.md`, and client API/socket code.*
