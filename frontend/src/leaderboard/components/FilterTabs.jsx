import React from 'react';

const MODES = [
  { id: 'global', label: 'User Leaderboard' },
  { id: 'friends', label: 'Friends Leaderboard' },
];

export default function FilterTabs({ mode, onChange }) {
  return (
    <div className="lbd-tabs">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`lbd-tab ${mode === m.id ? 'is-on' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

