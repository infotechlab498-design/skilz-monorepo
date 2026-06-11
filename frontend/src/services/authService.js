import {
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  confirmPasswordReset,
  linkWithCredential,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config.js';
import {
  DEFAULT_USER_STATS,
  DEFAULT_USER_STATS_EXTRA,
} from '../constants/userProfileDefaults.js';
import { setAuthToken } from '../utils/authToken.js';
import { store } from '../redux/store.js';
import {
  setUser,
  logout,
  setFirebaseReady,
  setFirebaseSession,
  setAuthNotice,
  setProfileSyncPending,
  setProfileSyncError,
} from '../redux/features/auth.jsx';
import { fetchFirestoreUserProfile, clearUser } from '../redux/features/userSlice.js';
import { startUserPresence, stopUserPresence } from './presenceService.js';
import { mapFirebaseAuthError } from './firebaseAuth.js';
import { toSerializableFirebase } from './userService.js';
import { authLog } from '../utils/authDiagnostics.js';

export { mapFirebaseAuthError };

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

const LINK_HINT_KEY = 'skilz_link_hint';
const OAUTH_INTENT_KEY = 'skilz_oauth_intent';
const OAUTH_NEXT_KEY = 'skilz_oauth_next';
const PROFILE_RETRY_MS = 5000;
const PROFILE_RETRY_MAX = 6;

/** Dedupe StrictMode / concurrent `getRedirectResult` consumption. */
let oauthRedirectPromise = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const profileRetryTimers = new Map();

/** @type {Map<string, number>} */
const profileRetryCounts = new Map();

function normalizeOAuthNextPath(nextPath) {
  const s = String(nextPath || '/').trim() || '/';
  return s.startsWith('/') ? s : `/${s}`;
}

function isFirebaseAuthError(err) {
  const code = err?.code || '';
  return typeof code === 'string' && code.startsWith('auth/');
}

function isFirestorePermissionError(err) {
  const code = err?.code || '';
  return code === 'permission-denied' || code === 'unauthenticated';
}

/**
 * Publish a user-visible auth notice (Redux + sessionStorage for legacy readers).
 * @param {string} message
 */
export function publishAuthNotice(message) {
  const msg = String(message || '').trim();
  if (!msg) return;
  store.dispatch(setAuthNotice(msg));
  try {
    sessionStorage.setItem('skilz_auth_notice', msg);
  } catch {
    /* ignore */
  }
}

function skilzProviderFromFirebaseUser(firebaseUser) {
  const pid = firebaseUser?.providerData?.[0]?.providerId;
  if (pid === 'google.com') return 'google';
  if (pid === 'facebook.com') return 'facebook';
  return 'email';
}

function firebaseUserToMinimal(firebaseUser) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || '',
    photoURL: firebaseUser.photoURL || '',
    provider: skilzProviderFromFirebaseUser(firebaseUser),
  };
}

/** Mirror Firebase session into Redux immediately (auth source of truth). */
function applyFirebaseSessionToRedux(firebaseUser) {
  const minimal = toSerializableFirebase(firebaseUserToMinimal(firebaseUser));
  store.dispatch(setFirebaseSession(minimal));
  authLog('info', 'Redux Auth Updated', { uidPrefix: firebaseUser.uid.slice(0, 8) });
}

function clearProfileRetry(uid) {
  const t = profileRetryTimers.get(uid);
  if (t) clearTimeout(t);
  profileRetryTimers.delete(uid);
  profileRetryCounts.delete(uid);
}

