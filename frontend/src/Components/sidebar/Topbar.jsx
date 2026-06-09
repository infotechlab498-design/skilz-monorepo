import React from 'react';
import PlayerTopbarNotifications from './PlayerTopbarNotifications.jsx';

export default function Topbar({ onMenuClick, title }) {
  return (
    <header className="pd-topbarInner">
      <button type="button" className="dwr-btn" aria-label="Open menu" onClick={onMenuClick}>
        ☰
      </button>
      {title ? <span className="pd-topbarTitle">{title}</span> : null}
      <PlayerTopbarNotifications />
    </header>
  );
}
