import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichQuestionForPlay, isAnswerCorrect, normalizeAnswer } from './AnswerValidator.js';

test('normalizeAnswer strips case and punctuation', () => {
  assert.equal(normalizeAnswer('  Hello, World!!  '), 'hello world');
});

test('legacy question without acceptedAnswers falls back to correct option', () => {
  const q = enrichQuestionForPlay({
    text: 'Q?',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correctIndex: 1,
  });
  assert.ok(q.acceptedAnswers.includes('Beta'));
  assert.equal(isAnswerCorrect(normalizeAnswer('beta'), q), true);
  assert.equal(isAnswerCorrect(normalizeAnswer('BETA!'), q), true);
});

test('acceptedAnswers array and typo tolerance', () => {
  const q = enrichQuestionForPlay({
    text: 'Capital of France?',
    options: ['London', 'Paris', 'Berlin', 'Madrid'],
    correctIndex: 1,
    acceptedAnswers: ['Paris', 'paris france'],
    normalizedAnswer: 'paris',
  });
  assert.equal(isAnswerCorrect(normalizeAnswer('paris'), q), true);
  assert.equal(isAnswerCorrect(normalizeAnswer('Pari'), q), true); // distance 1
});
