import {
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  confirmPasswordReset,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, ensureAuthPersistence } from '../firebase/config.js';
import {
  DEFAULT_USER_STATS,
  DEFAULT_USER_STATS_EXTRA,
} from '../constants/userProfileDefaults.js';
import { setAuthToken } from '../utils/authToken.js';
import { store } from '../redux/store.js';
import {
  setUser,
  setFirebaseIdentity,
  logout,
  setFirebaseReady,
  setAuthNotice,
  setProfileSyncState,
} from '../redux/features/auth.jsx';
import { fetchFirestoreUserProfile, clearUser } from '../redux/features/userSlice.js';
import { startUserPresence, stopUserPresence } from './presenceService.js';
import { mapFirebaseAuthError } from './firebaseAuth.js';
import { toSerializableFirebase } from './userService.js';
import { authLog } from '../utils/authDiagnostics.js';
import { suggestUsernameFromIdentity } from '../utils/profileCompletion.js';

export { mapFirebaseAuthError, confirmPasswordReset };

const AUTH_NOTICE_KEY = 'skilz_auth_notice';
const LINK_HINT_KEY = 'skilz_link_hint';
const OAUTH_INTENT_KEY = 'skilz_oauth_intent';
const OAUTH_NEXT_KEY = 'skilz_oauth_next';
/** Survives StrictMode remount until SPA navigates after OAuth redirect. */
export const OAUTH_PENDING_NAV_KEY = 'skilz_oauth_pending_nav';

/** Prevents StrictMode double-consumption of `getRedirectResult`. */
let oauthRedirectConsumed = false;
/** Replay navigation when first mount unmounted before `navigate()` (React StrictMode). */
let lastOAuthNavigateTo = null;
/** Single in-flight `getRedirectResult` — StrictMode mounts must share one call. */
let oauthRedirectInflight = null;
/** Cached result for remounts in the same page load. */
let oauthRedirectResultCache = null;
/** Ignore transient `null` auth callbacks while OAuth redirect is finishing. */
let oauthRedirectProcessingUntil = 0;
/** Refcounted global auth listener (StrictMode-safe). */
let authStateListenerCount = 0;
/** @type {import('firebase/auth').Unsubscribe | null} */
let authStateUnsubscribe = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const profileRetryTimers = new Map();
const PROFILE_RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];

/** Human-readable sign-in method names for UI. */
export function describeSignInMethods(methods) {
  if (!methods?.length) return ['an existing sign-in method'];
  return methods.map((m) => {
    if (m === 'password') return 'Email & password';
    if (m === 'google.com') return 'Google';
    if (m === 'facebook.com') return 'Facebook';
    return m;
  });
}

function normalizeOAuthNextPath(nextPath) {
  const s = String(nextPath || '/').trim() || '/';
  return s.startsWith('/') ? s : `/${s}`;
}

function persistPendingOAuthNav(path) {
  const target = normalizeOAuthNextPath(path);
  lastOAuthNavigateTo = target;
  try {
    sessionStorage.setItem(OAUTH_PENDING_NAV_KEY, target);
  } catch {
    /* ignore */
  }
  return target;
}

/** @returns {string | null} */
export function readPendingOAuthNavigation() {
  if (lastOAuthNavigateTo) return lastOAuthNavigateTo;
  try {
    const n = sessionStorage.getItem(OAUTH_PENDING_NAV_KEY);
    return n ? normalizeOAuthNextPath(n) : null;
  } catch {
    return null;
  }
}

export function clearPendingOAuthNavigation() {
  lastOAuthNavigateTo = null;
  try {
    sessionStorage.removeItem(OAUTH_PENDING_NAV_KEY);
  } catch {
    /* ignore */
  }
}

function stashOAuthRedirectIntent(intent, nextPath) {
  const target = persistPendingOAuthNav(nextPath);
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, intent);
    sessionStorage.setItem(OAUTH_NEXT_KEY, target);
  } catch {
    /* ignore */
  }
}

/**
 * Publish a global auth notice (Redux + sessionStorage fallback for hard reloads).
 * @param {string} message
 */
