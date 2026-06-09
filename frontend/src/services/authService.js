import {
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
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
import { setUser, logout, setFirebaseReady } from '../redux/features/auth.jsx';
import { fetchFirestoreUserProfile, clearUser } from '../redux/features/userSlice.js';
import { startUserPresence, stopUserPresence } from './presenceService.js';
import { mapFirebaseAuthError } from './firebaseAuth.js';
import { toSerializableFirebase } from './userService.js';

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
/** 'signin' | 'signup' — read after OAuth redirect in {@link processOAuthRedirectResult}. */
const OAUTH_INTENT_KEY = 'skilz_oauth_intent';
/** Post-login path (e.g. `/` or `/signin` state) stored before `signInWithRedirect`. */
const OAUTH_NEXT_KEY = 'skilz_oauth_next';

function normalizeOAuthNextPath(nextPath) {
  const s = String(nextPath || '/').trim() || '/';
  return s.startsWith('/') ? s : `/${s}`;
}

/**
 * Consume Firebase OAuth redirect result (call once per load, before `subscribeFirebaseAuth`).
 * @returns {Promise<{ status: 'none' } | { status: 'ok', navigateTo: string }>}
 */
export async function processOAuthRedirectResult() {
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
      try {
        if (linkErr instanceof AuthLinkRequiredError) {
          sessionStorage.setItem('skilz_auth_notice', linkErr.userMessage);
        } else {
          sessionStorage.setItem('skilz_auth_notice', mapFirebaseAuthError(err));
        }
      } catch {
        /* ignore */
      }
      return { status: 'none' };
    }
    if (import.meta.env.DEV) {
      console.warn('[auth] getRedirectResult:', err?.code || err);
    }
    try {
      sessionStorage.setItem('skilz_auth_notice', mapFirebaseAuthError(err));
    } catch {
      /* ignore */
    }
    return { status: 'none' };
  }

  if (!result?.user) {
    return { status: 'none' };
  }

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
    }
    await finalizeSignIn(result.user);
  } catch (e) {
    if (e instanceof RegistrationRequiredError || e instanceof AuthLinkRequiredError) {
      try {
        sessionStorage.setItem('skilz_auth_notice', e.userMessage);
      } catch {
        /* ignore */
      }
      await signOut(auth).catch(() => {});
      return { status: 'none' };
    }
    console.error('[auth] OAuth redirect finalize failed:', e);
    try {
      sessionStorage.setItem('skilz_auth_notice', mapFirebaseAuthError(e));
    } catch {
      /* ignore */
    }
    await signOut(auth).catch(() => {});
    return { status: 'none' };
  }

  return { status: 'ok', navigateTo };
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

/** Restore link-hint banner after refresh (no credential; user must repeat OAuth). */
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

/** @type {Map<string, Promise<{ user: object, token: string }>>} */
const syncInflight = new Map();

/**
 * Apply Redux from an API login payload (dev/legacy only).
 * Note: No `localStorage` persistence (Firebase Auth persistence handles sessions).
 * @param {{ user: object, token?: string | null }} data
 */
export function applySkilzLoginPayload(data) {
  if (!data?.user) {
    throw new Error('Could not complete sign-in');
  }
  if (data.token) setAuthToken(data.token);
  else setAuthToken(null);
  // Guard against accidental non-serializable payloads from mixed legacy/Firebase paths.
  store.dispatch(setUser(toSerializableFirebase(data.user)));
}

function skilzProviderFromFirebaseUser(firebaseUser) {
  const pid = firebaseUser?.providerData?.[0]?.providerId;
  if (pid === 'google.com') return 'google';
  if (pid === 'facebook.com') return 'facebook';
  return 'email';
}

function cloneGamesDefaults() {
  return {
    ludo: { matches: 0, wins: 0, xp: 0 },
    trivia: { matches: 0, wins: 0, accuracy: 0 },
    mathRush: { matches: 0, bestScore: 0, xp: 0 },
  };
}

