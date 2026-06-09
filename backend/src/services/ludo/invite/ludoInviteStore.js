/**
 * Pending Ludo socket invites — memory or Redis (when redisClient connected).
 * Keys: data JSON, per-target set, per-room set (for host-close cleanup).
 */

function dataKey(id) {
  return `ludo:invite:data:${id}`;
}
function roomKey(roomId) {
  return `ludo:invite:room:${roomId}`;
}
function toKey(uid) {
  return `ludo:invite:to:${uid}`;
}

/**
 * @param {import('redis').RedisClientType | null} redisClient
 */
export function createLudoInviteStore(redisClient) {
  const useRedis = Boolean(redisClient && typeof redisClient.get === 'function');
  /** @type {Map<string, { inviteId: string, fromUid: string, targetUid: string, roomId: string, expiresAt: number, status?: string, fromDisplayName?: string }>} */
  const memory = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  /**
   * @param {{ inviteId: string, fromUid: string, targetUid: string, roomId: string, expiresAt: number, status?: string, fromDisplayName?: string }} record
   * @param {number} ttlSec
   */
  async function put(record, ttlSec) {
    const sec = Math.min(600, Math.max(15, ttlSec));
    const json = JSON.stringify(record);
    if (useRedis) {
      await redisClient.setEx(dataKey(record.inviteId), sec, json);
      await redisClient.sAdd(toKey(record.targetUid), record.inviteId);
      await redisClient.sAdd(roomKey(record.roomId), record.inviteId);
      await redisClient.expire(toKey(record.targetUid), sec + 10);
      await redisClient.expire(roomKey(record.roomId), sec + 10);
    } else {
      memory.set(record.inviteId, { ...record });
    }
  }

  /** @param {string} inviteId */
  async function get(inviteId) {
    const id = String(inviteId || '').trim();
    if (!id) return null;
    if (useRedis) {
      const raw = await redisClient.get(dataKey(id));
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return memory.get(id) || null;
  }

  /** @param {string} inviteId */
  async function del(inviteId) {
    const id = String(inviteId || '').trim();
    if (!id) return;
    const rec = await get(id);
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
    if (useRedis) {
      if (rec) {
        await redisClient.del(dataKey(id));
        await redisClient.sRem(toKey(rec.targetUid), id);
        await redisClient.sRem(roomKey(rec.roomId), id);
      } else {
        await redisClient.del(dataKey(id));
      }
      return;
    }
    memory.delete(id);
  }

  /** @param {string} roomId */
  async function delAllForRoom(roomId) {
    const rid = String(roomId || '').trim();
    if (!rid) return;
    if (useRedis) {
      const ids = await redisClient.sMembers(roomKey(rid));
      for (const id of ids || []) {
        await del(String(id));
      }
      await redisClient.del(roomKey(rid));
      return;
    }
    for (const [id, rec] of memory) {
      if (String(rec.roomId) === rid) {
        await del(id);
      }
    }
  }

  /**
   * @param {string} inviteId
   * @param {number} ttlMs
   * @param {(id: string) => void | Promise<void>} onExpire
   */
  function scheduleExpiry(inviteId, ttlMs, onExpire) {
    const id = String(inviteId || '').trim();
    if (!id) return;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      timers.delete(id);
      void Promise.resolve(onExpire(id)).catch(() => {});
    }, Math.min(600_000, Math.max(1000, ttlMs)));
    timers.set(id, t);
  }

  /** @param {string} inviteId */
  function cancelExpiry(inviteId) {
    const id = String(inviteId || '').trim();
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
  }

  return { put, get, del, delAllForRoom, scheduleExpiry, cancelExpiry, useRedis };
}
