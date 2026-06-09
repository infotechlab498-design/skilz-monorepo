import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENIGMA_PULSE_ADMIN_CATEGORIES,
  WORD_CIPHER_CATEGORY,
  normalizeEnigmaPulseAdminCategory,
  normalizeWordCipherCategory,
} from '../../../../shared/enigmaPulse/categories.js';
import { validateQueuePayload } from '../../../../shared/enigmaPulse/validators.js';
import { rowMatchesEnigmaGameKey } from './enigmaQuestionSelection.js';

const mcqRow = (overrides = {}) => ({
  question: 'Sample riddle?',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
  type: 'word_cipher',
  category: WORD_CIPHER_CATEGORY,
  difficulty: 'medium',
  ...overrides,
});

describe('Word Cipher brain_twisters category', () => {
  it('normalizes brain_twisters aliases', () => {
    assert.equal(normalizeWordCipherCategory('brain_twisters'), WORD_CIPHER_CATEGORY);
    assert.equal(normalizeWordCipherCategory('Brain Twisters'), WORD_CIPHER_CATEGORY);
    assert.equal(normalizeWordCipherCategory('brain-twisters'), WORD_CIPHER_CATEGORY);
  });

  it('includes brain_twisters in admin categories', () => {
    assert.ok(ENIGMA_PULSE_ADMIN_CATEGORIES.includes(WORD_CIPHER_CATEGORY));
    assert.equal(normalizeEnigmaPulseAdminCategory('brain_twisters'), WORD_CIPHER_CATEGORY);
  });

  it('forces queue category for word_cipher gameKey', () => {
    const payload = validateQueuePayload({
      gameKey: 'word_cipher',
      category: 'General Knowledge',
      difficulty: 'easy',
    });
    assert.equal(payload.category, WORD_CIPHER_CATEGORY);
    assert.equal(payload.gameKey, 'word_cipher');
  });

  it('matches only word_cipher rows in brain_twisters', () => {
    assert.equal(rowMatchesEnigmaGameKey(mcqRow(), 'word_cipher'), true);
    assert.equal(rowMatchesEnigmaGameKey(mcqRow({ category: 'General Knowledge' }), 'word_cipher'), false);
    assert.equal(rowMatchesEnigmaGameKey(mcqRow({ type: 'riddle_classic' }), 'word_cipher'), false);
  });

  it('excludes brain_twisters from other Enigma modes', () => {
    const row = mcqRow({ type: 'riddle_classic' });
    assert.equal(rowMatchesEnigmaGameKey(row, 'riddle_classic'), false);
    assert.equal(rowMatchesEnigmaGameKey(mcqRow({ type: 'riddle_sequence' }), 'riddle_sequence'), false);
  });
});
