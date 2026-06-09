import React from 'react';

export default function WinnerCard({ winner, mode, selectedGame, online }) {
  if (!winner) {
    return (
      <div className="lbd-heroCard lbd-heroCard--empty">
        <p className="lbd-empty">No players available for this filter.</p>
      </div>
    );
  }

  const gameText = selectedGame === 'all' ? 'All Games' : selectedGame;
  const title = mode === 'friends' ? 'Top Friend' : 'Global Winner';

  return (
    <div className="lbd-heroCard">
      <div className="lbd-heroTx">
        <p className="lbd-kicker">{title} • {gameText}</p>
        <h3 className="lbd-name">{winner.name}</h3>
        <p className="lbd-meta">
          Level {winner.level} • {winner.xp.toLocaleString('en-US')} XP • {winner.coins.toLocaleString('en-US')} Coins
        </p>
        <div className="lbd-heroFt">
          <div className="lbd-avBig">
            {winner.avatar ? <img src={winner.avatar} alt="" /> : null}
          </div>
          <p className="lbd-author">
            {winner.name} {online ? '• Online' : '• Offline'}
          </p>
        </div>
      </div>
      <div className="lbd-heroImg" aria-hidden="true">
        <img
          src="https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80"
          alt=""
        />
      </div>
    </div>
  );
}

