// /**
//  * Backend entry: fatal handlers + dotenv BEFORE `./server.js` is loaded.
//  * In ESM, static imports in `server.js` run before that file’s other statements, so
//  * `dotenv.config()` placed inside `server.js` ran too late — modules like `middleware/auth.js`
//  * already captured `process.env.JWT_SECRET` at load time.
//  */
// import dotenv from 'dotenv';
// import path from 'path';
// import { fileURLToPath } from 'url';

// process.on('uncaughtException', (err) => {
//   console.error('[server] uncaughtException:', err?.stack || err);
//   process.exit(1);
// });

// process.on('unhandledRejection', (reason) => {
//   console.error('[server] unhandledRejection:', reason?.stack || reason);
// });

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// const BACKEND_ROOT = path.join(__dirname, '..');
// const rootLoaded = dotenv.config({ path: path.join(BACKEND_ROOT, '..', '.env') });
// const backendLoaded = dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });
// if (rootLoaded.error && backendLoaded.error) {
//   console.warn(
//     '[server] No .env found at repo root or backend/.env (optional). Using process env only.'
//   );
// }

// try {
//   await import('./server.js');
// } catch (err) {
//   console.error('[server] Failed to load server module:', err?.stack || err);
//   process.exit(1);
// }


/**
 * Backend Bootstrap Debug Version
 * Remove sensitive logs before production.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

console.log('\n========================================');
console.log('BACKEND STARTUP DEBUG');
console.log('========================================\n');

process.on('uncaughtException', (err) => {
  console.error('\n[uncaughtException]');
  console.error(err?.stack || err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n[unhandledRejection]');
  console.error(reason?.stack || reason);
});

try {
  console.log('[DEBUG] Node Version:', process.version);
  console.log('[DEBUG] Platform:', process.platform);
  console.log('[DEBUG] Working Directory:', process.cwd());

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  console.log('[DEBUG] __dirname:', __dirname);

  const BACKEND_ROOT = path.join(__dirname, '..');

  console.log('[DEBUG] BACKEND_ROOT:', BACKEND_ROOT);

  const ROOT_ENV_PATH = path.join(BACKEND_ROOT, '..', '.env');
  const BACKEND_ENV_PATH = path.join(BACKEND_ROOT, '.env');

  console.log('\n[DEBUG] ENV PATHS');
  console.log('ROOT_ENV_PATH:', ROOT_ENV_PATH);
  console.log('BACKEND_ENV_PATH:', BACKEND_ENV_PATH);

  console.log('\n[DEBUG] FILE EXISTENCE');
  console.log('Root .env exists:', fs.existsSync(ROOT_ENV_PATH));
  console.log('Backend .env exists:', fs.existsSync(BACKEND_ENV_PATH));

  const rootLoaded = dotenv.config({
    path: ROOT_ENV_PATH
  });

  if (rootLoaded.error) {
    console.warn('\n[DEBUG] Root .env load failed');
    console.warn(rootLoaded.error.message);
  } else {
    console.log('\n[DEBUG] Root .env loaded successfully');
  }

  const backendLoaded = dotenv.config({
    path: BACKEND_ENV_PATH
  });

  if (backendLoaded.error) {
    console.warn('\n[DEBUG] Backend .env load failed');
    console.warn(backendLoaded.error.message);
  } else {
    console.log('\n[DEBUG] Backend .env loaded successfully');
  }

  console.log('\n[DEBUG] ENV VARIABLES');

  const envCheck = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    JWT_SECRET_EXISTS: !!process.env.JWT_SECRET,
    JWT_SECRET_LENGTH: process.env.JWT_SECRET?.length || 0,
    FIREBASE_PROJECT_ID_EXISTS: !!process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL_EXISTS: !!process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY_EXISTS: !!process.env.FIREBASE_PRIVATE_KEY,
    MONGODB_URI_EXISTS: !!process.env.MONGODB_URI,
    DATABASE_URL_EXISTS: !!process.env.DATABASE_URL
  };

  console.table(envCheck);

  if (!process.env.JWT_SECRET) {
    console.error('\n[WARNING] JWT_SECRET NOT FOUND');
  }

  const serverPath = path.resolve(__dirname, './server.js');

  console.log('\n[DEBUG] SERVER FILE');
  console.log('Resolved Path:', serverPath);
  console.log('Exists:', fs.existsSync(serverPath));

  console.log('\n[DEBUG] IMPORTING SERVER MODULE...\n');

  await import('./server.js');

  console.log('\n[SUCCESS] server.js imported successfully');
} catch (err) {
  console.error('\n========================================');
  console.error('SERVER STARTUP FAILED');
  console.error('========================================\n');

  console.error(err?.stack || err);

  if (err?.code) {
    console.error('\nError Code:', err.code);
  }

  if (err?.message) {
    console.error('\nError Message:', err.message);
  }

  process.exit(1);
}