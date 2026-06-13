import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  User,
  KeyRound,
  Settings,
} from 'lucide-react';
import { ADMIN_EMAIL } from '../../config/admin';

import './playerSidebar.css';

const playerNavItems = [
  { to: '/player/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/player/friends', label: 'Friends List', Icon: Users },
  { to: '/player/profile', label: 'Profile', Icon: User },
  { to: '/player/billing', label: 'Billing', Icon: CreditCard },
  { to: '/player/change-password', label: 'Change Password', Icon: KeyRound },
  { to: '/player/settings', label: 'Settings', Icon: Settings },
];

const adminNavItems = [
  { to: '/admin/payments', label: 'Admin Dashboard', Icon: LayoutDashboard },
  { to: '/player/profile', label: 'Profile', Icon: User },
  { to: '/player/billing', label: 'Billing', Icon: CreditCard },
  { to: '/player/change-password', label: 'Change Password', Icon: KeyRound },
];

export default function PlayerSidebar({ onNavigate }) {
  const authUser = useSelector((s) => s.auth.user);
  const isAdmin = String(authUser?.email || '').toLowerCase() === ADMIN_EMAIL;
  const navItems = isAdmin ? adminNavItems : playerNavItems;

  return (
    <div className="pd-sidebarInner">
      <div className="pd-brand">
        <div className="pd-brandMark" aria-hidden="true">
          <span className="pd-brandMarkIcon">S</span>
        </div>
        <div className="pd-brandText">
          <div className="pd-brandName">Skilz Player</div>
        </div>
      </div>

      <nav className="pd-nav" aria-label="Player dashboard navigation">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `pd-navItem ${isActive ? 'is-active' : ''}`}
            end
            onClick={() => onNavigate?.()}
          >
            <span className="pd-navIcon" aria-hidden="true">
              {React.createElement(Icon, { size: 18 })}
            </span>
            <span className="pd-navLabel">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="pd-helpCard" role="note">
        <div className="pd-helpTitle">Need help?</div>
        <div className="pd-helpText">Browse guides or contact support.</div>
        <Link to="/guide" className="pd-helpButton" onClick={() => onNavigate?.()}>
          View guide
        </Link>
        <Link
          to="/contact"
          className="pd-helpButton"
          style={{ marginTop: 8, display: 'inline-block' }}
          onClick={() => onNavigate?.()}
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
