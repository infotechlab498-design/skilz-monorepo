import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  processOAuthRedirectResult,
  subscribeFirebaseAuth,
} from '../services/authService.js';
import AuthNoticeBanner from './AuthNoticeBanner.jsx';

/**
 * Completes OAuth redirect (Google/Facebook) before subscribing, then keeps Firebase ↔ Redux in sync.
 * Must render under `BrowserRouter` (see `App.jsx`).
 */
export default function FirebaseAuthSync() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    let unsub = () => {};

    (async () => {
      const r = await processOAuthRedirectResult().catch(() => ({ status: 'none' }));
      if (!active) return;
      unsub = subscribeFirebaseAuth();
      if (r.status === 'ok' && r.navigateTo) {
        navigate(r.navigateTo, { replace: true });
      }
    })();

    return () => {
      active = false;
      unsub();
    };
  }, [navigate]);

  return <AuthNoticeBanner />;
}
