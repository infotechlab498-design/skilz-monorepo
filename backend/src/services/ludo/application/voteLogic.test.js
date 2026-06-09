import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVoteSummary, resolveVoteOutcome } from './voteLogic.js';

test('computeVoteSummary counts only lobby member votes', () => {
  const summary = computeVoteSummary(
    { u1: 'ADD_BOTS', u2: 'HUMANS_ONLY', outsider: 'ADD_BOTS' },
    ['u1', 'u2']
  );
  assert.deepEqual(summary, { addBotsCount: 1, humanOnlyCount: 1 });
});

test('resolveVoteOutcome defaults ties to add bots', () => {
  const outcome = resolveVoteOutcome(
    { u1: 'ADD_BOTS', u2: 'HUMANS_ONLY' },
    ['u1', 'u2']
  );
  assert.equal(outcome.outcome, 'ADD_BOTS');
  assert.equal(outcome.addBotsCount, 1);
  assert.equal(outcome.humanOnlyCount, 1);
});

test('resolveVoteOutcome prefers humans only when majority votes for it', () => {
  const outcome = resolveVoteOutcome(
    { u1: 'HUMANS_ONLY', u2: 'HUMANS_ONLY', u3: 'ADD_BOTS' },
    ['u1', 'u2', 'u3']
  );
  assert.equal(outcome.outcome, 'HUMANS_ONLY');
});
