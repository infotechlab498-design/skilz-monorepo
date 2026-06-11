#!/usr/bin/env bash
# Run ON the Hostinger VPS from /var/www/skilz after git pull.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[deploy] Installing dependencies..."
npm ci

echo "[deploy] Building frontend..."
npm run build

echo "[deploy] Restarting API (PM2)..."
if pm2 describe skilz-api >/dev/null 2>&1; then
  pm2 restart skilz-api
else
  pm2 start deploy/hostinger/ecosystem.config.cjs
fi

pm2 save

echo "[deploy] Smoke checks (local)..."
sleep 2
curl -sf "http://127.0.0.1:3000/health" | head -c 200
echo ""
curl -sf "http://127.0.0.1:3000/api/plans" | head -c 200
echo ""
echo "[deploy] Done. Verify https://skilz.pk/health and https://skilz.pk/api/plans in browser."
