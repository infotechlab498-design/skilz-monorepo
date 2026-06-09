/**
 * Pure checks for invite join validation (unit-tested).
 * @param {object | null} inv
 * @param {string} roomId
 * @param {string} uid
 * @param {string} hostUid
 */
export function isInviteValidForJoin(inv, roomId, uid, hostUid) {
  if (!inv || typeof inv !== 'object') return false;
  if (String(inv.roomId) !== String(roomId)) return false;
  if (String(inv.targetUid) !== String(uid)) return false;
  if (String(inv.fromUid) !== String(hostUid)) return false;
  if ((inv.status ?? 'pending') !== 'pending') return false;
  return true;
}
