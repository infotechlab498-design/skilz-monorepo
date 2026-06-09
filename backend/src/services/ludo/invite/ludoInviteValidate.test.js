import test from 'node:test';
import assert from 'node:assert/strict';
import { isInviteValidForJoin } from './ludoInviteValidate.js';

test('isInviteValidForJoin accepts matching pending invite', () => {
  const inv = {
    inviteId: 'i1',
    fromUid: 'h',
    targetUid: 'g',
    roomId: 'r1',
    status: 'pending',
  };
  assert.equal(isInviteValidForJoin(inv, 'r1', 'g', 'h'), true);
});

test('isInviteValidForJoin rejects wrong guest', () => {
  const inv = { fromUid: 'h', targetUid: 'g', roomId: 'r1', status: 'pending' };
  assert.equal(isInviteValidForJoin(inv, 'r1', 'other', 'h'), false);
});

test('isInviteValidForJoin rejects wrong host', () => {
  const inv = { fromUid: 'h', targetUid: 'g', roomId: 'r1', status: 'pending' };
  assert.equal(isInviteValidForJoin(inv, 'r1', 'g', 'impostor'), false);
});
