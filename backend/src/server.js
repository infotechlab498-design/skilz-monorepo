import crypto from 'crypto';
import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import { lock } from 'proper-lockfile';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { BACKEND_ROOT, MATCHES_FILE, resolveFrontendDist } from './config/paths.js';

/* dotenv is applied in `bootstrapEnv.js` before this module loads — see package.json `dev` / `start`. */

import checkoutRoutes from './routes/checkoutRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import userFirestoreRoutes from './routes/userFirestoreRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import newsletterAdminRoutes from './routes/newsletterAdminRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import * as dataService from './services/dataService.js';
import * as scoreController from './controllers/scoreController.js';
import { signToken, authenticateToken } from './middleware/auth.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { requireAdmin } from './middleware/adminMiddleware.js';
import { apiErrorHandler } from './middleware/errorHandler.js';
import { firestoreRegistrationDocState } from './services/firestoreRegistrationGate.js';
import { getAdminAuth, getAdminFirestore } from './services/firebaseAdmin.js';
import { ensureUserDocAdmin } from './services/userFirestoreAdmin.js';
import { createMathRushHandlers } from './services/mathRushRealtime.js';
import { createTriviaHandlers } from './services/triviaRealtime.js';
import { createEnigmaPulseHandlers } from './services/enigmaPulseRealtime.js';
import { warmEnigmaQuestionPools } from './services/enigmaPulse/warmQuestionPools.js';
import { createLudoHandlers, loadLudoSnapshotsInto } from './services/ludoRealtime.js';
import { createLudoQueueStore } from './services/ludo/queue/createLudoQueueStore.js';
import { platformLog } from './services/gameRealtimeDebug.js';
import { createClient } from 'redis';
import { MemoryRoomStateAdapter } from './services/ludo/infrastructure/stateStore/MemoryRoomStateAdapter.js';
import { RedisMirrorRoomStateAdapter } from './services/ludo/infrastructure/stateStore/RedisRoomStateAdapter.js';
import { RoomStateStore } from './services/ludo/infrastructure/stateStore/RoomStateStore.js';
import {
  formatLudoMetricsPrometheus,
  getLudoMetricsSnapshot,
} from './services/ludo/infrastructure/observability/ludoMetrics.js';
import { startLudoRoomGc } from './services/ludo/ludoRoomGc.js';
import {
  onPresencePing,
  onPresenceSocketConnected,
  onPresenceSocketDisconnected,
} from './services/presence/userStateRtdb.js';
import { createLobbyChatHandlers } from './services/lobbyChatRealtime.js';

/** Browser origins allowed for Socket.IO (comma list in `SOCKET_CORS_ORIGINS`). */
function resolveSocketCorsOrigins() {
  const raw = String(process.env.SOCKET_CORS_ORIGINS || '').trim();
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
  ];
}

const DB_PATH = MATCHES_FILE;

function legacyExpressAuthEnabled() {
  return (
    process.env.ENABLE_LEGACY_EXPRESS_AUTH === '1' ||
    process.env.ENABLE_LEGACY_EXPRESS_AUTH === 'true'
  );
}

function stripPassword(user) {
  if (!user || typeof user !== 'object') return user;
  const { password: _p, ...safe } = user;
  return safe;
}

function isDevConsoleOtpEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_CONSOLE_OTP === '1';
}

/** @type {Map<string, { code: string, expAt: number }>} */
const devConsoleOtpByEmail = new Map();

const DEV_CONSOLE_OTP_TTL_MS = 10 * 60 * 1000;

async function findUserByEmailLoose(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const users = await dataService.getUsers();
  return users.find((u) => (u.email || '').toLowerCase() === normalized) || null;
}

function devConsoleOtpPrune() {
  const now = Date.now();
  for (const [k, v] of devConsoleOtpByEmail) {
    if (v.expAt <= now) devConsoleOtpByEmail.delete(k);
  }
}

function stableDevOtpUid(emailNorm) {
  const hex = crypto.createHash('sha256').update(emailNorm, 'utf8').digest('hex').slice(0, 40);
  return `devotp_${hex}`;
}

async function verifyFirebaseHttpToken(idToken) {
  const token = typeof idToken === 'string' ? idToken.trim() : '';
  if (!token) {
    const err = new Error('idToken is required');
    err.statusCode = 400;
    throw err;
  }
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    const err = new Error(
      'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS on the server.'
    );
    err.statusCode = 503;
    err.code = 'ADMIN_NOT_CONFIGURED';
    throw err;
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      ...decoded,
      uid: decoded.uid,
      email: decoded.email || '',
      displayName: decoded.name || '',
      photoURL: decoded.picture || '',
    };
  } catch {
    const err = new Error('Invalid or expired Firebase token');
    err.statusCode = 401;
    throw err;
  }
}

