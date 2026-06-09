import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isFriendAvailableForLudoInvite,
  isPresenceOnlineFresh,
  parseLastSeenMs,
} from './ludoOnlinePlayersFilter.js';

test('parseLastSeenMs handles millis number', () => {
  assert.equal(parseLastSeenMs(1_700_000_000_000), 1_700_000_000_000);
});

test('isPresenceOnlineFresh respects max age', () => {
  const now = 1_000_000;
  assert.equal(isPresenceOnlineFresh({ online: true, lastSeen: now - 1000 }, now, 5000), true);
  assert.equal(isPresenceOnlineFresh({ online: true, lastSeen: now - 60_000 }, now, 45_000), false);
  assert.equal(isPresenceOnlineFresh({ online: false, lastSeen: now }, now, 45_000), false);
});

test('isFriendAvailableForLudoInvite excludes queue and room', () => {
  const now = 10_000_000;
  const base = { online: true, lastSeen: now - 1000, status: 'online', game: 'ludo' };
  assert.equal(
    isFriendAvailableForLudoInvite(base, {}, now, { maxAgeMs: 45_000, excludeQueued: true }),
    true
  );
  assert.equal(
    isFriendAvailableForLudoInvite(base, { inQueue: true }, now, { maxAgeMs: 45_000, excludeQueued: true }),
    false
  );
  assert.equal(
    isFriendAvailableForLudoInvite(base, { inQueue: true }, now, { maxAgeMs: 45_000, excludeQueued: false }),
    true
  );
  assert.equal(
    isFriendAvailableForLudoInvite(base, { ludoRoomId: 'room1' }, now, { maxAgeMs: 45_000, excludeQueued: true }),
    false
  );
  assert.equal(
    isFriendAvailableForLudoInvite(
      { ...base, status: 'in-game' },
      {},
      now,
      { maxAgeMs: 45_000, excludeQueued: true }
    ),
    false
  );
});
