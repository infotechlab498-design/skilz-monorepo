import React from 'react';
import LeaderboardRow from './LeaderboardRow.jsx';

export default function LeaderboardList({ players, presenceMap }) {
  if (!players.length) return <p className="lbd-empty">No ranked players yet.</p>;
  return (
    <div className="lbd-list">
      {players.map((p, idx) => (
        <LeaderboardRow
          key={p.id}
          player={p}
          rank={idx + 1}
          online={!!presenceMap?.[p.id]?.online}
        />
      ))}
    </div>
  );
}

