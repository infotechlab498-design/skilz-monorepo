import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

/**
 * Skilz web app Firebase config.
 * Override any field with VITE_FIREBASE_* in `.env` (see `.env.example`).
 */
const firebaseConfig = {
    apiKey:'AIzaSyBge9ubUBb-1CwIFG45ThIrMqR2hy73xOg',
    authDomain:'skilz-63d0a.firebaseapp.com',
    projectId:'skilz-63d0a',
    storageBucket:'skilz-63d0a.firebasestorage.app',
    messagingSenderId:'55046483404',
    appId:'1:55046483404:web:b282a55364f8c58407c169',
};

/** Default RTDB instance URL (Firebase Console → Realtime Database). Override with VITE_FIREBASE_DATABASE_URL in `.env`. */
const databaseURL = (
  import.meta.env.VITE_FIREBASE_DATABASE_URL?.trim() ||
  'https://skilz-63d0a-default-rtdb.firebaseio.com'
).replace(/\/+$/, '');
if (databaseURL) {
    firebaseConfig.databaseURL = databaseURL;
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
/** Keep session across refresh / new tabs (default, set explicitly for clarity). */
setPersistence(auth, browserLocalPersistence).catch(() => {});

/**
 * DEV ONLY: skip real SMS when using Firebase "Phone" test numbers (Console → Authentication → Phone).
 * Never enable in production builds.
 */
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_DISABLE_APP_VERIFICATION === 'true') {
    auth.settings.appVerificationDisabledForTesting = true;
}
export const db = getFirestore(app);
/** Alias used by `usePlayers`, `matchmaking`, etc. */
export const firestore = db;
/** Realtime Database — explicit URL avoids implicit-instance warnings. */
export const rtdb = databaseURL ? getDatabase(app, databaseURL) : null;

export default app;
