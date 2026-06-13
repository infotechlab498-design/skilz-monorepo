import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { auth } from '../firebase/config.js';
import {
  processOAuthRedirectResult,
  subscribeFirebaseAuth,
  readPendingOAuthNavigation,
  clearPendingOAuthNavigation,
} from '../services/authService.js';
import AuthNoticeBanner from './AuthNoticeBanner.jsx';

/**
 * Completes OAuth redirect (Google/Facebook) before subscribing, then keeps Firebase ↔ Redux in sync.
 * Must render under `BrowserRouter` (see `App.jsx`).
 */
export default function FirebaseAuthSync() {
  const navigate = useNavigate();
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);

  useEffect(() => {
    let active = true;
    let unsub = () => {};

    const tryNavigate = (target) => {
      const path = String(target || '').trim();
      if (!path || !active) return false;
      clearPendingOAuthNavigation();
      navigate(path, { replace: true });
      return true;
    };

    (async () => {
      const r = await processOAuthRedirectResult().catch(() => ({ status: 'none' }));
      if (!active) return;
      unsub = await subscribeFirebaseAuth();
      if (!active) {
        unsub();
        return;
      }
      if (r.status === 'ok' && r.navigateTo) {
        tryNavigate(r.navigateTo);
      }
    })();

    return () => {
      active = false;
      unsub();
    };
  }, [navigate]);

  /** Fallback: StrictMode or slow hydrate can skip the first navigate attempt. */
  useEffect(() => {
    if (!firebaseReady) return;
    const hasSession = isAuthenticated || !!auth.currentUser?.uid;
    if (!hasSession) return;
    const pending = readPendingOAuthNavigation();
    if (!pending) return;
    clearPendingOAuthNavigation();
    navigate(pending, { replace: true });
  }, [firebaseReady, isAuthenticated, navigate]);

  return <AuthNoticeBanner />;
}
