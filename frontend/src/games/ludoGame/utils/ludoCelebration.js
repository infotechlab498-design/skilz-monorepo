import confetti from 'canvas-confetti';

const WINNER_COLORS = {
  RED: ['#ff416c', '#ff6b4a', '#ffd700'],
  GREEN: ['#10b981', '#34d399', '#fde68a'],
  YELLOW: ['#fbbf24', '#fde68a', '#f59e0b'],
  BLUE: ['#0ea5e9', '#67e8f9', '#6366f1'],
};

const PETAL_PALETTE = [
  '#f43f5e', '#fb7185', '#fbbf24', '#fde68a', '#fda4af',
  '#fbcfe8', '#fcd34d', '#fef08a', '#a7f3d0', '#fcd34d',
];

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function particleBudget() {
  if (typeof window === 'undefined') return 80;
  const w = window.innerWidth;
  if (w < 480) return 50;
  if (w < 768) return 70;
  return 100;
}

let celebrationRaf = null;

export function stopCelebrationEffects() {
  if (celebrationRaf) {
    cancelAnimationFrame(celebrationRaf);
    celebrationRaf = null;
  }
  confetti.reset();
}

/** Short burst for personal finish (Phase 1). */
export function firePersonalCelebration(winnerColor = 'GREEN') {
  if (prefersReducedMotion()) return;
  stopCelebrationEffects();
  const colors = WINNER_COLORS[winnerColor] || WINNER_COLORS.GREEN;
  const count = Math.floor(particleBudget() * 0.6);

  confetti({
    particleCount: count,
    spread: 55,
    origin: { y: 0.35, x: 0.5 },
    colors,
    ticks: 120,
    gravity: 0.9,
    scalar: 1.1,
  });
}

/** Full match-end celebration (Phase 2) — runs ~5s. */
export function fireMatchCelebration(winnerColor = 'GREEN', durationMs = 5500) {
  if (prefersReducedMotion()) return () => {};
  stopCelebrationEffects();

  const colors = [...(WINNER_COLORS[winnerColor] || WINNER_COLORS.GREEN), ...PETAL_PALETTE];
  const budget = particleBudget();
  const end = Date.now() + durationMs;

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 48,
      origin: { x: 0, y: 0 },
      colors,
      ticks: 200,
      gravity: 0.75,
      drift: 0.4,
      scalar: 1.15,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 48,
      origin: { x: 1, y: 0 },
      colors,
      ticks: 200,
      gravity: 0.75,
      drift: -0.4,
      scalar: 1.15,
    });
    if (Date.now() < end) {
      celebrationRaf = requestAnimationFrame(frame);
    } else {
      celebrationRaf = null;
    }
  };

  confetti({
    particleCount: Math.floor(budget * 0.5),
    spread: 80,
    origin: { y: 0.45, x: 0.5 },
    colors,
    ticks: 180,
  });

  confetti({
    particleCount: Math.floor(budget * 0.25),
    spread: 100,
    startVelocity: 35,
    origin: { y: 0.6, x: 0.5 },
    colors: ['#ffd700', '#fde68a', '#ffffff'],
    ticks: 160,
    shapes: ['circle'],
  });

  frame();

  return stopCelebrationEffects;
}

export function getPetalCount() {
  if (prefersReducedMotion()) return 0;
  const w = typeof window !== 'undefined' ? window.innerWidth : 768;
  if (w < 480) return 18;
  if (w < 768) return 28;
  return 40;
}

export { PETAL_PALETTE, WINNER_COLORS, prefersReducedMotion };
