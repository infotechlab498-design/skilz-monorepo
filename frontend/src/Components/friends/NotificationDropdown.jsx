import React from 'react';

export default function NotificationDropdown({
  open,
  notifications,
  onClose,
  /** @deprecated use onInviteAction */
  onAction,
  onInviteAction,
  onDismiss,
  onJoinMatch,
}) {
  const inviteHandler = onInviteAction || onAction;
  if (!open) return null;

  return (
    <div className="frd-ntDp" role="menu">
      <div className="frd-ntHd">
        <strong>Notifications</strong>
        <button type="button" className="frd-ntX" onClick={onClose}>
          Close
        </button>
      </div>
      {notifications.length === 0 ? (
        <p className="frd-ntEmpty">No notifications.</p>
      ) : (
        notifications.map((n) => {
          const isUnread = !n.read;
          return (
            <div
              key={n.id}
              className={`frd-ntIt ${isUnread ? 'is-unread' : 'is-read'}`}
            >
              {n.type === 'invite' && n.inviteId ? (
                <p className="frd-ntMsg">{n.message || 'New update'}</p>
              ) : (
                <button
                  type="button"
                  className="frd-ntRowBtn"
                  disabled={!isUnread || !onDismiss}
                  onClick={() => isUnread && onDismiss && onDismiss(n)}
                >
                  <p className="frd-ntMsg">{n.message || 'New update'}</p>
                </button>
              )}
              {n.type === 'invite' && n.inviteId ? (
                <div className="frd-ntFt">
                  <button
                    type="button"
                    className="frd-ntBtn is-ok"
                    onClick={() => inviteHandler && inviteHandler(n, 'accepted')}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="frd-ntBtn is-no"
                    onClick={() => inviteHandler && inviteHandler(n, 'rejected')}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              {n.type === 'match_ready' && n.matchId && n.gameId ? (
                <div className="frd-ntFt">
                  <button
                    type="button"
                    className="frd-ntBtn is-ok"
                    onClick={() => onJoinMatch && onJoinMatch(n)}
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    className="frd-ntBtn is-no"
                    onClick={() => onDismiss && onDismiss(n)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
              {n.type === 'invite_response' ? (
                <div className="frd-ntFt">
                  <button
                    type="button"
                    className="frd-ntBtn is-no"
                    onClick={() => onDismiss && onDismiss(n)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
