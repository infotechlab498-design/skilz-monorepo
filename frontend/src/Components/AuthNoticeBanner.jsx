import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { clearAuthNotice, setAuthNotice } from '../redux/features/auth.jsx';

const AUTH_NOTICE_KEY = 'skilz_auth_notice';

/**
 * Global authentication notices (OAuth failures, profile sync, account linking).
 * Replaces sessionStorage-only error surfacing on /signin.
 */
export default function AuthNoticeBanner() {
  const dispatch = useDispatch();
  const notice = useSelector((s) => s.auth.authNotice);

  useEffect(() => {
    try {
      const persisted = sessionStorage.getItem(AUTH_NOTICE_KEY);
      if (persisted?.trim()) {
        dispatch(setAuthNotice(persisted.trim()));
        sessionStorage.removeItem(AUTH_NOTICE_KEY);
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
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        background: '#fef3c7',
        borderBottom: '1px solid #fcd34d',
        color: '#78350f',
        fontSize: 14,
        lineHeight: 1.45,
      }}
    >
      <span style={{ flex: 1 }}>{notice}</span>
      <button
        type="button"
        onClick={() => dispatch(clearAuthNotice())}
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: '1px solid #d97706',
          borderRadius: 8,
          padding: '4px 10px',
          color: '#92400e',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
