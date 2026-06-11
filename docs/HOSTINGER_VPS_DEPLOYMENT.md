# Hostinger VPS (KVM 2) — Deploy Skilz (skilz.pk)

This guide matches **how the app works locally in production mode**: one Node process serves the React build, `/api/*`, and Socket.IO on port **3000**. Nginx on the VPS terminates HTTPS and proxies to Node.

**Do not use Render for this setup.** Everything runs on your Hostinger VPS.

---

## Architecture (same local test ↔ live)

```
Browser → https://skilz.pk
       → nginx :443 (SSL)
       → Node Express + Socket.IO :3000
            ├── frontend/dist  (React SPA)
            ├── /api/plans     (REST)
            └── /socket.io     (games)
```

**Local parity test (on your PC before deploy):**

```powershell
npm run build
$env:NODE_ENV = "production"; npm run start
# Open http://localhost:3000 — plans + sockets should work
```

If that works locally but `skilz.pk` fails, the VPS Node process or nginx upstream is wrong — not your React code.

---

## What you need before starting

| Item | Where |
|------|--------|
| Hostinger VPS KVM 2 (Ubuntu 22.04 recommended) | hPanel |
| Domain `skilz.pk` A record → VPS public IP | Hostinger DNS |
| SSH access (root or sudo user) | hPanel → VPS → SSH |
| Firebase service account JSON | Firebase Console → Project settings → Service accounts |
| Copy of your local `.env` (secrets) | Your machine — **never commit** |

Repo helper files:

| File | Purpose |
|------|---------|
| `deploy/hostinger/env.production.example` | Env template for `/var/www/skilz/.env` |
| `deploy/hostinger/nginx-skilz.pk.conf.example` | nginx site config |
| `deploy/hostinger/ecosystem.config.cjs` | PM2 process manager |
| `deploy/hostinger/deploy.sh` | Rebuild + restart after `git pull` |

---

## Phase 1 — First-time VPS setup (once)

SSH into the VPS:

```bash
ssh root@YOUR_VPS_IP
```

### 1.1 System packages

```bash
apt update && apt upgrade -y
apt install -y git curl nginx certbot python3-certbot-nginx ufw
```

### 1.2 Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### 1.3 Node.js 20 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # v20.x
npm -v
```

### 1.4 PM2 (keep Node running after logout/reboot)

```bash
npm install -g pm2
mkdir -p /var/log/pm2
```

### 1.5 Clone the project

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/infotechlab498-design/skilz-monorepo.git skilz
cd skilz
npm ci
```

(Use your actual repo URL if different.)

### 1.6 Production environment file

```bash
cp deploy/hostinger/env.production.example .env
nano .env
```

**Required edits:**

- `JWT_SECRET` — long random string (`openssl rand -hex 32`)
- `ADMIN_EMAIL` — your admin login email
- Firebase keys / paths (copy from your working local `.env`)
- `VITE_FIREBASE_DATABASE_URL` — use regional URL if Firebase warns:
  `https://skilz-63d0a-default-rtdb.asia-southeast1.firebasedatabase.app`

Upload Firebase Admin JSON (from your PC):

```bash
mkdir -p /var/www/skilz/backend/secrets
# From your PC (PowerShell):
# scp C:\skilz\backend\secrets\skilz-firebase-adminsdk.json root@YOUR_VPS_IP:/var/www/skilz/backend/secrets/
chmod 600 /var/www/skilz/backend/secrets/*.json
```

**Do not set `VITE_SOCKET_URL`** when API and site share `skilz.pk` (same origin).

### 1.7 Build and start Node

```bash
cd /var/www/skilz
npm run build
pm2 start deploy/hostinger/ecosystem.config.cjs
pm2 save
pm2 startup    # run the command it prints, then: pm2 save
```

Verify Node **before** nginx:

```bash
curl -s http://127.0.0.1:3000/health
# {"ok":true,"ts":...}

curl -s http://127.0.0.1:3000/api/plans
# JSON array of plans
```

If these fail, fix Node/env first — nginx cannot fix a dead backend.

