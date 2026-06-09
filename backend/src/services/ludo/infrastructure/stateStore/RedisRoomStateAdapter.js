import { MemoryRoomStateAdapter } from './MemoryRoomStateAdapter.js';

/**
 * Memory-authoritative room state with async write-through to Redis for recovery / multi-step backup.
 * Reads stay in-process (same as MemoryRoomStateAdapter); sets/deletes mirror to Redis with TTL.
 * For full horizontal gameplay, follow up with an async RoomStateStore migration (see scaling doc).
 */
export class RedisMirrorRoomStateAdapter {
  /**
   * @param {Map<string, object>} seedMap
   * @param {import('redis').RedisClientType} redisClient
   * @param {{ keyPrefix?: string, ttlSec?: number }} [options]
   */
  constructor(seedMap, redisClient, options = {}) {
    this.inner = new MemoryRoomStateAdapter(seedMap);
    this.redis = redisClient;
    this.keyPrefix = options.keyPrefix ?? 'ludo:room:';
    this.ttlSec = Math.max(60, Number(options.ttlSec) || 86400);
  }

  roomKey(roomId) {
    return `${this.keyPrefix}${roomId}`;
  }

  get(roomId) {
    return this.inner.get(roomId);
  }

  set(roomId, state) {
    this.inner.set(roomId, state);
    void this.redis
      .set(this.roomKey(roomId), JSON.stringify(state), { EX: this.ttlSec })
      .catch((e) => {
        console.warn('[ludo-room-redis] mirror set failed', String(roomId).slice(0, 8), e?.message || e);
      });
    return state;
  }

  delete(roomId) {
    void this.redis.del(this.roomKey(roomId)).catch(() => {});
    return this.inner.delete(roomId);
  }

  has(roomId) {
    return this.inner.has(roomId);
  }

  entries() {
    return this.inner.entries();
  }
}