export function publishAuthNotice(message) {
  const msg = String(message || '').trim();
  if (!msg) return;
  store.dispatch(setAuthNotice(msg));
  try {
    sessionStorage.setItem(AUTH_NOTICE_KEY, msg);
  } catch {
    /* ignore */
  }
}

function clearPublishedAuthNotice() {
  try {
    sessionStorage.removeItem(AUTH_NOTICE_KEY);
  } catch {
    /* ignore */
  }
}

function isIrrecoverableAuthError(err) {
  return (
    err instanceof AuthLinkRequiredError ||
    err instanceof RegistrationRequiredError
  );
}

function isOAuthReturnLanding() {
  try {
    return !!(
      sessionStorage.getItem(OAUTH_PENDING_NAV_KEY) ||
      sessionStorage.getItem(OAUTH_NEXT_KEY) ||
      sessionStorage.getItem(OAUTH_INTENT_KEY)
    );
  } catch {
    return false;
  }
}

function beginOAuthRedirectProcessing() {
  oauthRedirectProcessingUntil = Date.now() + 15000;
}

function endOAuthRedirectProcessingSoon() {
  setTimeout(() => {
    if (Date.now() >= oauthRedirectProcessingUntil - 1000) {
      oauthRedirectProcessingUntil = 0;
    }
  }, 3000);
}

/** Wait for Firebase to hydrate `currentUser` after redirect (IndexedDB restore). */
async function waitForFirebaseUser(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (auth.currentUser?.uid) return auth.currentUser;
    try {
      if (auth.authStateReady) await auth.authStateReady;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return auth.currentUser;
}

function skilzProviderFromFirebaseUser(firebaseUser) {
  const pid = firebaseUser?.providerData?.[0]?.providerId;
  if (pid === 'google.com') return 'google';
  if (pid === 'facebook.com') return 'facebook';
  return 'email';
}

function minimalUserFromFirebase(firebaseUser) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || '',
    photoURL: firebaseUser.photoURL || '',
    provider: skilzProviderFromFirebaseUser(firebaseUser),
  };
}

/**
 * Merge Firebase identity with Firestore `users/{uid}` so navbar, games, and dashboard
 * share one "player session" (username, coins, photo) in Redux `auth.user`.
 * @param {ReturnType<typeof minimalUserFromFirebase>} identity
 * @param {Record<string, unknown> | null | undefined} profile
 */
function mergeIdentityWithFirestoreProfile(identity, profile) {
  const d = profile || {};
  return toSerializableFirebase({
    ...identity,
    uid: identity.uid || d.uid || d.id,
    email: d.email || identity.email || '',
    displayName:
      d.displayName || d.fullName || d.name || identity.displayName || 'Player',
    username: d.username || '',
    photoURL: d.photoURL || identity.photoURL || '',
    coins: d.coins,
    xp: d.xp,
    level: d.level,
    provider: identity.provider || d.provider || 'email',
  });
}

/** Push Firestore profile fields into `auth.user` after wallet/profile sync. */
export function syncAuthUserFromFirestoreProfile(uid) {
  if (auth.currentUser?.uid !== uid) return;
  const profile = store.getState().user?.profile;
  if (!profile) return;
  const identity = minimalUserFromFirebase(auth.currentUser);
  store.dispatch(setUser(mergeIdentityWithFirestoreProfile(identity, profile)));
}

function applyFirestoreProfileToAuthUser(uid) {
  syncAuthUserFromFirestoreProfile(uid);
}

/**
 * Immediately mirror Firebase identity into Redux (P0-2).
 * @param {import('firebase/auth').User} firebaseUser
 */
export function applyFirebaseIdentityToRedux(firebaseUser) {
  const minimal = toSerializableFirebase(minimalUserFromFirebase(firebaseUser));
  store.dispatch(setFirebaseIdentity(minimal));
  authLog('Redux Auth Updated', { uidPrefix: minimal.uid?.slice(0, 8) });
  return minimal;
}

