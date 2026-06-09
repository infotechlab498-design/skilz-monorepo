import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '../../Components/friends/NotificationBell.jsx';
import NotificationDropdown from '../../Components/friends/NotificationDropdown.jsx';
import '../../Components/friends/friends.css';
import { usePlayerNotificationsOptional } from '../../context/PlayerNotificationsContext.jsx';
import {
  markNotificationRead,
  updateInviteStatus,
} from '../../api/friendsDashboardApi.js';
import { buildLobbyPathWithMatch } from '../../utils/gameLobbyRoutes.js';

/**
 * Bell + dropdown; reads notifications from PlayerNotificationsProvider when present.
 */
export default function PlayerTopbarNotifications() {
  const ctx = usePlayerNotificationsOptional();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  // Hooks must run unconditionally — do not return before these (firebaseReady / uid appear after first paint).
  const handleInviteAction = useCallback(
    async (notif, action) => {
      setActionError('');
      try {
        if (notif?.inviteId && action) {
          const data = await updateInviteStatus(notif.inviteId, action);
          if (action === 'accepted' && data?.matchId && data?.gameId) {
            navigate(buildLobbyPathWithMatch(data.gameId, data.matchId));
            setOpen(false);
          }
        }
        await markNotificationRead(notif.id);
      } catch (e) {
        setActionError(e?.message || 'Could not update notification.');
      }
    },
    [navigate]
  );

  const handleDismiss = useCallback(async (notif) => {
    setActionError('');
    try {
      await markNotificationRead(notif.id);
    } catch (e) {
      setActionError(e?.message || 'Could not dismiss.');
    }
  }, []);

  const handleJoinMatch = useCallback(
    (notif) => {
      const mid = notif?.matchId;
      const gid = notif?.gameId;
      if (!mid || !gid) return;
      navigate(buildLobbyPathWithMatch(gid, mid));
      setOpen(false);
      void markNotificationRead(notif.id);
    },
    [navigate]
  );

  if (!ctx || !ctx.uid || !ctx.firebaseReady) {
    return null;
  }

  const { notifications, unreadCount, notificationError } = ctx;

  return (
    <div className="pd-ntfWrap" style={{ position: 'relative', marginLeft: 'auto' }}>
      {notificationError?.message ? (
        <span className="pd-ntfErr" role="status" aria-live="polite" style={{ fontSize: 11, color: '#dc2626', marginRight: 8 }}>
          {notificationError.message}
        </span>
      ) : null}
      {actionError ? (
        <span className="pd-ntfErr" role="status" aria-live="polite" style={{ fontSize: 11, color: '#dc2626', marginRight: 8 }}>
          {actionError}
        </span>
      ) : null}
      <NotificationBell count={unreadCount} onClick={() => setOpen((v) => !v)} />
      <NotificationDropdown
        open={open}
        notifications={notifications}
        onClose={() => setOpen(false)}
        onInviteAction={handleInviteAction}
        onDismiss={handleDismiss}
        onJoinMatch={handleJoinMatch}
      />
    </div>
  );
}