/**
 * Mirror wallet row in `users.json` for a Firebase user who already has `users/{uid}` in Firestore (registered).
 * @param {{ uid: string, email: string, displayName: string, photoURL: string }} verified
 */
async function loadOrCreateJsonUserFromFirebaseVerified(verified) {
  // Ensure Firestore wallet/profile exists with server-side defaults (signup bonus on first create).
  try {
    await ensureUserDocAdmin(verified.uid, {
      email: verified.email || '',
      displayName: verified.displayName || '',
    });
  } catch (e) {
    console.warn('[auth] ensureUserDocAdmin failed:', e?.message || e);
  }

  let user = await dataService.getUserByIdOrUid(verified.uid);
  if (user) return stripPassword(user);

  const email =
    verified.email && verified.email.trim() !== ''
      ? verified.email.trim()
      : `${verified.uid}@noreply.firebase`;

  const emailDup = await findUserByEmailLoose(email);
  if (
    emailDup &&
    emailDup.id !== verified.uid &&
    emailDup.uid !== verified.uid
  ) {
    const err = new Error(
      'This email is already linked to another Skilz account. Use that account or contact support.'
    );
    err.code = 'EMAIL_CONFLICT';
    throw err;
  }

  const baseName =
    (verified.displayName && verified.displayName.trim()) ||
    (email.includes('@') ? email.split('@')[0] : 'player');
  let sanitized = String(baseName).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  if (!sanitized) sanitized = 'player';
  let username = sanitized;
  let allocated = false;
  for (let i = 0; i < 64; i++) {
    if (!(await dataService.getUserByUsername(username))) {
      allocated = true;
      break;
    }
    username = `${sanitized}_${crypto.randomBytes(2).toString('hex')}`;
  }
  if (!allocated) {
    throw new Error('Could not allocate a unique username; try again');
  }

  const name = (verified.displayName && verified.displayName.trim()) || username;

  const newUser = await dataService.registerUser({
    id: verified.uid,
    uid: verified.uid,
    username,
    name,
    email,
    photoURL: verified.photoURL || '',
  });
  return stripPassword(newUser);
}

