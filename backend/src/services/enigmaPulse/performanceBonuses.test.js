import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import {
  computeBaseMatchRewards,
  computePerformanceBonuses,
  createEmptyMatchStats,
  PERFORMANCE_BONUS_CAPS,
} from '../../../../shared/enigmaPulse/performanceBonuses.js';

describe('computePerformanceBonuses', () => {
  it('awards no-timeout and streak bonuses for strong Sequence IQ play', () => {
    const stats = {
      ...createEmptyMatchStats(),
      nodesPlayed: 10,
      correct: 9,
      firstTryCorrect: 8,
      maxStreak: 4,
      timeouts: 0,
    };
    const { bonusCoins, bonusXp, breakdown } = computePerformanceBonuses({
      gameKey: 'pattern_recognition',
      matchStats: stats,
    });
    assert.ok(bonusCoins >= 8);
    assert.ok(bonusXp >= 5);
    assert.ok(breakdown.some((b) => b.id === 'no_timeout'));
    assert.ok(breakdown.some((b) => b.id === 'streak_master'));
  });

  it('caps total bonus coins and xp', () => {
    const stats = {
      ...createEmptyMatchStats(),
      nodesPlayed: 10,
      correct: 10,
      firstTryCorrect: 10,
      maxStreak: 6,
      timeouts: 0,
    };
    const { bonusCoins, bonusXp } = computePerformanceBonuses({
      gameKey: 'pattern_recognition',
      matchStats: stats,
    });
    assert.ok(bonusCoins <= PERFORMANCE_BONUS_CAPS.maxBonusCoins);
    assert.ok(bonusXp <= PERFORMANCE_BONUS_CAPS.maxBonusXp);
    assert.ok(bonusCoins > 0);
    assert.ok(bonusXp > 0);
  });

  it('returns zero for forfeit leaver', () => {
    const { bonusCoins, breakdown } = computePerformanceBonuses({
      gameKey: 'pattern_recognition',
      matchStats: { ...createEmptyMatchStats(), nodesPlayed: 10, correct: 10, maxStreak: 5 },
      isForfeitLeaver: true,
    });
    assert.equal(bonusCoins, 0);
    assert.equal(breakdown.length, 0);
  });

  it('blocks bonus when accuracy is too low', () => {
    const { bonusCoins } = computePerformanceBonuses({
      gameKey: 'pattern_recognition',
      matchStats: { ...createEmptyMatchStats(), nodesPlayed: 5, correct: 1, maxStreak: 0 },
    });
    assert.equal(bonusCoins, 0);
  });
});

describe('computeBaseMatchRewards', () => {
  it('uses draw tier when draw', () => {
    const base = computeBaseMatchRewards(ENIGMA_PULSE, {
      gameKey: 'pattern_recognition',
      draw: true,
    });
    assert.equal(base.baseXp, ENIGMA_PULSE.DRAW_XP_REWARD);
    assert.equal(base.baseCoins, ENIGMA_PULSE.DRAW_REFUND_COINS);
  });

  it('uses sequence IQ win tier', () => {
    const base = computeBaseMatchRewards(ENIGMA_PULSE, {
      gameKey: 'pattern_recognition',
      won: true,
    });
    assert.equal(base.baseXp, ENIGMA_PULSE.SEQUENCE_IQ_REWARDS.winXp);
    assert.equal(base.baseCoins, ENIGMA_PULSE.SEQUENCE_IQ_REWARDS.winCoins);
  });
});
