import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  processOAuthRedirectResult,
  subscribeFirebaseAuth,
} from '../services/authService.js';

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
      // Redux serialization is handled in auth/user services (Timestamp -> millis).
      // This component only orchestrates redirect + auth subscription lifecycle.
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

  return null;
}