function cloneGamesDefaults() {
  return {
    ludo: { matches: 0, wins: 0, xp: 0 },
    trivia: { matches: 0, wins: 0, accuracy: 0 },
    mathRush: { matches: 0, bestScore: 0, xp: 0 },
  };
}

function buildMissingProfilePatch(data) {
  const d = data || {};
  /** @type {Record<string, unknown>} */
  const patch = {};
  if (typeof d.displayName !== 'string' || !d.displayName.trim()) {
    patch.displayName = 'Player';
  }
  if (typeof d.email !== 'string') {
    patch.email = '';
  }
  if (typeof d.username !== 'string') {
    patch.username = '';
  }
  if (typeof d.photoURL !== 'string') {
    patch.photoURL = '';
  }
  if (typeof d.fullName !== 'string') {
    patch.fullName = patch.displayName || d.displayName || 'Player';
  }
  if (typeof d.name !== 'string') {
    patch.name = patch.displayName || d.displayName || 'Player';
  }
  if (!d.createdAt) {
    patch.createdAt = serverTimestamp();
  }
  return patch;
}

/**
 * Create or merge Firestore `users/{uid}` (P0-3 — OAuth users never blocked by missing doc).
 * @param {import('firebase/auth').User} firebaseUser
 */
export async function ensureFirestoreUserProfile(firebaseUser) {
  const uid = firebaseUser.uid;
  const email = firebaseUser.email || '';
  const displayName =
    firebaseUser.displayName || (email ? email.split('@')[0] : 'Player');
  const provider = skilzProviderFromFirebaseUser(firebaseUser);
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const base = {
    uid,
    email,
    displayName,
    fullName: displayName,
    name: displayName,
    provider,
    updatedAt: serverTimestamp(),
  };
  if (!snap.exists()) {
    const isOAuth = provider === 'google' || provider === 'facebook';
    await setDoc(ref, {
      ...base,
      username: isOAuth
        ? suggestUsernameFromIdentity({
            uid,
            email,
            displayName: firebaseUser.displayName || displayName,
          })
        : '',
      phone: '',
      phoneLocal: '',
      phoneE164: '',
      cnic: '',
      location: '',
      photoURL: firebaseUser.photoURL || '',
      coins: 200,
      earnedCoins: 200,
      xp: 0,
      level: 1,
      dailyStreak: 0,
      lastPlayedDate: '',
      profileComplete: false,
      source: provider === 'email' ? 'email_password' : 'oauth',
      stats: {
        ...DEFAULT_USER_STATS,
        ...DEFAULT_USER_STATS_EXTRA,
      },
      games: cloneGamesDefaults(),
      createdAt: serverTimestamp(),
    });
    authLog('Firestore Profile Create Success', { uidPrefix: uid.slice(0, 8) });
  } else {
    authLog('Firestore Profile Read Success', { uidPrefix: uid.slice(0, 8) });
    await setDoc(ref, base, { merge: true });
    const existing = snap.data() || {};
    const missing = buildMissingProfilePatch(existing);
    const isOAuth = provider === 'google' || provider === 'facebook';
    if (isOAuth && typeof existing.username === 'string' && !existing.username.trim()) {
      missing.username = suggestUsernameFromIdentity({
        uid,
        email,
        displayName: firebaseUser.displayName || displayName,
      });
    }
    if (isOAuth && existing.profileComplete === undefined) {
      missing.profileComplete = false;
    }
    if (Object.keys(missing).length > 0) {
      await setDoc(ref, { ...missing, updatedAt: serverTimestamp() }, { merge: true });
    }
  }
}

async function ensureFirestoreProfileExistsClient(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    authLog('Firestore Profile Read Success', { uidPrefix: firebaseUser.uid.slice(0, 8) });
    return;
  }
  await ensureFirestoreUserProfile(firebaseUser);
}

/**
 * Best-effort Firestore enrichment — never signs user out on failure (P0-1).
 * @param {string} uid
 * @param {import('firebase/auth').User} firebaseUser
 * @param {number} [retryAttempt]
 */