async function startServer() {
  console.log('[server] Starting Skilz API (Express + Socket.IO)…');
  await dataService.ensureDataFiles();

  if (!getAdminFirestore()) {
    console.warn(
      '[auth] Firestore Admin is not available — POST /api/auth/bootstrap-json-user returns 503 until a service account JSON path is set. Use FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS (relative paths resolve from the `backend/` folder). See backend/.env.example.'
    );
  } else {
    console.log('[auth] Firestore Admin OK — bootstrap can verify Firestore users/{uid}.');
  }

  const app = express();
  app.use(express.json());


  // --- Debug Routes ---
  app.post('/api/debug/log', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    console.log('[CLIENT_DEBUG]', JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
  });

  // --- Authentication Routes ---

  app.post('/api/auth/signup', async (req, res) => {
    try {
      if (!legacyExpressAuthEnabled()) {
        return res.status(410).json({
          success: false,
          message:
            // DISABLED: Replaced by Firebase Authentication
            'Express password signup is disabled. Use Firebase sign-up in the app.',
        });
      }
      const { username, email, password, phone, cnic } = req.body;

      // Basic check

      const existingEmail = await dataService.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }

      const existingUsername = await dataService.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }

      const newUser = await dataService.registerUser({ username, email, password, phone, cnic });
      const token = signToken(newUser.id);
      res.json({ success: true, user: newUser, token });
    } catch (error) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /** Math Rush / Firebase-style social registration (uid + profile, no password). */
  app.post('/api/auth/register-social', async (req, res) => {
    try {
      if (!legacyExpressAuthEnabled()) {
        return res.status(410).json({
          success: false,
          message:
            // DISABLED: Replaced by Firebase Authentication
            'Express register-social is disabled. Use Firebase Auth + bootstrap-json-user.',
        });
      }
      const { uid, displayName, photoURL } = req.body;
      if (!uid) {
        return res.status(400).json({ success: false, message: 'uid is required' });
      }

      const existing = await dataService.getUserByIdOrUid(uid);
      if (existing) {
        if (existing.id == null || existing.id === '') {
          return res.status(500).json({
            success: false,
            message: 'Account record incomplete; contact support',
          });
        }
        const token = signToken(String(existing.id));
        return res.json({ success: true, user: existing, token });
      }

      const safeName = (displayName || 'Player').trim() || 'Player';
      const sanitized = String(uid).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16);
      const usernameBase =
        sanitized.length > 0
          ? `u_${sanitized}`
          : `u_social_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      let username = usernameBase;
      let allocated = false;
      for (let i = 0; i < 64; i++) {
        if (!(await dataService.getUserByUsername(username))) {
          allocated = true;
          break;
        }
        username = `${usernameBase}_${crypto.randomBytes(3).toString('hex')}`;
      }
      if (!allocated) {
        return res.status(500).json({
          success: false,
          message: 'Could not allocate a unique username; try again',
        });
      }

      const emailLocal = crypto
        .createHash('sha256')
        .update(String(uid), 'utf8')
        .digest('hex')
        .slice(0, 48);
      const socialEmail = `${emailLocal}@social.local`;

      const newUser = await dataService.registerUser({
        id: uid,
        uid,
        username,
        name: safeName,
        email: socialEmail,
        photoURL: photoURL || '',
      });
      const token = signToken(String(newUser.id));
      res.json({ success: true, user: newUser, token });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * After Firebase Auth + Firestore profile (client), create wallet row in users.json + Skilz JWT.
   * Verifies idToken with Firebase Admin.
   */
  app.post('/api/auth/register-firebase', async (req, res) => {
    try {
      const { uid, email, username, phone, cnic, password, idToken } = req.body || {};
      if (!uid || !email || !username || !password) {
        return res.status(400).json({
          success: false,
          message: 'uid, email, username, and password are required',
        });
      }

      const verified = await verifyFirebaseHttpToken(idToken);
      if (verified.uid !== uid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired Firebase session',
        });
      }
      if (verified.email && verified.email.toLowerCase() !== String(email).toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: 'Email does not match Firebase account',
        });
      }

      const regState = await firestoreRegistrationDocState(uid);
      if (regState === 'unknown') {
        return res.status(503).json({
          success: false,
          message:
            'Cannot verify Firestore registration. Set FIREBASE_SERVICE_ACCOUNT_PATH on the server.',
        });
      }
      if (regState === 'error') {
        return res.status(503).json({
          success: false,
          code: 'FIRESTORE_READ_FAILED',
          message:
            'Could not read Firestore to verify registration. Check the service account has Cloud Datastore/Firestore access, the Firestore API is enabled, and the project matches your Firebase app.',
        });
      }
      if (regState === 'no') {
        return res.status(403).json({
          success: false,
          message: 'User not found. Please register first.',
        });
      }

      const existingEmail = await dataService.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      const existingUsername = await dataService.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
      const existingUid = await dataService.getUserByIdOrUid(uid);
      if (existingUid) {
        return res.status(400).json({ success: false, message: 'Account already linked' });
      }

      const newUser = await dataService.registerUser({
        id: uid,
        uid,
        username,
        name: username,
        email,
        phone: phone || '',
        cnic: cnic || '',
        password,
      });
      const safe = stripPassword(newUser);
      if (legacyExpressAuthEnabled()) {
        const token = signToken(String(newUser.id));
        return res.json({ success: true, user: safe, token });
      }
      return res.json({ success: true, user: safe });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * Firebase-native: verify ID token and ensure `users.json` row (no JWT). Client uses ID token on API calls.
   */
  app.post('/api/auth/bootstrap-json-user', async (req, res) => {
    try {
      const verified = await verifyFirebaseHttpToken(req.body?.idToken);

      const regState = await firestoreRegistrationDocState(verified.uid);
      if (regState === 'unknown') {
        return res.status(503).json({
          success: false,
          code: 'ADMIN_NOT_CONFIGURED',
          message:
            'Cannot verify account registration. Set FIREBASE_SERVICE_ACCOUNT_PATH (or GOOGLE_APPLICATION_CREDENTIALS) to a valid service account JSON file on the server, same GCP project as Firestore.',
        });
      }
      if (regState === 'error') {
        return res.status(503).json({
          success: false,
          code: 'FIRESTORE_READ_FAILED',
          message:
            'Could not read Firestore to verify registration. Confirm the service account has Firestore access, the Firestore API is enabled, and project_id in the key matches your Firebase project.',
        });
      }
      if (regState === 'no') {
        return res.status(403).json({
          success: false,
          code: 'NOT_REGISTERED',
          message: 'User not found. Please register first.',
        });
      }

      const user = await loadOrCreateJsonUserFromFirebaseVerified(verified);
      return res.json({ success: true, user });
    } catch (error) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      if (error?.code === 'EMAIL_CONFLICT') {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_CONFLICT',
          message: error.message || 'Email conflict',
        });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * Legacy: Firebase client sign-in exchange for Skilz JWT + users.json row.
   * When ENABLE_LEGACY_EXPRESS_AUTH is unset, returns 410 (use bootstrap-json-user + Firebase ID token for APIs).
   */
  app.post('/api/auth/firebase-login', async (req, res) => {
    try {
      if (!legacyExpressAuthEnabled()) {
        return res.status(410).json({
          success: false,
          message:
            // DISABLED: Replaced by Firebase Authentication
            'firebase-login is disabled. Use POST /api/auth/bootstrap-json-user and send Firebase ID tokens on API requests.',
        });
      }
      const { idToken } = req.body || {};
      if (!idToken) {
        return res.status(400).json({ success: false, message: 'idToken is required' });
      }
      const verified = await verifyFirebaseHttpToken(idToken);

      const regState = await firestoreRegistrationDocState(verified.uid);
      if (regState === 'unknown') {
        return res.status(503).json({
          success: false,
          message:
            'Cannot verify account registration. Set FIREBASE_SERVICE_ACCOUNT_PATH on the server.',
        });
      }
      if (regState === 'error') {
        return res.status(503).json({
          success: false,
          code: 'FIRESTORE_READ_FAILED',
          message:
            'Could not read Firestore to verify registration. Check service account permissions and Firestore API.',
        });
      }
      if (regState === 'no') {
        return res.status(403).json({
          success: false,
          message: 'User not found. Please register first.',
        });
      }

      const user = await loadOrCreateJsonUserFromFirebaseVerified(verified);
      const token = signToken(String(user.id));
      res.json({ success: true, user, token });
    } catch (error) {
      if (error?.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          code: error.code,
          message: error.message,
        });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * Dev only: request a one-time code (logged to server console). Gated by ENABLE_DEV_CONSOLE_OTP=1 and NODE_ENV !== production.
   */
  app.post('/api/auth/dev-console-otp/request', async (req, res) => {
    if (!isDevConsoleOtpEnabled()) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    try {
      const { email } = req.body || {};
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return res.status(400).json({ success: false, message: 'Valid email is required' });
      }
      devConsoleOtpPrune();
      const code = String(crypto.randomInt(100000, 1000000));
      devConsoleOtpByEmail.set(normalized, { code, expAt: Date.now() + DEV_CONSOLE_OTP_TTL_MS });
      console.log(`[dev-console-otp] OTP for ${normalized}: ${code} (server console, expires in 10m)`);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * Dev only: verify code and return same payload shape as firebase-login (Skilz JWT + users.json user).
   */
  app.post('/api/auth/dev-console-otp/verify', async (req, res) => {
    if (!isDevConsoleOtpEnabled()) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    try {
      const { email, code } = req.body || {};
      const normalized = String(email || '').trim().toLowerCase();
      const codeStr = String(code || '').trim();
      if (!normalized || !codeStr) {
        return res.status(400).json({ success: false, message: 'email and code are required' });
      }
      devConsoleOtpPrune();
      const entry = devConsoleOtpByEmail.get(normalized);
      if (!entry || entry.expAt <= Date.now() || entry.code !== codeStr) {
        return res.status(401).json({ success: false, message: 'Invalid or expired code' });
      }
      devConsoleOtpByEmail.delete(normalized);

      let user = await findUserByEmailLoose(normalized);
      if (user) {
        const token = signToken(String(user.id));
        return res.json({ success: true, user: stripPassword(user), token });
      }

      const devUid = stableDevOtpUid(normalized);
      const existingUid = await dataService.getUserByIdOrUid(devUid);
      if (existingUid) {
        const token = signToken(String(existingUid.id));
        return res.json({ success: true, user: stripPassword(existingUid), token });
      }

      // Strict Firebase-only: dev OTP cannot create new accounts (use Firebase sign-up first).
      return res.status(403).json({
        success: false,
        message:
          'No account for this email. Register with Firebase in the app first; dev OTP is sign-in only.',
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post('/api/auth/verify-otp', async (_req, res) => {
    res.status(501).json({
      success: false,
      message:
        'Server OTP is not implemented. Sign-in completes after password verification; use Firebase phone verification on sign-up.',
    });
  });

  // Ludo game routes

  // Initialization: Ensure DB exists and is valid
  
  const ensureDB = () => {
    if (!fs.existsSync(DB_PATH) || fs.readFileSync(DB_PATH, 'utf-8').trim() === '') {
      fs.writeFileSync(DB_PATH, JSON.stringify({ matches: [] }, null, 2));
    }
  };
  ensureDB();

  // Robust Read/Write

  const readDB = async () => {
    try {
      ensureDB();
      const data = await fs.promises.readFile(DB_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Critical database error (Read):', err);
      return { matches: [] };
    }
  };

  const atomicMatchesUpdate = async (updateFn) => {
    ensureDB();
    const release = await lock(DB_PATH, { retries: { retries: 5, minTimeout: 50 } });
    try {
      const raw = await fsPromises.readFile(DB_PATH, 'utf-8');
      const data = JSON.parse(raw || '{"matches":[]}');
      const updated = await updateFn(data);
      await fsPromises.writeFile(DB_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } finally {
      await release();
    }
  };

  // --- API Routes ---

  // Get all matches (optional, for list views)

  app.get('/api/matches', authenticateToken, async (req, res) => {

    const db = await readDB();
    const uid = String(req.userId || '');
    const ownMatches = (db.matches || []).filter((m) =>
      Array.isArray(m?.players) && m.players.some((p) => String(p?.id || '') === uid)
    );
    res.json(ownMatches);

  });

  // Get specific match

  app.get('/api/match/:id', authenticateToken, async (req, res) => {
    try {
      const db = await readDB();
      const match = db.matches.find(m => m.gameId === req.params.id);
      if (match) {
        const uid = String(req.userId || '');
        const playerIds = Array.isArray(match?.players) ? match.players.map((p) => String(p?.id || '')) : [];
        if (!uid || !playerIds.includes(uid)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        return res.json(match);
      }
      res.status(404).json({ error: 'Match not found' });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Save/Update match

  app.post('/api/match', authenticateToken, async (req, res) => {
    try {
      const match = { ...req.body, lastUpdated: new Date().toISOString() };

      if (!match.gameId) return res.status(400).json({ error: 'Missing gameId' });
      const uid = String(req.userId || '');
      const playerIds = Array.isArray(match?.players) ? match.players.map((p) => String(p?.id || '')) : [];
      if (!uid || !playerIds.includes(uid)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await atomicMatchesUpdate(async (db) => {
        if (!db.matches) db.matches = [];
        const existingIdx = db.matches.findIndex(m => m.gameId === match.gameId);
        if (existingIdx >= 0) db.matches[existingIdx] = match;
        else db.matches.push(match);
        return db;
      });
      res.status(201).json(match);
    } catch (err) {
      console.error('API Error (/match):', err);
      res.status(500).json({ error: 'Failed to save match data' });
    }
  });

  app.use('/api', checkoutRoutes);
  app.use('/api/blogs', blogRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/admin/newsletter', requireAuth, requireAdmin, newsletterAdminRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/newsletter', newsletterRoutes);
  app.use('/api', contactRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', gameRoutes);
  app.use('/api', uploadRoutes);
  app.use('/api/user/firestore', userFirestoreRoutes);
  
  app.post('/api/score/update', authenticateToken, scoreController.updateScore);
  app.get('/api/score/leaderboard', scoreController.getLeaderboard);
  app.get('/api/ops/ludo-metrics', (_req, res) => {
    res.json({ success: true, metrics: getLudoMetricsSnapshot() });
  });
  app.get('/api/ops/ludo-metrics/prometheus', (_req, res) => {
    res.type('text/plain; version=0.0.4; charset=utf-8');
    res.send(formatLudoMetricsPrometheus());
  });
  /** Readiness probe — root path avoids `/api/:id` game route shadowing. */
  app.get('/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.use(apiErrorHandler);

  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = resolveFrontendDist();
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[server] Port ${PORT} is already in use (EADDRINUSE). Only one process should listen on this port.\n` +
          '  Typical causes: `npm run dev` in two terminals, or `npm run dev:backend` while root `npm run dev` is running, or a leftover Node process.\n' +
          '  Free the port: npx kill-port ' +
          PORT +
          '\n' +
          '  Windows (PowerShell): Get-NetTCPConnection -LocalPort ' +
          PORT +
          ' | Select-Object OwningProcess; then Stop-Process -Id <pid> -Force\n' +
          '  Or set a different PORT in .env (and match `frontend/vite.config.js` proxy in dev).'
      );
      process.exit(1);
      return;
    }
    console.error('[server] HTTP server error:', err);
    process.exit(1);
  });

  // Accept HTTP immediately so Vite proxy (/api/plans, /health) works while Socket.IO + Ludo init continues.
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`[server] Listening on http://0.0.0.0:${PORT} (API + Socket.IO)`);
      console.log(`[server] Local:    http://localhost:${PORT}`);
      void warmEnigmaQuestionPools().catch((e) => {
        console.warn('[EnigmaPulse] pool warm failed:', e?.message || e);
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          '[dev] Open the SPA at http://localhost:5173 — Vite proxies /api and /socket.io to this server.'
        );
      }
      resolve();
    });
  });

  const io = new Server(server, {
    cors: {
      origin: resolveSocketCorsOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  if (process.env.REDIS_URL) {
    try {
      const [{ createAdapter }, { createClient }] = await Promise.all([
        import('@socket.io/redis-adapter'),
        import('redis'),
      ]);
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[socket] Redis adapter enabled');
    } catch (e) {
      console.warn('[socket] Redis adapter not enabled:', e?.message || e);
    }
  }

  const socketAuthDebug = process.env.LUDO_SOCKET_DEBUG === '1';

  io.use(async (socket, next) => {
    try {
      const fromAuth = socket.handshake?.auth?.token;
      const authHeader =
        socket.handshake?.headers?.authorization || socket.handshake?.headers?.Authorization;
      const fromHeader =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : '';
      const token = String(fromAuth || fromHeader || '').trim();
      if (!token) {
        if (socketAuthDebug) console.warn('[socket] rejected: missing token', socket.id);
        return next(new Error('UNAUTHENTICATED_SOCKET: Missing Firebase ID token'));
      }

      const adminAuth = getAdminAuth();
      if (!adminAuth) {
        return next(new Error('UNAUTHENTICATED_SOCKET: Firebase Admin not configured'));
      }

      const decoded = await adminAuth.verifyIdToken(token);
      socket.user = {
        uid: decoded.uid,
        email: decoded.email || '',
        name: decoded.name || '',
      };
      if (socketAuthDebug) {
        console.log('[socket] auth ok', socket.id, 'uid=', decoded.uid);
      }
      return next();
    } catch (e) {
      if (socketAuthDebug) {
        console.warn('[socket] auth failed', socket.id, e?.message || e);
      }
      return next(new Error(`UNAUTHENTICATED_SOCKET: ${e?.message || 'Token verification failed'}`));
    }
  });

  const attachMathRush = createMathRushHandlers(io);
  const attachTriviaRealtime = createTriviaHandlers(io);
  const attachEnigmaPulse = createEnigmaPulseHandlers(io);

  const roomStates = new Map();
  /** Legacy `joinRoom` only: socket.id → last { roomId, userId } for disconnect cleanup (Ludo/Math/Trivia use their own Maps). */
  const legacyRoomSocketIndex = new Map();
  const ludoSeedMap = new Map();
  let ludoRoomRedis = null;
  let ludoRoomStates;
  if (
    String(process.env.LUDO_ROOM_STATE_BACKEND || '').toLowerCase() === 'redis' &&
    String(process.env.REDIS_URL || '').trim()
  ) {
    ludoRoomRedis = createClient({ url: process.env.REDIS_URL });
    ludoRoomRedis.on('error', (err) => console.warn('[ludo-room-redis]', err?.message || err));
    await ludoRoomRedis.connect();
    ludoRoomStates = new RoomStateStore(new RedisMirrorRoomStateAdapter(ludoSeedMap, ludoRoomRedis));
    console.log('[ludo-room] Redis mirror enabled for room state write-through');
  } else {
    ludoRoomStates = new RoomStateStore(new MemoryRoomStateAdapter(ludoSeedMap));
  }
  const stopLudoRoomGc = startLudoRoomGc(ludoRoomStates);
  const { store: ludoQueueStore, close: closeLudoQueueStore } = await createLudoQueueStore();
  let ludoInviteRedis = null;
  if (String(process.env.REDIS_URL || '').trim()) {
    try {
      ludoInviteRedis = createClient({ url: process.env.REDIS_URL });
      ludoInviteRedis.on('error', (err) => console.warn('[ludo-invite-redis]', err?.message || err));
      await ludoInviteRedis.connect();
      console.log('[ludo-invite] Redis invite store enabled');
    } catch (e) {
      console.warn('[ludo-invite] Redis invite store not enabled:', e?.message || e);
      ludoInviteRedis = null;
    }
  }
  const attachLudo = createLudoHandlers(io, ludoRoomStates, ludoQueueStore, ludoInviteRedis);
  const attachLobbyChat = createLobbyChatHandlers(io);
  void loadLudoSnapshotsInto(ludoRoomStates).catch((e) => {
    console.warn('[Ludo] Background Firestore restore failed:', e?.message || e);
  });
  const onLudoShutdown = () => {
    void closeLudoQueueStore?.();
    stopLudoRoomGc();
    void ludoRoomRedis?.quit?.();
    void ludoInviteRedis?.quit?.();
  };
  process.once('SIGINT', onLudoShutdown);
  process.once('SIGTERM', onLudoShutdown);

  function applyLegacyPlayerGone(roomId, userId, source) {
    if (!roomId || !userId) return;
    const st = roomStates.get(roomId);
    if (!st || !Array.isArray(st.players)) return;
    st.players = st.players.filter((p) => p !== userId);
    console.log('[DEBUG] Legacy room player gone:', { roomId, userId, source, remaining: st.players.length });
    if (st.players.length === 0) {
      roomStates.delete(roomId);
      void (async () => {
        try {
          const room = await dataService.getRoomById(roomId);
          if (room && room.status === 'waiting') {
            await dataService.updateRoomStatus(roomId, 'cancelled');
          }
        } catch (e) { /* ignore */ }
      })();
    } else {
      io.to(roomId).emit('playerLeft', {
        roomId,
        userId,
        players: st.players,
      });
    }
  }

  io.engine.on('connection_error', (err) => {
    console.error('[socket] handshake failed:', err?.message || err);
  });

  io.on('connection', (socket) => {
    console.log('[socket] connected:', socket.id, 'uid=', socket.user?.uid || '(none)');
    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnected:', socket.id, 'reason=', reason);
    });
    onPresenceSocketConnected(io, socket);
    socket.on('presence:ping', () => onPresencePing(io, socket));
    attachMathRush(socket);
    attachTriviaRealtime(socket);
    attachEnigmaPulse(socket);
    attachLudo(socket);
    attachLobbyChat(socket);

    /** Optional: validate Firestore `matches/{matchId}` before joining a friend-match socket room. */
    socket.on('friend_match_join', async ({ matchId }) => {
      const mid = String(matchId || '').trim();
      const uid = String(socket.user?.uid || '').trim();
      if (!mid || !uid) return;
      const dbAdm = getAdminFirestore();
      if (!dbAdm) {
        socket.emit('friend_match_join_error', { message: 'Firestore admin not configured on server.' });
        return;
      }
      try {
        const snap = await dbAdm.collection('matches').doc(mid).get();
        if (!snap.exists) {
          socket.emit('friend_match_join_error', { message: 'Match not found.' });
          return;
        }
        const ids = snap.data()?.playerIds;
        if (!Array.isArray(ids) || !ids.includes(uid)) {
          socket.emit('friend_match_join_error', { message: 'Not a participant in this match.' });
          return;
        }
        socket.join(`friend_match_${mid}`);
        socket.emit('friend_match_join_ok', { matchId: mid });
      } catch (e) {
        socket.emit('friend_match_join_error', { message: e?.message || 'friend_match_join failed' });
      }
    });

    socket.on('joinRoom', async ({ roomId, userId, questions }) => {
      const authedUid = String(socket.user?.uid || '');
      if (!roomId || !authedUid) return;
      if (userId && String(userId) !== authedUid) return;
      socket.join(roomId);
      legacyRoomSocketIndex.set(socket.id, { roomId, userId: authedUid });

      if (!roomStates.has(roomId)) {
        roomStates.set(roomId, {
          players: [authedUid],
          scores: {},
          currentTurn: authedUid,
          questions: questions || [],
          startTime: Date.now()
        });

        platformLog('Room created (legacy joinRoom)', { roomId, userId: authedUid });
        console.log('[DEBUG] Room created:', roomId, 'player:', authedUid.slice(0, 8));

        // Update room status in JSON

        try {
          await dataService.updateRoomStatus(roomId, 'waiting');
        } catch (e) {
          console.error('Failed to update room status:', e.message);
        }
      } else {
        const state = roomStates.get(roomId);
        if (!Array.isArray(state.players)) state.players = [];
        if (!state.players.includes(authedUid)) {
          state.players.push(authedUid);
          platformLog('Player joined (legacy joinRoom)', { roomId, userId: authedUid, total: state.players.length });
          console.log('[DEBUG] Player joined:', authedUid.slice(0, 8), 'room:', roomId, 'count:', state.players.length);

          if (state.players.length >= 2) {
            try {
              await dataService.updateRoomStatus(roomId, 'active');
            } catch (e) { }
          }

          io.to(roomId).emit('matchReady', {
            roomId,
            players: state.players,
            starterId: state.players[0],
            questions: state.questions
          });
        }
      }
    });

    socket.on('submitAnswer', ({ roomId, userId, correct, index }) => {
      const authedUid = String(socket.user?.uid || '');
      if (!roomId || !authedUid) return;
      if (userId && String(userId) !== authedUid) return;
      const st = roomStates.get(roomId);
      if (!st || !st.scores) return;
      if (!Array.isArray(st.players) || !st.players.includes(authedUid)) return;
      const pointsPerCorrect = 10;
      if (!st.scores[authedUid]) st.scores[authedUid] = 0;
      if (correct) st.scores[authedUid] += pointsPerCorrect;
      const score = st.scores[authedUid] ?? 0;
      io.to(roomId).emit('gameStateUpdate', {
        lastActionBy: authedUid,
        score,
        correct,
        index
      });
    });

    socket.on('leaveRoom', async ({ roomId, userId }) => {
      const authedUid = String(socket.user?.uid || '');
      if (userId && String(userId) !== authedUid) return;
      if (roomId) socket.leave(roomId);
      legacyRoomSocketIndex.delete(socket.id);
      if (!roomId) return;

      const st = roomStates.get(roomId);
      if (st && Array.isArray(st.players)) {
        if (!authedUid) {
          roomStates.delete(roomId);
          try {
            const room = await dataService.getRoomById(roomId);
            if (room && room.status === 'waiting') {
              await dataService.updateRoomStatus(roomId, 'cancelled');
            }
          } catch (e) { /* ignore */ }
          return;
        }
        st.players = st.players.filter((p) => p !== authedUid);
        platformLog('Player left (legacy leaveRoom)', {
          roomId,
          userId: authedUid,
          remaining: st.players.length,
        });
        if (st.players.length === 0) {
          roomStates.delete(roomId);
          try {
            const room = await dataService.getRoomById(roomId);
            if (room && room.status === 'waiting') {
              await dataService.updateRoomStatus(roomId, 'cancelled');
            }
          } catch (e) { /* ignore */ }
        } else {
          io.to(roomId).emit('playerLeft', {
            roomId,
            userId: authedUid,
            players: st.players,
          });
        }
      } else if (st) {
        roomStates.delete(roomId);
        try {
          const room = await dataService.getRoomById(roomId);
          if (room && room.status === 'waiting') {
            await dataService.updateRoomStatus(roomId, 'cancelled');
          }
        } catch (e) { /* ignore */ }
      } else {
        try {
          const room = await dataService.getRoomById(roomId);
          if (room && room.status === 'waiting') {
            await dataService.updateRoomStatus(roomId, 'cancelled');
          }
        } catch (e) { /* ignore */ }
      }
    });

    socket.on('quitGame', async ({ roomId, userId }) => {
      const authedUid = String(socket.user?.uid || '');
      if (userId && String(userId) !== authedUid) return;
      platformLog('Game quit (legacy quitGame)', { roomId, userId: authedUid });
      if (roomId) socket.leave(roomId);
      legacyRoomSocketIndex.delete(socket.id);
      console.log('[DEBUG] Legacy quitGame:', roomId, authedUid ? authedUid.slice(0, 8) : '');
      const st = roomStates.get(roomId);
      let player1Score = 0;
      let player2Score = 0;
      let winnerId = null;
      if (st && Array.isArray(st.players) && st.scores) {
        const p1 = st.players[0];
        const p2 = st.players[1];
        player1Score = st.scores[p1] ?? 0;
        player2Score = st.scores[p2] ?? 0;
        if (player1Score > player2Score) winnerId = 'p1';
        else if (player2Score > player1Score) winnerId = 'p2';
      }

      const scoresPayload = st?.scores
        ? { player1: player1Score, player2: player2Score, byUserId: { ...st.scores } }
        : { player1: player1Score, player2: player2Score };

      try {
        await dataService.updateRoomStatus(roomId, 'finished');
      } catch (e) { }

      io.to(roomId).emit('gameOver', {
        winnerId,
        quitBy: authedUid,
        scores: scoresPayload
      });
      roomStates.delete(roomId);
    });

    socket.on('disconnect', () => {
      onPresenceSocketDisconnected(io, socket);
      const meta = legacyRoomSocketIndex.get(socket.id);
      if (meta) {
        legacyRoomSocketIndex.delete(socket.id);
        applyLegacyPlayerGone(meta.roomId, meta.userId, 'disconnect');
      }
    });

  });

}

startServer().catch((err) => {
  console.error('[server] Fatal startup error (listen may never run):', err?.stack || err);
  process.exit(1);
});

























