import React from 'react';

export default function LeaderboardRow({ player, rank, online }) {
  return (
    <div className="lbd-row">
      <div className="lbd-rk">
        <span className="lbd-rkBubble">{rank}</span>
      </div>
      <div className="lbd-ply">
        <div className="lbd-av">
          {player.avatar ? <img src={player.avatar} alt="" /> : null}
        </div>
        <div>
          <h3 className="lbd-rowName">{player.name}</h3>
          <p className="lbd-rowSub">
            Level {player.level}
            <span className="lbd-badge">v5</span>
            <span className="lbd-vs">VS</span>
          </p>
        </div>
        <span className={`lbd-dot ${online ? 'is-on' : 'is-off'}`} />
      </div>
      <div className="lbd-st">
        <p>{player.xp.toLocaleString('en-US')} XP</p>
        <p>coins:{Math.max(1, Math.round(player.coins / 5000))}/5</p>
      </div>
    </div>
  );
}

