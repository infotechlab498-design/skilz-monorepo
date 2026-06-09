import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { subscribeNotifications } from '../api/friendsDashboardApi.js';

const PlayerNotificationsContext = createContext(null);

export function PlayerNotificationsProvider({ children }) {
  const authUser = useSelector((s) => s.auth.user);
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);
  const uid = authUser?.uid || '';

  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState(null);

  useEffect(() => {
    if (!firebaseReady || !uid) {
      setNotifications([]);
      setNotificationError(null);
      return () => {};
    }
    return subscribeNotifications(
      uid,
      (items) => setNotifications(items || []),
      (err) => setNotificationError(err || null)
    );
  }, [firebaseReady, uid]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      firebaseReady,
      uid,
      notificationError,
    }),
    [notifications, unreadCount, firebaseReady, uid, notificationError]
  );

  return (
    <PlayerNotificationsContext.Provider value={value}>
      {children}
    </PlayerNotificationsContext.Provider>
  );
}

export function usePlayerNotifications() {
  const ctx = useContext(PlayerNotificationsContext);
  if (!ctx) {
    throw new Error('usePlayerNotifications must be used within PlayerNotificationsProvider');
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. tests). */
export function usePlayerNotificationsOptional() {
  return useContext(PlayerNotificationsContext);
}
