import React from 'react';

function slideImage(winner) {
  return (
    winner?.bannerImage ||
    winner?.coverImage ||
    winner?.photoURL ||
    winner?.avatar ||
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=80'
  );
}

function formatDate() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export default function WinnerSlider({ winners, activeIndex, onChange }) {
  if (!winners?.length) {
    return (
      <div className="lbd-heroCard lbd-heroCard--empty">
        <p className="lbd-empty">No winners available yet.</p>
      </div>
    );
  }

  const safeIndex = Math.max(0, Math.min(activeIndex || 0, winners.length - 1));
  const winner = winners[safeIndex];
  const img = slideImage(winner);

  return (
    <>
      <div className="lbd-dots" aria-label="Winner slides">
        {winners.map((w, idx) => (
          <button
            key={w.id || idx}
            type="button"
            className={`lbd-dotBtn ${idx === safeIndex ? 'is-on' : ''}`}
            onClick={() => onChange(idx)}
            aria-label={`Go to winner ${idx + 1}`}
          />
        ))}
      </div>

      <article className="lbd-heroCard">
        <img src={img} alt="" className="lbd-heroImgBg" />
        <div className="lbd-heroOverlay">
          <h3 className="lbd-heroTitle">
            {winner.name} leads the board with {winner.coins.toLocaleString('en-US')} coins.
          </h3>
          <div className="lbd-heroMeta">
            <span className="lbd-heroAvatar">{winner.avatar ? <img src={winner.avatar} alt="" /> : null}</span>
            <span>{winner.name}</span>
            <span>|</span>
            <span>{formatDate()}</span>
          </div>
        </div>
      </article>
    </>
  );
}

