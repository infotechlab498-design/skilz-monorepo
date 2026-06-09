import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config.js';
import { mapFirebaseAuthError } from '../services/firebaseAuth.js';

/**
 * Re-authenticates current email/password user and updates password.
 * @param {{ currentPassword: string, newPassword: string }} payload
 */
export async function changeCurrentUserPassword(payload) {
  const user = auth.currentUser;
  if (!user?.uid) {
    return { ok: false, code: 'auth/not-authenticated', message: 'You need to sign in first.' };
  }

  const hasPasswordProvider = user.providerData?.some((p) => p.providerId === 'password') ?? false;
  if (!hasPasswordProvider) {
    return {
      ok: false,
      code: 'auth/no-password-provider',
      message:
        'Password sign-in is not set up for this account. Use your original sign-in method (e.g. Google), or link an email/password in account settings.',
    };
  }

  if (!user.email) {
    return {
      ok: false,
      code: 'auth/no-email-for-password',
      message: 'An email address is required to verify your current password. Add an email to your account and try again.',
    };
  }

  const currentPassword = String(payload?.currentPassword || '');
  const newPassword = String(payload?.newPassword || '');

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: err?.code || 'auth/unknown',
      message: mapFirebaseAuthError(err, { context: 'changePassword' }),
    };
  }
}

/**
 * Marks password update metadata for the signed-in user's profile.
 * @param {string} uid
 */
export async function markPasswordUpdated(uid) {
  const u = String(uid || '');
  if (!u) throw new Error('Missing uid');
  await setDoc(
    doc(db, 'users', u),
    {
      updatedAt: serverTimestamp(),
      passwordUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

