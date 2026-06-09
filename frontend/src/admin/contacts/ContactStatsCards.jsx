import React from 'react';
import { Mail, MailPlus, Reply, Archive } from 'lucide-react';

const CARDS = [
  { key: 'total', label: 'Total Messages', icon: Mail, iconClass: 'contactAdmin-statIcon--total' },
  { key: 'new', label: 'New Messages', icon: MailPlus, iconClass: 'contactAdmin-statIcon--new' },
  { key: 'replied', label: 'Replied Messages', icon: Reply, iconClass: 'contactAdmin-statIcon--replied' },
  { key: 'archived', label: 'Archived', icon: Archive, iconClass: 'contactAdmin-statIcon--archived' },
];

export default function ContactStatsCards({ stats }) {
  const s = stats && typeof stats === 'object' ? stats : {};
  return (
    <div className="contactAdmin-statsRow">
      {CARDS.map((c) => {
        const Icon = c.icon;
        const value = c.key === 'total' ? Number(s.total ?? 0) : Number(s[c.key] ?? 0);
        return (
          <div key={c.key} className="contactAdmin-statCard contactAdmin-statCard--figma">
            <div className={`contactAdmin-statIcon ${c.iconClass}`} aria-hidden>
              <Icon size={22} strokeWidth={2} />
            </div>
            <div className="contactAdmin-statBody">
              <span className="contactAdmin-statLabel">{c.label}</span>
              <strong className="contactAdmin-statValue">{value.toLocaleString()}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}
