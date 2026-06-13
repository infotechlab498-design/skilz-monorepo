import React, { useCallback, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import PlayerSidebar from '../Components/sidebar/PlayerSidebar.jsx';
import Topbar from '../Components/sidebar/Topbar.jsx';
import { PlayerNotificationsProvider } from '../context/PlayerNotificationsContext.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { auth } from '../firebase/config.js';
import { ADMIN_EMAIL } from '../config/admin';
import './playerDashboardLayout.css';
import './playerDashboardDrawer.css';

export default function PlayerDashboardLayout() {
  const [isOpen, setIsOpen] = useState(false);
  const authUser = useSelector((s) => s.auth.user);
  const { firebaseReady, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const closeSidebar = useCallback(() => setIsOpen(false), []);
  const toggleSidebar = useCallback(() => setIsOpen((v) => !v), []);
  const isAdmin = String(authUser?.email || '').toLowerCase().trim() === ADMIN_EMAIL;
  const allowed = isAuthenticated || !!auth.currentUser?.uid;

  React.useEffect(() => {
    if (!isAdmin) return;
    if (!location.pathname.startsWith('/player')) return;
    navigate('/admin/payments', { replace: true });
  }, [isAdmin, location.pathname, navigate]);

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

  if (!allowed) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ redirectTo: `${location.pathname}${location.search}` }}
      />
    );
  }

  return (
    <PlayerNotificationsProvider>
    <div className="pd-shell">
      {isOpen ? (
        <button
          type="button"
          className="dwr-ov"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      ) : null}

      <aside
        className={`pd-sidebar dwr-sb ${isOpen ? 'dwr-op' : 'dwr-cl'}`}
      >
        <PlayerSidebar onNavigate={closeSidebar} />
      </aside>

      <main className="pd-main" role="main">
        <div className="pd-topbar">
          <Topbar onMenuClick={toggleSidebar} />
        </div>
        <div className="pd-mainInner">
          <Outlet />
        </div>
      </main>
    </div>
    </PlayerNotificationsProvider>
  );
}