/**
 * Merge only safe profile metadata (never wallet/stats/game economy fields).
 * @param {import('firebase/firestore').DocumentData | undefined} data
 */
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
 * Firestore profile for **registration only** (sign-up / OAuth registration button).
 * Login sync does not call this — missing doc → {@link RegistrationRequiredError}.
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
  } else {
    await setDoc(ref, base, { merge: true });
    const missing = buildMissingProfilePatch(snap.data());
    if (Object.keys(missing).length > 0) {
      await setDoc(
        ref,
        { ...missing, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  }
}

async function ensureFirestoreProfileExistsClient(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    // Create missing profile after auth is ready. This is a create path only.
    await ensureFirestoreUserProfile(firebaseUser);
  } catch (e) {
    throw e;
  }
}

/**
 * Requires existing `users/{uid}` in Firestore + `users.json` mirror via bootstrap.
 * Does **not** create the Firestore profile (sign-up must do that first).
 * @param {import('firebase/auth').User} firebaseUser
 */
export async function syncSkilzFromFirebaseUser(firebaseUser) {
  const uid = firebaseUser.uid;
  const existing = syncInflight.get(uid);
  if (existing) return existing;

  const promise = (async () => {
    await ensureFirestoreProfileExistsClient(firebaseUser);
    const minimal = {
      uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || '',
      photoURL: firebaseUser.photoURL || '',
      provider: skilzProviderFromFirebaseUser(firebaseUser),
    };
    // Keep Redux payload strictly serializable if this shape grows later.
    store.dispatch(setUser(toSerializableFirebase(minimal)));
    await store.dispatch(fetchFirestoreUserProfile(uid));
    startUserPresence(uid);
    return { user: minimal, token: null };
  })();

  syncInflight.set(uid, promise);
  try {
    return await promise;
  } finally {
    syncInflight.delete(uid);
  }
}

/**
 * Links pending OAuth credential after user proved ownership via another provider.
 * @param {import('firebase/auth').User} firebaseUser
 */
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
  if (import.meta.env.DEV) {
    console.info('[auth] account-exists — link required', {
      email,
      attemptedProvider,
      methodsCount: methods?.length ?? 0,
    });
  }
  try {
    sessionStorage.setItem(
      LINK_HINT_KEY,
      JSON.stringify({ email, methods, attemptedProvider })
    );
  } catch {
    /* ignore */
  }
  throw new AuthLinkRequiredError({
    email,
    methods,
    attemptedProvider,
  });
}

/**
 * Dev only (server flag ENABLE_DEV_CONSOLE_OTP=1): request OTP printed in server terminal.
 * @param {string} email
 */
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

/**
 * Dev only: verify console OTP and apply Skilz session (signs out Firebase to avoid mismatched accounts).
 * @param {string} email
 * @param {string} code
 */
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

/**
 * Firebase password reset (uses templates from Firebase Console → Authentication → Templates).
 * @param {string} email
 */
export async function sendPasswordResetToEmail(email) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error('Email is required');
  const continueUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/signin` : undefined;
  await sendPasswordResetEmail(
    auth,
    trimmed,
    continueUrl
      ? {
          url: continueUrl,
          handleCodeInApp: false,
        }
      : undefined
  );
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function signInWithEmail(email, password) {
  const trimmed = email.trim();
  if (
    pendingOAuthCredential &&
    pendingLinkEmail &&
    trimmed.toLowerCase() !== pendingLinkEmail.toLowerCase()
  ) {
    clearPendingProviderLink();
  }
  // Do not pre-block login based on `fetchSignInMethodsForEmail`.
  // Firebase Email Enumeration Protection may return empty methods even for valid users.
  const { user } = await signInWithEmailAndPassword(auth, trimmed, password);
  return finalizeSignIn(user);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Google sign-in via full-page redirect (avoids COOP / `window.closed` issues from popups).
 * Resolves only if redirect fails before navigation; on success the page resumes after IdP.
 * @param {string} [nextPath] — router path after successful OAuth (default `'/'`).
 */
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

/** @deprecated Use {@link signInWithGoogleRedirect} — kept for imports; same behavior. */
export const signInWithGooglePopup = signInWithGoogleRedirect;

/** Sign-up: OAuth redirect, then `ensureFirestoreUserProfile` runs on return when intent is `signup`. */
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

/** @deprecated Use {@link signUpWithGoogleRedirect}. */
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

/** @deprecated Use {@link signInWithFacebookRedirect}. */
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

/** @deprecated Use {@link signUpWithFacebookRedirect}. */
export const signUpWithFacebookPopup = signUpWithFacebookRedirect;

/** Sign out Firebase + clear Skilz JWT + Redux. Clear JWT before Firebase so the auth listener does not treat the session as “JWT-only” and skip cleanup. */
export async function signOutAppSession() {
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
 * Keep Redux / JWT aligned with Firebase session (refresh, restore, sign-out).
 * @returns {import('firebase/auth').Unsubscribe}
 */
export function subscribeFirebaseAuth() {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (!firebaseUser) {
        stopUserPresence();
        clearSkilzClientWithoutFirebaseSignOut();
        store.dispatch(clearUser());
        return;
      }
      await syncSkilzFromFirebaseUser(firebaseUser);
    } catch (e) {
      console.error('[auth] Firebase session sync failed:', e);
      if (e instanceof RegistrationRequiredError) {
        try {
          sessionStorage.setItem('skilz_auth_notice', e.userMessage);
        } catch {
          /* ignore */
        }
      }
      await signOut(auth).catch(() => {});
      clearSkilzClientWithoutFirebaseSignOut();
      store.dispatch(clearUser());
    } finally {
      store.dispatch(setFirebaseReady(true));
    }
  });
}
