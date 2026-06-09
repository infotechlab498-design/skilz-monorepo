import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMatchmakingDequeue } from './computeMatchmakingDequeue.js';
import { LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE } from './ludoMatchVariants.js';

function ticket(criteria, joinedAt) {
  return { criteria, joinedAt };
}

test('classic: four players flush without wait', () => {
  const crit = { matchVariant: LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE, waitWindowMs: 12000, entryFee: 10, turnTimerSec: 30, settings: {} };
  const now = 1_000_000;
  const t = [0, 1, 2, 3].map((i) => ticket({ ...crit }, now - 1000 * i));
  const plan = computeMatchmakingDequeue(t, now);
  assert.ok(plan);
  assert.equal(plan.take, 4);
  assert.ok(plan.classic);
  assert.equal(plan.classic.needsVote, false);
  assert.equal(plan.classic.soloFallback1v1, false);
});

test('classic: solo fallback after wait window', () => {
  const crit = { matchVariant: LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE, waitWindowMs: 5000, entryFee: 10, turnTimerSec: 30, settings: {} };
  const now = 20_000;
  const t = [ticket({ ...crit }, now - 6000)];
  const plan = computeMatchmakingDequeue(t, now);
  assert.ok(plan);
  assert.equal(plan.take, 1);
  assert.equal(plan.classic.soloFallback1v1, true);
});

test('classic: two players after wait triggers vote', () => {
  const crit = { matchVariant: LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE, waitWindowMs: 2000, entryFee: 10, turnTimerSec: 30, settings: {} };
  const now = 10_000;
  const t = [ticket({ ...crit }, now - 3000), ticket({ ...crit }, now - 2000)];
  const plan = computeMatchmakingDequeue(t, now);
  assert.ok(plan);
  assert.equal(plan.take, 2);
  assert.equal(plan.classic.needsVote, true);
});