### 1.8 nginx + SSL

```bash
cp /var/www/skilz/deploy/hostinger/nginx-skilz.pk.conf.example /etc/nginx/sites-available/skilz.pk
ln -sf /etc/nginx/sites-available/skilz.pk /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default   # optional: remove default site
nginx -t
```

Issue certificate (domain must already point to this VPS IP):

```bash
certbot --nginx -d skilz.pk -d www.skilz.pk
systemctl reload nginx
```

### 1.9 Firebase Console

Authentication → Settings → **Authorized domains** → add:

- `skilz.pk`
- `www.skilz.pk`

---

## Phase 2 — Verify live site

| URL | Expected |
|-----|----------|
| `https://skilz.pk/` | Home page |
| `https://skilz.pk/health` | JSON `{"ok":true,...}` **not** HTML |
| `https://skilz.pk/api/plans` | JSON plans array |
| Browser console | No 502 on `/api/plans` |
| After login | Socket connects to `wss://skilz.pk/socket.io/` |

**502 Bad Gateway** = nginx cannot reach Node on `127.0.0.1:3000`. Run:

```bash
pm2 status
pm2 logs skilz-api --lines 50
curl http://127.0.0.1:3000/health
```

---

## Phase 3 — Deploy updates (every release)

On the VPS:

```bash
cd /var/www/skilz
git pull origin main
bash deploy/hostinger/deploy.sh
```

Or manually:

```bash
npm ci
npm run build
pm2 restart skilz-api
```

---

## Fixing your current 502 on skilz.pk

Your live site already serves the **static React build** via nginx, but `/api` and `/socket.io` return **502** because **Node is not running** (or nginx points to the wrong port).

**Fix:**

1. Complete Phase 1.7 — PM2 running `skilz-api` on port 3000  
2. Replace nginx config with `deploy/hostinger/nginx-skilz.pk.conf.example` (proxy to `127.0.0.1:3000`)  
3. Remove any old setup that only serves static files for `/` but proxies `/api` to a dead upstream  

**Recommended:** proxy **all** traffic to Node (one server serves SPA + API — same as local `NODE_ENV=production npm run start`).

---

## Optional: static files only on nginx (not recommended for parity)

If you insist on nginx serving `frontend/dist` directly:

```nginx
root /var/www/skilz/frontend/dist;
location / { try_files $uri $uri/ /index.html; }
location /api/ { proxy_pass http://127.0.0.1:3000; ... }
location /socket.io/ { proxy_pass http://127.0.0.1:3000; ... }
```

Node must **still** run for `/api` and `/socket.io`. You must run `npm run build` after every frontend change.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| 502 on `/api/plans` | PM2 not running / crash | `pm2 logs skilz-api`, fix env, `pm2 restart skilz-api` |
| `/health` returns HTML | nginx serves SPA, not Node | Use full proxy config above |
| Plans empty / 500 | `plans.json` missing | File is in repo at `backend/src/data/plans.json`; redeploy |
| Socket `connect_error` | Same as 502, or CORS | Ensure `SOCKET_CORS_ORIGINS` includes `https://skilz.pk` |
| RTDB region warning | Wrong database URL | Set `VITE_FIREBASE_DATABASE_URL` + rebuild |
| Port 3000 in use | Old process | `pm2 delete all` or `fuser -k 3000/tcp`, restart PM2 |

---

## Local dev vs VPS (intentional difference)

| | Local dev | VPS production |
|---|-----------|----------------|
| Command | `npm run dev` | PM2 + `bootstrapEnv.js` |
| UI URL | http://localhost:5173 | https://skilz.pk |
| API | Vite proxy → :3000 | nginx → :3000 |
| Hot reload | Yes | No — run `deploy.sh` after changes |

For **production parity on your PC**, use `npm run build` + `NODE_ENV=production npm run start` on port 3000 — not `npm run dev`.

---

## Quick reference commands (on VPS)

```bash
pm2 status
pm2 logs skilz-api
pm2 restart skilz-api
nginx -t && systemctl reload nginx
certbot renew --dry-run
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/api/plans
```