async function enrichProfileFromFirestore(uid, firebaseUser, retryAttempt = 0) {
  if (auth.currentUser?.uid !== uid) return;

  store.dispatch(setProfileSyncState({ pending: true, error: null }));

  try {
    await ensureFirestoreProfileExistsClient(firebaseUser);
    await store.dispatch(fetchFirestoreUserProfile(uid));
    applyFirestoreProfileToAuthUser(uid);
    startUserPresence(uid);
    store.dispatch(setProfileSyncState({ pending: false, error: null }));
    authLog('Firestore Profile Sync Complete', { uidPrefix: uid.slice(0, 8) });
  } catch (e) {
    const message = mapFirebaseAuthError(e);
    authLog('Firestore Profile Sync Failed', {
      uidPrefix: uid.slice(0, 8),
      code: String(e?.code || ''),
      attempt: retryAttempt,
    });
    store.dispatch(setProfileSyncState({ pending: false, error: message }));

    if (retryAttempt < PROFILE_RETRY_DELAYS_MS.length) {
      publishAuthNotice(
        'Signed in successfully. Your profile is still syncing — we will retry automatically.'
      );
      scheduleProfileSyncRetry(uid, firebaseUser, retryAttempt + 1);
    } else {
      publishAuthNotice(
        'Signed in, but profile sync is delayed. You can keep playing; refresh if coins or stats look wrong.'
      );
    }
  }
}

function scheduleProfileSyncRetry(uid, firebaseUser, attempt) {
  const existing = profileRetryTimers.get(uid);
  if (existing) clearTimeout(existing);

  const delay = PROFILE_RETRY_DELAYS_MS[Math.min(attempt, PROFILE_RETRY_DELAYS_MS.length - 1)];
  const timer = setTimeout(() => {
    profileRetryTimers.delete(uid);
    if (auth.currentUser?.uid !== uid) return;
    void enrichProfileFromFirestore(uid, firebaseUser, attempt);
  }, delay);
  profileRetryTimers.set(uid, timer);
}

function clearProfileRetry(uid) {
  const t = profileRetryTimers.get(uid);
  if (t) {
    clearTimeout(t);
    profileRetryTimers.delete(uid);
  }
}

/** @type {Map<string, Promise<{ user: object, token: string | null }>>} */
const syncInflight = new Map();

/**
 * Sync Firebase user → Redux immediately, Firestore enrichment in background.
 * @param {import('firebase/auth').User} firebaseUser
 */
export async function syncSkilzFromFirebaseUser(firebaseUser) {
  const uid = firebaseUser.uid;
  const existing = syncInflight.get(uid);
  if (existing) return existing;

  const promise = (async () => {
    authLog('Firebase Login Success', { uidPrefix: uid.slice(0, 8) });
    const minimal = applyFirebaseIdentityToRedux(firebaseUser);
    void enrichProfileFromFirestore(uid, firebaseUser, 0);
    return { user: minimal, token: null };
  })();

  syncInflight.set(uid, promise);
  try {
    return await promise;
  } finally {
    syncInflight.delete(uid);
  }
}

async function finalizeSignIn(firebaseUser) {
  if (!firebaseUser) throw new Error('Sign-in failed');
  if (pendingOAuthCredential) {
    if (
      !pendingLinkEmail ||
      !firebaseUser.email ||
      firebaseUser.email.toLowerCase() !== pendingLinkEmail.toLowerCase()
    ) {
      clearPendingProviderLink();
      throw new Error('Could not link accounts: email mismatch. Try the social sign-in again.');
    }
    await linkWithCredential(firebaseUser, pendingOAuthCredential);
    clearPendingProviderLink();
    authLog('Account Linking Success', { uidPrefix: firebaseUser.uid.slice(0, 8) });
  }
  return syncSkilzFromFirebaseUser(firebaseUser);
}

/**
 * Consume Firebase OAuth redirect result (call once per load, before `subscribeFirebaseAuth`).
 * StrictMode-safe: concurrent mounts share one `getRedirectResult` call.
 * @returns {Promise<{ status: 'none' } | { status: 'ok', navigateTo: string }>}
 */
