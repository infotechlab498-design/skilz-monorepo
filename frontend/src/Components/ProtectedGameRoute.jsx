import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

/**
 * Requires a synced auth session (Firebase + bootstrap, or dev OTP JWT-only).
 * Waits for first `onAuthStateChanged` so refresh does not flash a redirect.
 */
export default function ProtectedGameRoute({ children }) {
    const location = useLocation();
    const firebaseReady = useSelector((s) => s.auth.firebaseReady);
    const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);

    if (!firebaseReady) {
        return (
            <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading session…
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/signin" replace state={{ redirectTo: `${location.pathname}${location.search}` }} />;
    }

    return children;
}
