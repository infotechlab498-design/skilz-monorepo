import { useSelector } from 'react-redux';
import { auth } from '../firebase/config.js';

/**
 * Auth state for UI and route guards.
 * `isAuthenticated` mirrors Firebase (`firebaseUid` / auth.currentUser), not Firestore sync alone.
 */
export function useAuth() {
  const {
    user,
    firebaseUid,
    isAuthenticated,
    firebaseReady,
    authNotice,
    profileSyncPending,
    profileSyncError,
    loading,
    error,
  } = useSelector((s) => s.auth);

  return {
    user,
    firebaseUid,
    /** True when Firebase session exists (Redux mirror of auth.currentUser). */
    isAuthenticated,
    firebaseReady,
    authNotice,
    profileSyncPending,
    profileSyncError,
    loading,
    error,
    /** Live Firebase user (may differ briefly during hydration). */
    currentUser: auth.currentUser,
  };
}