function scheduleProfileSyncRetry(firebaseUser) {
  const uid = firebaseUser?.uid;
  if (!uid || profileRetryTimers.has(uid)) return;

  const attempt = (profileRetryCounts.get(uid) || 0) + 1;
  if (attempt > PROFILE_RETRY_MAX) {
    authLog('warn', 'Firestore Profile Sync Retry Exhausted', { uidPrefix: uid.slice(0, 8) });
    store.dispatch(setProfileSyncError('Profile sync still pending. Try refreshing the page.'));
    return;
  }
  profileRetryCounts.set(uid, attempt);
  store.dispatch(setProfileSyncPending(true));

  const timer = setTimeout(() => {
    profileRetryTimers.delete(uid);
    authLog('info', 'Firestore Profile Sync Retry', {
      uidPrefix: uid.slice(0, 8),
      attempt,
    });
    void syncFirestoreProfile(firebaseUser, { isRetry: true }).then((r) => {
      if (r.profileOk) {
        clearProfileRetry(uid);
        store.dispatch(setProfileSyncPending(false));
        store.dispatch(setProfileSyncError(null));
        authLog('info', 'Firestore Profile Sync Retry Success', { uidPrefix: uid.slice(0, 8) });
      } else if (auth.currentUser?.uid === uid) {
        scheduleProfileSyncRetry(firebaseUser);
      }
    });
  }, PROFILE_RETRY_MS);

  profileRetryTimers.set(uid, timer);
}

/**
 * Consume Firebase OAuth redirect result (call once per load, before `subscribeFirebaseAuth`).
 * @returns {Promise<{ status: 'none' } | { status: 'ok', navigateTo: string, partial?: boolean }>}
 */
export async function processOAuthRedirectResult() {
  if (oauthRedirectPromise) return oauthRedirectPromise;

  oauthRedirectPromise = (async () => {
    let result;
    try {
      result = await getRedirectResult(auth);
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
      authLog('error', 'OAuth Redirect Result Failed', { code: err?.code || '' });
      publishAuthNotice(mapFirebaseAuthError(err));
      return { status: 'none' };
    }

    if (!result?.user) {
      return { status: 'none' };
    }

    authLog('info', 'Firebase Login Success', {
      uidPrefix: result.user.uid.slice(0, 8),
      provider: skilzProviderFromFirebaseUser(result.user),
    });

    let intent = null;
    try {
      intent = sessionStorage.getItem(OAUTH_INTENT_KEY);
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
    } catch {
      /* ignore */
    }

    let navigateTo = '/';
    try {
      const n = sessionStorage.getItem(OAUTH_NEXT_KEY);
      if (n) navigateTo = n;
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }

    try {
      if (intent === 'signup') {
        await ensureFirestoreUserProfile(result.user);
        authLog('info', 'Firestore Profile Create Success', {
          uidPrefix: result.user.uid.slice(0, 8),
          context: 'oauth_signup',
        });
      }
      await finalizeSignIn(result.user);
      return { status: 'ok', navigateTo };
    } catch (e) {
      if (e instanceof AuthLinkRequiredError) {
        publishAuthNotice(e.userMessage);
        await signOut(auth).catch(() => {});
        return { status: 'none' };
      }

      authLog('error', 'OAuth Finalize Partial Failure', {
        code: e?.code || '',
        message: e?.message || 'unknown',
      });

      applyFirebaseSessionToRedux(result.user);
      const profileResult = await syncFirestoreProfile(result.user);
      if (!profileResult.profileOk) {
        publishAuthNotice(
          'Signed in with Google/Facebook, but your game profile is still syncing. ' +
            'You can keep playing — we will retry in the background.'
        );
        scheduleProfileSyncRetry(result.user);
      } else {
        publishAuthNotice(mapFirebaseAuthError(e));
      }

      startUserPresence(result.user.uid);
      return { status: 'ok', navigateTo, partial: true };
    }
  })();

  return oauthRedirectPromise;
}

/** @deprecated Registration gate removed — profiles auto-create on login. */
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
        'This email is already registered with another sign-in method. Try signing in with email and password, or the Google or Facebook button you used when you first registered (same email). If you use email, you can use Forgot password to reset it.';
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

/** @type {Map<string, Promise<{ user: object, token: string | null, profileOk: boolean }>>} */
const syncInflight = new Map();

