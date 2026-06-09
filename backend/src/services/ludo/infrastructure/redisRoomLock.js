/**
 * Best-effort per-room mutex in Redis (`SET key NX PX`).
 * Optional use when coordinating multi-node writers; keep TTL short.
 */
export async function withRedisRoomLock(redis, roomId, ttlMs, fn) {
  if (!redis || !roomId) return fn();
  const key = `ludo:lock:room:${roomId}`;
  const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const ok = await redis.set(key, token, { NX: true, PX: Math.min(30000, Math.max(100, ttlMs)) });
  if (!ok) {
    const err = new Error('ROOM_LOCK_BUSY');
    err.code = 'ROOM_LOCK_BUSY';
    throw err;
  }
  try {
    return await fn();
  } finally {
    try {
      const v = await redis.get(key);
      if (v === token) await redis.del(key);
    } catch {
      /* ignore */
    }
  }
}
