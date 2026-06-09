import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeTriviaBaseRewards,
  computeTriviaMatchRewards,
  computeTriviaPerformanceBonuses,
  createEmptyTriviaMatchStats,
  summarizeTriviaPerformance,
} from '../../../../shared/trivia/performanceBonuses.js';
import { TRIVIA_BONUS_CAPS, TRIVIA_REWARDS } from '../../../../shared/trivia/constants.js';

describe('computeTriviaPerformanceBonuses', () => {
  it('awards no-timeout and hot streak for strong play', () => {
    const stats = {
      ...createEmptyTriviaMatchStats(),
      attempts: 10,
      correct: 9,
      wrong: 1,
      answeredCount: 10,
      totalAnswerMs: 60000,
      maxStreak: 4,
      timeouts: 0,
    };
    const { bonusCoins, breakdown } = computeTriviaPerformanceBonuses({
      matchStats: stats,
      won: true,
    });
    assert.ok(bonusCoins >= 8);
    assert.ok(breakdown.some((b) => b.id === 'no_timeout'));
    assert.ok(breakdown.some((b) => b.id === 'hot_streak'));
  });

  it('caps total bonus coins and xp', () => {
    const stats = {
      ...createEmptyTriviaMatchStats(),
      attempts: 10,
      correct: 10,
      wrong: 0,
      answeredCount: 10,
      totalAnswerMs: 50000,
      maxStreak: 6,
      timeouts: 0,
    };
    const { bonusCoins, bonusXp } = computeTriviaPerformanceBonuses({
      matchStats: stats,
      won: true,
    });
    assert.ok(bonusCoins <= TRIVIA_BONUS_CAPS.maxBonusCoins);
    assert.ok(bonusXp <= TRIVIA_BONUS_CAPS.maxBonusXp);
  });

  it('returns zero for forfeit leaver via match rewards', () => {
    const rewards = computeTriviaMatchRewards({
      matchStats: { ...createEmptyTriviaMatchStats(), attempts: 10, correct: 10 },
      won: false,
      isForfeitLeaver: true,
    });
    assert.equal(rewards.coinsGained, 0);
    assert.equal(rewards.xpGained, 0);
  });

  it('blocks bonus when accuracy is too low', () => {
    const { bonusCoins } = computeTriviaPerformanceBonuses({
      matchStats: { ...createEmptyTriviaMatchStats(), attempts: 6, correct: 1, wrong: 5 },
      won: false,
    });
    assert.equal(bonusCoins, 0);
  });
});

describe('computeTriviaBaseRewards', () => {
  it('uses draw tier when draw', () => {
    const base = computeTriviaBaseRewards({ draw: true });
    assert.equal(base.baseXp, TRIVIA_REWARDS.DRAW_XP);
    assert.equal(base.baseCoins, TRIVIA_REWARDS.DRAW_COINS);
  });

  it('combines base + bonus in match rewards', () => {
    const stats = {
      ...createEmptyTriviaMatchStats(),
      attempts: 10,
      correct: 10,
      answeredCount: 10,
      totalAnswerMs: 50000,
      maxStreak: 5,
      timeouts: 0,
    };
    const rewards = computeTriviaMatchRewards({ matchStats: stats, won: true });
    assert.equal(rewards.baseCoins, TRIVIA_REWARDS.WIN_COINS);
    assert.ok(rewards.coinsGained >= TRIVIA_REWARDS.WIN_COINS);
    assert.ok(rewards.xpGained >= TRIVIA_REWARDS.WIN_XP);
  });
});

describe('summarizeTriviaPerformance', () => {
  it('computes avg answer time and accuracy', () => {
    const summary = summarizeTriviaPerformance({
      ...createEmptyTriviaMatchStats(),
      attempts: 4,
      correct: 3,
      answeredCount: 4,
      totalAnswerMs: 20000,
      maxStreak: 2,
    });
    assert.equal(summary.avgAnswerMs, 5000);
    assert.equal(summary.accuracyPct, 75);
    assert.equal(summary.maxStreak, 2);
  });
});
