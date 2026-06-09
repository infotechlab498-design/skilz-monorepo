/**
 * Firebase Admin SDK (Express API) — ESM equivalent of the Firebase docs pattern:
 *
 *   const admin = require('firebase-admin');
 *   const serviceAccount = require('./path/to/serviceAccountKey.json');
 *   admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
 *
 * Here the service account JSON is loaded from disk using env paths (no key in repo):
 *   FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS
 * Relative paths resolve from the `backend/` package root.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { BACKEND_ROOT } from '../config/paths.js';

let firestore = null;
let adminAuth = null;
let rtdb = null;

function resolveIfRelative(p) {
  if (!p || typeof p !== 'string') return '';
  const t = p.trim();
  if (!t) return '';
  return path.isAbsolute(t) ? t : path.resolve(BACKEND_ROOT, t);
}

function serviceAccountJsonPath() {
  const primary = resolveIfRelative(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '');
  if (primary && existsSync(primary)) return primary;
  const adc = resolveIfRelative(process.env.GOOGLE_APPLICATION_CREDENTIALS || '');
  if (adc && existsSync(adc)) return adc;
  return '';
}

/**
 * Lazy Firestore Admin — returns `null` if no service account path is configured or file is missing.
 */
export function getAdminFirestore() {
  if (firestore) return firestore;
  const jsonPath = serviceAccountJsonPath();
  if (!jsonPath) {
    return null;
  }
  try {
    const raw = readFileSync(jsonPath, 'utf8');
    /** @type {Record<string, unknown>} */
    const serviceAccount = JSON.parse(raw);
    if (!getApps().length) {
      const databaseURL = String(
        process.env.FIREBASE_DATABASE_URL || serviceAccount.databaseURL || ''
      ).trim();
      const initOpts = {
        credential: cert(serviceAccount),
        projectId:
          serviceAccount.project_id ||
          process.env.GCLOUD_PROJECT ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.FIREBASE_PROJECT_ID,
      };
      if (databaseURL) {
        initOpts.databaseURL = databaseURL;
      }
      initializeApp(initOpts);
    }
    firestore = getFirestore();
    return firestore;
  } catch (e) {
    console.warn('[firebase-admin] init failed:', e.message);
    return null;
  }
}

/**
 * Lazy Firebase Admin Auth — returns `null` when Admin SDK is not configured.
 */
export function getAdminAuth() {
  if (adminAuth) return adminAuth;
  const db = getAdminFirestore();
  if (!db) return null;
  try {
    adminAuth = getAuth();
    return adminAuth;
  } catch (e) {
    console.warn('[firebase-admin] auth init failed:', e.message);
    return null;
  }
}

/**
 * Firebase Realtime Database (Admin) — requires `databaseURL` on app init
 * (`FIREBASE_DATABASE_URL` or `databaseURL` in the service account JSON).
 */
export function getAdminDatabase() {
  if (rtdb) return rtdb;
  const db = getAdminFirestore();
  if (!db) return null;
  try {
    rtdb = getDatabase();
    return rtdb;
  } catch (e) {
    console.warn('[firebase-admin] Realtime Database not available:', e?.message || e);
    return null;
  }
}
