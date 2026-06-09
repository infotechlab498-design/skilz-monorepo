import React from 'react';
import { getPetalCount, PETAL_PALETTE } from '../../utils/ludoCelebration.js';
import './LudoCelebrationOverlay.css';

const PETAL_VARIANTS = ['rose', 'marigold', 'blossom', 'gold'];

function buildPetals(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2.5}s`,
    duration: `${4 + Math.random() * 2.5}s`,
    color: PETAL_PALETTE[i % PETAL_PALETTE.length],
    drift: `${(Math.random() - 0.5) * 80}px`,
    variant: PETAL_VARIANTS[i % PETAL_VARIANTS.length],
  }));
}

export function LudoCelebrationOverlay({
  active,
  winnerColor = 'GREEN',
  showSkip = false,
  onSkip,
  interactive = false,
  intensity = 'full',
}) {
  const petalCount = intensity === 'light' ? Math.max(8, Math.floor(getPetalCount() * 0.4)) : getPetalCount();
  const petals = React.useMemo(
    () => (active ? buildPetals(petalCount) : []),
    [active, petalCount]
  );

  if (!active) return null;

  const colorKey = String(winnerColor || 'GREEN').toLowerCase();

  return (
    <div
      className={`ludo-celebration-root ${interactive ? 'ludo-celebration-root--interactive' : ''}`}
      aria-hidden={!interactive}
    >
      <div className={`ludo-celebration-backdrop ludo-celebration-backdrop--${colorKey}`} />

      <div className="ludo-petal-layer" aria-hidden="true">
        {petals.map((p) => (
          <span
            key={p.id}
            className={`ludo-petal ludo-petal--${p.variant}`}
            style={{
              left: p.left,
              background: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
              '--drift': p.drift,
            }}
          />
        ))}
      </div>

      {intensity === 'full' && (
        <>
          <span
            className="ludo-firework-burst"
            style={{ top: '18%', left: '20%', background: 'radial-gradient(circle, rgba(255,215,0,0.5), transparent 70%)' }}
          />
          <span
            className="ludo-firework-burst"
            style={{
              top: '22%',
              right: '18%',
              left: 'auto',
              animationDelay: '0.6s',
              background: 'radial-gradient(circle, rgba(255,100,150,0.45), transparent 70%)',
            }}
          />
        </>
      )}

      {showSkip && onSkip && (
        <button type="button" className="ludo-celebration-skip" onClick={onSkip}>
          Skip Celebration
        </button>
      )}
    </div>
  );
}