export async function processOAuthRedirectResult() {
  if (oauthRedirectResultCache) return oauthRedirectResultCache;
  if (oauthRedirectInflight) return oauthRedirectInflight;

  if (isOAuthReturnLanding()) beginOAuthRedirectProcessing();

  oauthRedirectInflight = processOAuthRedirectResultImpl()
    .then((r) => {
      oauthRedirectResultCache = r;
      return r;
    })
    .finally(() => {
      oauthRedirectInflight = null;
      endOAuthRedirectProcessingSoon();
    });

  return oauthRedirectInflight;
}

/**
 * @returns {Promise<{ status: 'none' } | { status: 'ok', navigateTo: string }>}
 */
async function processOAuthRedirectResultImpl() {
  if (oauthRedirectConsumed) {
    const pending =
      readPendingOAuthNavigation() ||
      (auth.currentUser?.uid ? lastOAuthNavigateTo : null);
    if (pending && auth.currentUser?.uid) {
      authLog('OAuth Pending Navigation Replay', {});
      return { status: 'ok', navigateTo: pending };
    }
    if (isOAuthReturnLanding()) {
      const hydrated = await waitForFirebaseUser(6000);
      if (hydrated?.uid && pending) {
        authLog('OAuth Hydration Replay', {});
        await syncSkilzFromFirebaseUser(hydrated).catch(() => {});
        return { status: 'ok', navigateTo: pending };
      }
    }
    return { status: 'none' };
  }

  beginOAuthRedirectProcessing();

  let result;
  try {
    result = await getRedirectResult(auth);
    if (result?.user) {
      oauthRedirectConsumed = true;
      authLog('OAuth Redirect Result Received', { uidPrefix: result.user.uid.slice(0, 8) });
    }
  } catch (err) {
    try {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
    if (err?.code === 'auth/account-exists-with-different-credential') {
      let linkErr = null;
      try {
        await handleAccountExistsDifferentProvider(err);
      } catch (e) {
        linkErr = e;
      }
      publishAuthNotice(
        linkErr instanceof AuthLinkRequiredError
          ? linkErr.userMessage
          : mapFirebaseAuthError(err)
      );
      return { status: 'none' };
    }
    authLog('OAuth Redirect Error', { code: String(err?.code || '') });
    publishAuthNotice(mapFirebaseAuthError(err));
    return { status: 'none' };
  }

  if (!result?.user) {
    if (isOAuthReturnLanding()) {
      const hydrated = await waitForFirebaseUser(8000);
      if (hydrated?.uid) {
        oauthRedirectConsumed = true;
        authLog('OAuth Redirect Hydrated User', { uidPrefix: hydrated.uid.slice(0, 8) });
        result = { user: hydrated };
      }
    }
    if (!result?.user) {
      authLog('OAuth Redirect No Result', { pendingNav: !!readPendingOAuthNavigation() });
      return { status: 'none' };
    }
  }

  let intent = null;
  try {
    intent = sessionStorage.getItem(OAUTH_INTENT_KEY);
  } catch {
    /* ignore */
  }
  authLog('OAuth Redirect Intent', { intent: intent || 'unknown' });

  try {
    const navigateTo = await finalizeOAuthSession(result.user);
    authLog('OAuth Redirect Navigate', { hasPendingNav: !!navigateTo });
    return { status: 'ok', navigateTo };
  } catch (e) {
    if (e instanceof RegistrationRequiredError || e instanceof AuthLinkRequiredError) {
      return { status: 'none' };
    }
    throw e;
  }
}

/** Skilz profile missing in Firestore — user must complete Firebase sign-up first. */
export class RegistrationRequiredError extends Error {
  constructor(message = 'User not found. Please register first.') {
    super('REGISTRATION_REQUIRED');
    this.name = 'RegistrationRequiredError';
    this.userMessage = message;
  }
}

/** Thrown when OAuth sign-in hits an existing account; user should sign in with `methods` first. */
export class AuthLinkRequiredError extends Error {
  /** @param {{ email: string, methods: string[], attemptedProvider: string }} p */
  constructor({ email, methods, attemptedProvider }) {
    const labels = describeSignInMethods(methods);
    const tried =
      attemptedProvider === 'google.com'
        ? 'Google'
        : attemptedProvider === 'facebook.com'
          ? 'Facebook'
          : 'this provider';
    super('LINK_REQUIRED');
    this.name = 'AuthLinkRequiredError';
    this.email = email;
    this.methods = methods;
    this.attemptedProvider = attemptedProvider;
    if (!methods?.length) {
      this.userMessage =
        'This email is already registered with another sign-in method. Sign in with email and password, or the Google or Facebook button you used when you first registered (same email). If you use email, you can use Forgot password to reset it.';
    } else {
      this.userMessage = `This email is already registered using ${labels.join(' or ')}. Sign in with that method (${email}) so we can link ${tried}.`;
    }
  }
}

/** @type {import('firebase/auth').AuthCredential | null} */
let pendingOAuthCredential = null;
/** @type {string | null} */
let pendingLinkEmail = null;

export function hasPendingProviderLink() {
  return !!pendingOAuthCredential;
}

export function clearPendingProviderLink() {
  pendingOAuthCredential = null;
  pendingLinkEmail = null;
  try {
    sessionStorage.removeItem(LINK_HINT_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedLinkHint() {
  try {
    const raw = sessionStorage.getItem(LINK_HINT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.email) return null;
    return {
      email: p.email,
      methods: Array.isArray(p.methods) ? p.methods : [],
      attemptedProvider: p.attemptedProvider || '',
    };
  } catch {
    return null;
  }
}

export function applySkilzLoginPayload(data) {
  if (!data?.user) {
    throw new Error('Could not complete sign-in');
  }
  if (data.token) setAuthToken(data.token);
  else setAuthToken(null);
  store.dispatch(setUser(toSerializableFirebase(data.user)));
}

async function handleAccountExistsDifferentProvider(err) {
  if (err.code !== 'auth/account-exists-with-different-credential') return false;
  const email = err.customData?.email;
  const g = GoogleAuthProvider.credentialFromError(err);
  const f = FacebookAuthProvider.credentialFromError(err);
  const cred = g || f;
  const attemptedProvider = g ? 'google.com' : f ? 'facebook.com' : null;
  if (!cred || !email || !attemptedProvider) return false;
  pendingOAuthCredential = cred;
  pendingLinkEmail = email;
  let methods = [];
  try {
    methods = await fetchSignInMethodsForEmail(auth, email);
  } catch {
    methods = [];
  }
  authLog('Account Linking Required', {
    attemptedProvider,
    methodsCount: methods?.length ?? 0,
  });
  try {
    sessionStorage.setItem(
      LINK_HINT_KEY,
      JSON.stringify({ email, methods, attemptedProvider })
    );
  } catch {
    /* ignore */
  }
  throw new AuthLinkRequiredError({ email, methods, attemptedProvider });
}

export async function requestDevConsoleOtp(email) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error('Email is required');
  const res = await fetch('/api/auth/dev-console-otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Could not request dev OTP');
}

export async function verifyDevConsoleOtp(email, code) {
  const trimmed = email.trim();
  const codeStr = String(code || '').trim();
  if (!trimmed || !codeStr) throw new Error('Email and code are required');
  const res = await fetch('/api/auth/dev-console-otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmed, code: codeStr }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Invalid or expired code');
  applySkilzLoginPayload(data);
  await signOut(auth).catch(() => {});
  return { user: data.user, token: data.token };
}

export async function sendPasswordResetToEmail(email) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error('Email is required');
  const continueUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/set-new-password`
      : undefined;
  await sendPasswordResetEmail(
    auth,
    trimmed,
    continueUrl
      ? {
          url: continueUrl,
          handleCodeInApp: true,
        }
      : undefined
  );
}

/**
 * Complete password reset from Firebase email link (`oobCode` query param).
 * @param {string} oobCode
 * @param {string} newPassword
 */
export async function confirmPasswordResetWithCode(oobCode, newPassword) {
  const code = String(oobCode || '').trim();
  if (!code) throw new Error('Reset link is invalid or expired. Request a new reset email.');
  await confirmPasswordReset(auth, code, newPassword);
  authLog('Password Reset Success', {});
}

export async function signInWithEmail(email, password) {
  await ensureAuthPersistence();
  const trimmed = email.trim();
  if (
    pendingOAuthCredential &&
    pendingLinkEmail &&
    trimmed.toLowerCase() !== pendingLinkEmail.toLowerCase()
  ) {
    clearPendingProviderLink();
  }
  const { user } = await signInWithEmailAndPassword(auth, trimmed, password);
  return finalizeSignIn(user);
}

function clearStashedOAuthIntent() {
  try {
    sessionStorage.removeItem(OAUTH_INTENT_KEY);
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    clearPendingOAuthNavigation();
  } catch {
    /* ignore */
  }
}

/** Popup in dev avoids brittle redirect + IndexedDB races on localhost. */
function shouldUseOAuthPopup() {
  const flag = String(import.meta.env.VITE_OAUTH_USE_POPUP || '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return !!import.meta.env.DEV;
}

/**
 * Create Firestore profile + Redux session after OAuth (popup or redirect).
 * @param {import('firebase/auth').User} firebaseUser
 * @returns {Promise<string>} path to navigate to
 */
async function finalizeOAuthSession(firebaseUser) {
  let navigateTo = '/';
  try {
    const n =
      sessionStorage.getItem(OAUTH_NEXT_KEY) ||
      sessionStorage.getItem(OAUTH_PENDING_NAV_KEY);
    if (n) navigateTo = normalizeOAuthNextPath(n);
    sessionStorage.removeItem(OAUTH_NEXT_KEY);
    sessionStorage.removeItem(OAUTH_INTENT_KEY);
  } catch {
    /* ignore */
  }
  navigateTo = persistPendingOAuthNav(navigateTo);
  beginOAuthRedirectProcessing();
  oauthRedirectConsumed = true;

  try {
    await ensureFirestoreUserProfile(firebaseUser);
    await finalizeSignIn(firebaseUser);
    clearPublishedAuthNotice();
  } catch (e) {
    if (e instanceof RegistrationRequiredError || e instanceof AuthLinkRequiredError) {
      publishAuthNotice(e.userMessage);
      clearPendingOAuthNavigation();
      await signOut(auth).catch(() => {});
      throw e;
    }

    authLog('OAuth Finalize Partial Failure', { code: String(e?.code || '') });
    applyFirebaseIdentityToRedux(firebaseUser);
    publishAuthNotice(
      'Signed in with your provider. Profile sync will retry in the background.'
    );
    void enrichProfileFromFirestore(firebaseUser.uid, firebaseUser, 0);
  }

  authLog('OAuth Session Finalized', { hasPendingNav: !!navigateTo });
  return navigateTo;
}

/**
 * @typedef {{ status: 'redirect' } | { status: 'ok', navigateTo: string }} OAuthFlowResult
 */

/**
 * Google/Facebook OAuth — popup in dev, redirect in production.
 * @param {import('firebase/auth').AuthProvider} provider
 * @param {'signin' | 'signup'} intent
 * @param {string} nextPath
 * @returns {Promise<OAuthFlowResult>}
 */
async function runOAuthWithProvider(provider, intent, nextPath) {
  stashOAuthRedirectIntent(intent, nextPath);
  await ensureAuthPersistence();

  if (!shouldUseOAuthPopup()) {
    try {
      await signInWithRedirect(auth, provider);
      return { status: 'redirect' };
    } catch (err) {
      clearStashedOAuthIntent();
      await handleAccountExistsDifferentProvider(err);
      throw err;
    }
  }

  try {
    authLog('OAuth Popup Start', { intent });
    const result = await signInWithPopup(auth, provider);
    const navigateTo = await finalizeOAuthSession(result.user);
    clearPendingOAuthNavigation();
    return { status: 'ok', navigateTo };
  } catch (err) {
    if (
      err?.code === 'auth/popup-blocked' ||
      err?.code === 'auth/cancelled-popup-request'
    ) {
      authLog('OAuth Popup Fallback Redirect', { code: String(err?.code || '') });
      try {
        await signInWithRedirect(auth, provider);
        return { status: 'redirect' };
      } catch (redirectErr) {
        clearStashedOAuthIntent();
        await handleAccountExistsDifferentProvider(redirectErr);
        throw redirectErr;
      }
    }
    clearStashedOAuthIntent();
    await handleAccountExistsDifferentProvider(err);
    throw err;
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const facebookProvider = new FacebookAuthProvider();

/** @returns {Promise<OAuthFlowResult>} */
export async function signInWithGoogleRedirect(nextPath = '/') {
  return runOAuthWithProvider(googleProvider, 'signin', nextPath);
}

export const signInWithGooglePopup = signInWithGoogleRedirect;

/** @returns {Promise<OAuthFlowResult>} */
export async function signUpWithGoogleRedirect(nextPath = '/') {
  return runOAuthWithProvider(googleProvider, 'signup', nextPath);
}

export const signUpWithGooglePopup = signUpWithGoogleRedirect;

/** @returns {Promise<OAuthFlowResult>} */
export async function signInWithFacebookRedirect(nextPath = '/') {
  return runOAuthWithProvider(facebookProvider, 'signin', nextPath);
}

export const signInWithFacebookPopup = signInWithFacebookRedirect;

/** @returns {Promise<OAuthFlowResult>} */
export async function signUpWithFacebookRedirect(nextPath = '/') {
  return runOAuthWithProvider(facebookProvider, 'signup', nextPath);
}

export const signUpWithFacebookPopup = signUpWithFacebookRedirect;

export async function signOutAppSession() {
  const uid = auth.currentUser?.uid;
  if (uid) clearProfileRetry(uid);
  stopUserPresence();
  setAuthToken(null);
  store.dispatch(clearUser());
  store.dispatch(logout());
  clearPendingProviderLink();
  await signOut(auth).catch(() => {});
}

function clearSkilzClientWithoutFirebaseSignOut() {
  setAuthToken(null);
  store.dispatch(logout());
}

/**
 * Keep Redux aligned with Firebase session. Firebase identity is never revoked on Firestore errors.
 * Waits for `authStateReady` so a transient `null` during persistence restore does not clear Redux.
 * @returns {Promise<import('firebase/auth').Unsubscribe>}
 */
export async function subscribeFirebaseAuth() {
  try {
    if (auth.authStateReady) {
      await auth.authStateReady;
    }
  } catch {
    /* ignore */
  }

  authStateListenerCount += 1;

  if (!authStateUnsubscribe) {
    authStateUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          if (Date.now() < oauthRedirectProcessingUntil || oauthRedirectInflight) {
            authLog('Firebase Signed Out (deferred during OAuth)', {});
            return;
          }
          stopUserPresence();
          clearSkilzClientWithoutFirebaseSignOut();
          store.dispatch(clearUser());
          authLog('Firebase Signed Out', {});
          return;
        }

        try {
          await syncSkilzFromFirebaseUser(firebaseUser);
        } catch (e) {
          if (isIrrecoverableAuthError(e)) {
            publishAuthNotice(
              e instanceof AuthLinkRequiredError || e instanceof RegistrationRequiredError
                ? e.userMessage
                : mapFirebaseAuthError(e)
            );
            await signOut(auth).catch(() => {});
            clearSkilzClientWithoutFirebaseSignOut();
            store.dispatch(clearUser());
            return;
          }

          // P0-1: retain Firebase session
          authLog('Auth Sync Non-Fatal Error', { code: String(e?.code || '') });
          applyFirebaseIdentityToRedux(firebaseUser);
          publishAuthNotice(
            'Signed in. Profile sync will retry in the background.'
          );
          void enrichProfileFromFirestore(firebaseUser.uid, firebaseUser, 0);
        }
      } finally {
        store.dispatch(setFirebaseReady(true));
      }
    });
  }

  return () => {
    authStateListenerCount = Math.max(0, authStateListenerCount - 1);
    if (authStateListenerCount === 0 && authStateUnsubscribe) {
      authStateUnsubscribe();
      authStateUnsubscribe = null;
    }
  };
}
