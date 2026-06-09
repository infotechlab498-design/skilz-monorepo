import React, { useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import PlayerSidebar from '../Components/sidebar/PlayerSidebar.jsx';
import Topbar from '../Components/sidebar/Topbar.jsx';
import { PlayerNotificationsProvider } from '../context/PlayerNotificationsContext.jsx';
import { ADMIN_EMAIL } from '../config/admin';
import './playerDashboardLayout.css';
import './playerDashboardDrawer.css';

export default function PlayerDashboardLayout() {
  const [isOpen, setIsOpen] = useState(false);
  const authUser = useSelector((s) => s.auth.user);
  const navigate = useNavigate();
  const location = useLocation();

  const closeSidebar = useCallback(() => setIsOpen(false), []);
  const toggleSidebar = useCallback(() => setIsOpen((v) => !v), []);
  const isAdmin = String(authUser?.email || '').toLowerCase().trim() === ADMIN_EMAIL;

  React.useEffect(() => {
    if (!isAdmin) return;
    if (!location.pathname.startsWith('/player')) return;
    navigate('/admin/payments', { replace: true });
  }, [isAdmin, location.pathname, navigate]);

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
