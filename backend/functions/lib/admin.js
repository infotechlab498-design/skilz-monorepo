const { existsSync, readFileSync } = require('fs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');

/**
 * Same idea as Firebase docs:
 *   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
 *
 * - **Deployed Cloud Functions:** use default credentials (no JSON file). We call
 *   `initializeApp({ databaseURL })` only; GCP attaches ADC automatically.
 * - **Local / emulator:** set `FIREBASE_SERVICE_ACCOUNT_PATH` to your key JSON path
 *   (relative to the `functions/` folder, or absolute). Then we use `cert(serviceAccount)`.
 */
const DEFAULT_DATABASE_URL = (
  process.env.FIREBASE_DATABASE_URL ||
  'https://skilz-63d0a-default-rtdb.firebaseio.com'
).replace(/\/+$/, '');

function resolveServiceAccountPath() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, '..', raw);
}

function buildInitOptions() {
  const jsonPath = resolveServiceAccountPath();
  if (jsonPath && existsSync(jsonPath)) {
    try {
      const serviceAccount = JSON.parse(readFileSync(jsonPath, 'utf8'));
      return {
        credential: cert(serviceAccount),
        databaseURL: DEFAULT_DATABASE_URL,
        projectId:
          serviceAccount.project_id ||
          process.env.GCLOUD_PROJECT ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.FIREBASE_PROJECT_ID,
      };
    } catch (e) {
       
      console.warn('[functions/admin] FIREBASE_SERVICE_ACCOUNT_PATH read failed:', e.message);
    }
  }
  return { databaseURL: DEFAULT_DATABASE_URL };
}

if (!getApps().length) {
  initializeApp(buildInitOptions());
}

const db = getFirestore();

function getRtdb() {
  return getDatabase();
}

module.exports = { db, getRtdb };
