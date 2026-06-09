import React from 'react';
import { Bell } from 'lucide-react';

export default function NotificationBell({ count, onClick }) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  const label = n > 9 ? '9+' : String(n);
  return (
    <button type="button" className="frd-bell" onClick={onClick} aria-label="Notifications">
      <Bell size={18} />
      {n > 0 ? <span className="frd-bellCt">{label}</span> : null}
    </button>
  );
}

