import React, { useMemo } from 'react';

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins} MINUTES AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} HOURS AGO`;
  return `${Math.floor(hrs / 24)} DAYS AGO`;
}

export default function ContactActivityPanel({ messages }) {
  const items = useMemo(() => {
    return (Array.isArray(messages) ? messages : [])
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, 8);
  }, [messages]);

  return (
    <aside className="contactAdmin-activity contactAdmin-activity--figma">
      <div className="contactAdmin-activityHead">
        <h3 className="contactAdmin-activityTitle">Recent Support Activity</h3>
        <span className="contactAdmin-liveBadge">Live Monitor</span>
      </div>
      <ul className="contactAdmin-activityList">
        {items.length === 0 ? (
          <li className="contactAdmin-activityItem contactAdmin-activityItem--empty">No recent events yet.</li>
        ) : (
          items.map((m) => {
            const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email || 'Inquiry';
            const st = String(m.status || 'new').toLowerCase();
            const isHot = st === 'new';
            const isDone = st === 'replied' || st === 'archived';
            const title = isDone ? `Inquiry from ${name} — ${st}` : `High priority — ${name}`;
            const sub = isDone ? `Status updated to ${st}.` : `New message awaiting review.`;
            return (
              <li key={m.id} className="contactAdmin-activityItem">
                <span className={`contactAdmin-activityDot ${isHot ? 'is-hot' : isDone ? 'is-done' : ''}`} aria-hidden />
                <div className="contactAdmin-activityBlock">
                  <strong className="contactAdmin-activityHeadline">{title}</strong>
                  <p className="contactAdmin-activityDesc">{sub}</p>
                  <span className="contactAdmin-activityTime">{formatRelative(m.createdAt)}</span>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