export function applySkilzLoginPayload(data) {
  if (!data?.user) {
    throw new Error('Could not complete sign-in');
  }
  if (data.token) setAuthToken(data.token);
  else setAuthToken(null);
  store.dispatch(setUser(toSerializableFirebase(data.user)));
  authLog('info', 'Redux Auth Updated', { source: 'legacy_jwt' });
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
 * Firestore profile for registration (sign-up / OAuth registration button).
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
    await setDoc(ref, {
      ...base,
      username: '',
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
      source: provider === 'email' ? 'email_password' : 'oauth',
      stats: {
        ...DEFAULT_USER_STATS,
        ...DEFAULT_USER_STATS_EXTRA,
      },
      games: cloneGamesDefaults(),
      createdAt: serverTimestamp(),
    });
    authLog('info', 'Firestore Profile Create Success', { uidPrefix: uid.slice(0, 8) });
  } else {
    authLog('info', 'Firestore Profile Read Success', { uidPrefix: uid.slice(0, 8) });
    await setDoc(ref, base, { merge: true });
    const missing = buildMissingProfilePatch(snap.data());
    if (Object.keys(missing).length > 0) {
      await setDoc(ref, { ...missing, updatedAt: serverTimestamp() }, { merge: true });
    }
  }
}

async function ensureFirestoreProfileExistsClient(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    authLog('info', 'Firestore Profile Read Success', {
      uidPrefix: firebaseUser.uid.slice(0, 8),
    });
    return;
  }
  await ensureFirestoreUserProfile(firebaseUser);
}

/**
 * Firestore wallet/profile sync — failures do NOT sign the user out.
 * @param {import('firebase/auth').User} firebaseUser
 * @param {{ isRetry?: boolean }} [options]
 */
async function syncFirestoreProfile(firebaseUser, options = {}) {
  const uid = firebaseUser.uid;
  try {
    await ensureFirestoreProfileExistsClient(firebaseUser);
    await store.dispatch(fetchFirestoreUserProfile(uid));
    store.dispatch(setProfileSyncError(null));
    store.dispatch(setProfileSyncPending(false));
    if (!options.isRetry) clearProfileRetry(uid);
    return { profileOk: true };
  } catch (e) {
    authLog('error', 'Firestore Profile Sync Failed', {
      uidPrefix: uid.slice(0, 8),
      code: e?.code || '',
      firestore: isFirestorePermissionError(e),
    });
    store.dispatch(
      setProfileSyncError(
        isFirestorePermissionError(e)
          ? 'Profile sync blocked by Firestore rules. Contact support if this persists.'
          : 'Profile sync failed. Retrying…'
      )
    );
    return { profileOk: false, error: e };
  }
}

/**
 * Sync Firebase user → Redux (immediate) → Firestore profile (best-effort, retried).
 * Never signs out Firebase on Firestore failure.
 * @param {import('firebase/auth').User} firebaseUser
 */
