import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

/**
 * Requires Firebase-authenticated session (auth.currentUser mirrored in Redux).
 * Waits for first `onAuthStateChanged` so refresh does not flash a redirect.
 */
export default function ProtectedGameRoute({ children }) {
  const location = useLocation();
  const { firebaseReady, isAuthenticated } = useAuth();

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

  if (!isAuthenticated) {
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
