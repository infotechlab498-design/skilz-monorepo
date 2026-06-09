import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import { __resetLocalQuestionBankCacheForTests } from './localQuestionBank.js';

describe('loadEnigmaPulseQuestionPack (local bank)', () => {
  const prev = process.env.ENIGMA_PULSE_QUESTION_SOURCE;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENIGMA_PULSE_QUESTION_SOURCE;
    else process.env.ENIGMA_PULSE_QUESTION_SOURCE = prev;
    __resetLocalQuestionBankCacheForTests();
  });

  it('returns 12 full questions for General Knowledge / easy when source is local', async () => {
    process.env.ENIGMA_PULSE_QUESTION_SOURCE = 'local';
    const { loadEnigmaPulseQuestionPack } = await import('./questionProvider.js');
    const pack = await loadEnigmaPulseQuestionPack({
      category: 'General Knowledge',
      difficulty: 'easy',
      count: ENIGMA_PULSE.QUESTION_COUNT,
    });
    assert.equal(pack.full.length, ENIGMA_PULSE.QUESTION_COUNT);
    assert.equal(pack.client.length, ENIGMA_PULSE.QUESTION_COUNT);
    for (const q of pack.full) {
      assert.ok(q.id);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
    }
    for (const c of pack.client) {
      assert.ok(!('correctIndex' in c) || c.correctIndex === undefined);
    }
  });

  it('returns 12 for each lobby category at medium difficulty', async () => {
    process.env.ENIGMA_PULSE_QUESTION_SOURCE = 'local';
    const { loadEnigmaPulseQuestionPack } = await import('./questionProvider.js');
    for (const category of ['General Knowledge', 'Science', 'History', 'Sports']) {
      const pack = await loadEnigmaPulseQuestionPack({
        category,
        difficulty: 'medium',
        count: ENIGMA_PULSE.QUESTION_COUNT,
      });
      assert.equal(
        pack.full.length,
        ENIGMA_PULSE.QUESTION_COUNT,
        `bucket ${category}/medium`
      );
    }
  });
});
