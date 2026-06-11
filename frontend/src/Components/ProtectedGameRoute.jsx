import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { auth } from '../firebase/config.js';

/**
 * Requires Firebase-authenticated session (P0-2: Firebase is source of truth).
 * Waits for first `onAuthStateChanged` so refresh does not flash a redirect.
 */
export default function ProtectedGameRoute({ children }) {
  const location = useLocation();
  const { firebaseReady, isAuthenticated } = useAuth();

  const allowed = isAuthenticated || !!auth.currentUser?.uid;

  if (!firebaseReady) {
    return (
      <div
        style={{
          minHeight: '40vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
        }}
      >
        Loading session…
      </div>
    );
  }

  if (!allowed) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ redirectTo: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}
