import { useSelector } from 'react-redux';
import { auth } from '../firebase/config.js';

/**
 * Auth hook — Firebase `currentUser` is the identity source of truth;
 * Redux mirrors it for React rendering and route guards.
 */
export function useAuth() {
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
  const user = useSelector((s) => s.auth.user);
  const firebaseUid = useSelector((s) => s.auth.firebaseUid);
  const authNotice = useSelector((s) => s.auth.authNotice);
  const profileSyncPending = useSelector((s) => s.auth.profileSyncPending);
  const profileSyncError = useSelector((s) => s.auth.profileSyncError);

  return {
    firebaseReady,
    isAuthenticated,
    user,
    firebaseUid,
    /** Live Firebase user (may differ briefly from Redux during hydration). */
    currentUser: auth.currentUser,
    authNotice,
    profileSyncPending,
    profileSyncError,
  };
}