export async function syncSkilzFromFirebaseUser(firebaseUser) {
  const uid = firebaseUser.uid;
  const existing = syncInflight.get(uid);
  if (existing) return existing;

  const promise = (async () => {
    authLog('info', 'Firebase Login Success', { uidPrefix: uid.slice(0, 8) });
    applyFirebaseSessionToRedux(firebaseUser);

    const profileResult = await syncFirestoreProfile(firebaseUser);
    if (!profileResult.profileOk) {
      scheduleProfileSyncRetry(firebaseUser);
    }

    startUserPresence(uid);
    return {
      user: firebaseUserToMinimal(firebaseUser),
      token: null,
      profileOk: profileResult.profileOk,
    };
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
    authLog('info', 'Account Linking Success', { uidPrefix: firebaseUser.uid.slice(0, 8) });
  }
  return syncSkilzFromFirebaseUser(firebaseUser);
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
  authLog('warn', 'Account Linking Required', {
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
 * Complete password reset from email link (`oobCode` query param).
 * @param {string} oobCode
 * @param {string} newPassword
 */
export async function confirmPasswordResetWithCode(oobCode, newPassword) {
  const code = String(oobCode || '').trim();
  if (!code) throw new Error('Reset link is invalid or expired. Request a new reset email.');
  await confirmPasswordReset(auth, code, newPassword);
  authLog('info', 'Password Reset Success');
}

export async function signInWithEmail(email, password) {
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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogleRedirect(nextPath = '/') {
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, 'signin');
    sessionStorage.setItem(OAUTH_NEXT_KEY, normalizeOAuthNextPath(nextPath));
  } catch {
    /* ignore */
  }
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    try {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
    await handleAccountExistsDifferentProvider(err);
    throw err;
  }
}

/** Popup aliases map to redirect (COOP-safe). */
export const signInWithGooglePopup = signInWithGoogleRedirect;

export async function signUpWithGoogleRedirect(nextPath = '/') {
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, 'signup');
    sessionStorage.setItem(OAUTH_NEXT_KEY, normalizeOAuthNextPath(nextPath));
  } catch {
    /* ignore */
  }
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err) {
    try {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
    await handleAccountExistsDifferentProvider(err);
    throw err;
  }
}

export const signUpWithGooglePopup = signUpWithGoogleRedirect;

const facebookProvider = new FacebookAuthProvider();

export async function signInWithFacebookRedirect(nextPath = '/') {
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, 'signin');
    sessionStorage.setItem(OAUTH_NEXT_KEY, normalizeOAuthNextPath(nextPath));
  } catch {
    /* ignore */
  }
  try {
    await signInWithRedirect(auth, facebookProvider);
  } catch (err) {
    try {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
    await handleAccountExistsDifferentProvider(err);
    throw err;
  }
}

export const signInWithFacebookPopup = signInWithFacebookRedirect;

export async function signUpWithFacebookRedirect(nextPath = '/') {
  try {
    sessionStorage.setItem(OAUTH_INTENT_KEY, 'signup');
    sessionStorage.setItem(OAUTH_NEXT_KEY, normalizeOAuthNextPath(nextPath));
  } catch {
    /* ignore */
  }
  try {
    await signInWithRedirect(auth, facebookProvider);
  } catch (err) {
    try {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      sessionStorage.removeItem(OAUTH_NEXT_KEY);
    } catch {
      /* ignore */
    }
    await handleAccountExistsDifferentProvider(err);
    throw err;
  }
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
  oauthRedirectPromise = null;
  await signOut(auth).catch(() => {});
  authLog('info', 'Firebase Sign Out');
}

function clearSkilzClientWithoutFirebaseSignOut() {
  setAuthToken(null);
  store.dispatch(logout());
}

/**
 * Keep Redux aligned with Firebase session. Firestore failures never sign out Firebase.
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function subscribeFirebaseAuth() {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (!firebaseUser) {
        stopUserPresence();
        clearSkilzClientWithoutFirebaseSignOut();
        store.dispatch(clearUser());
        authLog('info', 'Firebase Sign Out');
        return;
      }

      await syncSkilzFromFirebaseUser(firebaseUser);
    } catch (e) {
      authLog('error', 'Auth Listener Sync Error', { code: e?.code || '' });

      if (firebaseUser) {
        applyFirebaseSessionToRedux(firebaseUser);
        const profileResult = await syncFirestoreProfile(firebaseUser);
        if (!profileResult.profileOk) {
          scheduleProfileSyncRetry(firebaseUser);
          publishAuthNotice(
            'You are signed in, but your profile is still syncing. We will retry automatically.'
          );
        } else if (isFirebaseAuthError(e)) {
          publishAuthNotice(mapFirebaseAuthError(e));
          await signOut(auth).catch(() => {});
          clearSkilzClientWithoutFirebaseSignOut();
          store.dispatch(clearUser());
        }
      }
    } finally {
      store.dispatch(setFirebaseReady(true));
    }
  });
}
