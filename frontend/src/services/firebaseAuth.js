import { createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config.js';
import { RECAPTCHA_VISIBLE_FALLBACK_ID } from '../constants/phoneAuth.js';
import { sendPhoneLinkSms } from './phoneAuthService.js';

export { sendPhoneLinkSms, disposeRecaptchaVerifier } from './phoneAuthService.js';

/**
 * Maps Firebase Auth errors to user-facing messages.
 * @param {unknown} err
 * @param {{ context?: 'changePassword' }} [options] - When `changePassword`, reauth/updatePassword copy is clearer.
 * @returns {string}
 */
export function mapFirebaseAuthError(err, options) {
    if (err?.name === 'AuthLinkRequiredError' && err.userMessage) {
        return err.userMessage;
    }
    const code = err?.code || '';
    const ctx = options?.context;

    if (ctx === 'changePassword') {
        if (code === 'auth/requires-recent-login') {
            return 'For security, sign out and sign in again, then change your password.';
        }
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
            return 'Current password is incorrect.';
        }
        if (code === 'auth/user-not-found') {
            return 'Could not verify your account. Sign in again and retry.';
        }
    }
    if (code === 'auth/email-already-in-use') {
        return 'That email is already registered. Try signing in.';
    }
    if (code === 'auth/invalid-email') {
        return 'Please enter a valid email address.';
    }
    if (code === 'auth/weak-password') {
        return 'Password is too weak. Use a stronger password (Firebase may require more than 8 characters).';
    }
    if (code === 'auth/network-request-failed') {
        return 'Network error. Check your connection and try again.';
    }
    if (code === 'auth/operation-not-allowed') {
        return 'This sign-in method is disabled in Firebase Console (Authentication → Sign-in method).';
    }
    if (code === 'auth/invalid-verification-code') {
        return 'Invalid code. Check the SMS and try again.';
    }
    if (code === 'auth/invalid-verification-id' || code === 'auth/session-expired') {
        return 'Code expired or session expired. Tap Resend for a new code.';
    }
    if (code === 'auth/code-expired') {
        return 'This code has expired. Tap Resend for a new SMS.';
    }
    if (code === 'auth/too-many-requests') {
        return 'Too many attempts. Wait a few minutes and try again.';
    }
    if (code === 'auth/captcha-check-failed') {
        return 'Verification check failed. Try again.';
    }
    if (code === 'auth/invalid-phone-number') {
        return 'Invalid phone number. Use 03XXXXXXXXX (sent to Firebase as +923…).';
    }
    if (code === 'auth/provider-already-linked') {
        return 'This phone is already linked to another account.';
    }
    if (code === 'auth/credential-already-in-use') {
        return 'This phone number is already used by another account.';
    }
    if (code === 'auth/missing-phone-number') {
        return 'Phone number is required.';
    }
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        return 'Invalid email or password.';
    }
    if (code === 'auth/user-disabled') {
        return 'This account has been disabled.';
    }
    if (code === 'auth/popup-closed-by-user') {
        return 'Sign-in was cancelled.';
    }
    if (code === 'auth/popup-blocked') {
        return 'Pop-up was blocked. Allow pop-ups for this site and try again.';
    }
    if (code === 'auth/account-exists-with-different-credential') {
        return 'An account already exists with this email using a different sign-in method. Sign in with that method first.';
    }
    if (code === 'auth/invalid-api-key') {
        return 'Firebase configuration error (invalid API key).';
    }
    if (code === 'auth/invalid-app-credential' || code === 'auth/missing-app-credential') {
        return 'Phone verification failed (reCAPTCHA or app check). Refresh the page and try again.';
    }
    if (code === 'auth/quota-exceeded') {
        return 'SMS quota exceeded for this project. Try again later or contact support.';
    }
    if (code === 'auth/web-storage-unsupported') {
        return 'This browser blocks storage needed for sign-in. Enable cookies/local storage or try another browser.';
    }
    if (code === 'auth/unauthorized-domain') {
        return 'This domain is not authorized for OAuth/phone auth. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    }
    if (err instanceof Error) return err.message;
    return 'Something went wrong. Please try again.';
}

/**
 * Creates Firebase email/password user only (stays signed in for phone link).
 * @param {{ email: string, password: string }} fields
 */
export async function firebaseEmailSignUpCreateUserOnly({ email, password }) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return { user: cred.user };
}

/**
 * Sends SMS for linking phone to the current user (delegates to `sendPhoneLinkSms`).
 *
 * @param {import('firebase/auth').User} user
 * @param {string} e164
 * @param {string} containerId - DOM element id for invisible reCAPTCHA (e.g. `recaptcha-container`)
 * @param {import('firebase/auth').RecaptchaVerifier | null | undefined} previousVerifier
 * @param {string | null | undefined} [visibleFallbackContainerId] - optional visible widget container (default from `phoneAuth` constants)
 * @returns {Promise<{ confirmationResult: import('firebase/auth').ConfirmationResult, recaptchaVerifier: import('firebase/auth').RecaptchaVerifier }>}
 */
export async function startPhoneLink(
    user,
    e164,
    containerId,
    previousVerifier,
    visibleFallbackContainerId = RECAPTCHA_VISIBLE_FALLBACK_ID
) {
    return sendPhoneLinkSms(auth, user, e164, containerId, previousVerifier, visibleFallbackContainerId);
}

/**
 * After SMS code confirmed: Firestore profile, wallet via register-firebase, sign out.
 * Rolls back on API failure.
 *
 * @param {{ email: string, password: string, username: string, phone: string, cnic: string }} fields
 * @returns {Promise<{ userRow: object, token: string }>}
 */
export async function firebaseCompleteSignUpAfterPhone({ email, password, username, phone, cnic }) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('Not signed in');
    }

    const userRef = doc(db, 'users', user.uid);

    try {
        await setDoc(userRef, {
            uid: user.uid,
            email,
            fullName: username,
            name: username,
            displayName: username,
            username,
            phone: phone || '',
            phoneLocal: phone || '',
            phoneE164: '',
            cnic: cnic || '',
            location: '',
            photoURL: '',
            dob: '',
            coins: 200,
            xp: 0,
            source: 'email_signup',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (e) {
        await deleteUser(user).catch(() => {});
        throw e;
    }

    try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/register-firebase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: user.uid,
                email,
                username,
                phone: phone || '',
                cnic: cnic || '',
                password,
                idToken,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.message || 'Wallet registration failed');
        }
        // Legacy: Skilz JWT + explicit sign-out. Firebase-native: stay signed in so session restores after reload.
        if (data.token) {
            await signOut(auth);
        }
        return { userRow: data.user, token: data.token };
    } catch (e) {
        await deleteDoc(userRef).catch(() => {});
        await deleteUser(user).catch(() => {});
        throw e;
    }
}
