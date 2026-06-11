import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clearAuthNotice, setAuthNotice } from '../redux/features/auth.jsx';

/**
 * Global auth notices (OAuth failures, profile sync warnings).
 * Replaces sessionStorage-only `skilz_auth_notice` visibility on `/signin` alone.
 */
export default function AuthNoticeBanner() {
  const dispatch = useDispatch();
  const notice = useSelector((s) => s.auth.authNotice);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('skilz_auth_notice');
      if (stored?.trim()) {
        dispatch(setAuthNotice(stored.trim()));
        sessionStorage.removeItem('skilz_auth_notice');
      }
    } catch {
      /* ignore */
    }
  }, [dispatch]);

  if (!notice) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        maxWidth: 'min(560px, calc(100vw - 24px))',
        padding: '12px 16px',
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 10,
        color: '#78350f',
        fontSize: 14,
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span style={{ flex: 1 }}>{notice}</span>
      <button
        type="button"
        onClick={() => dispatch(clearAuthNotice())}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#92400e',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
