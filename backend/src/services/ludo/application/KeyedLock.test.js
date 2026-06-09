import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyedLock } from './KeyedLock.js';

test('KeyedLock serializes same-key operations', async () => {
  const lock = new KeyedLock();
  const order = [];

  await Promise.all([
    lock.run('room-1', async () => {
      order.push('a:start');
      await new Promise((r) => setTimeout(r, 15));
      order.push('a:end');
    }),
    lock.run('room-1', async () => {
      order.push('b:start');
      order.push('b:end');
    }),
  ]);

  assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end']);
});

test('KeyedLock allows different keys to progress independently', async () => {
  const lock = new KeyedLock();
  const seen = new Set();

  await Promise.all([
    lock.run('room-a', async () => {
      seen.add('a');
      await new Promise((r) => setTimeout(r, 10));
    }),
    lock.run('room-b', async () => {
      seen.add('b');
      await new Promise((r) => setTimeout(r, 10));
    }),
  ]);

  assert.equal(seen.has('a'), true);
  assert.equal(seen.has('b'), true);
});
