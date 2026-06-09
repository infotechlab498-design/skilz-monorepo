import { createClient } from 'redis';
import { MemoryLudoQueueStore } from './MemoryLudoQueueStore.js';
import { RedisLudoQueueStore } from './RedisLudoQueueStore.js';

/**
 * @returns {{ store: MemoryLudoQueueStore | RedisLudoQueueStore, close?: () => Promise<void> }}
 */
export async function createLudoQueueStore() {
  const wantRedis =
    String(process.env.LUDO_QUEUE_BACKEND || '').toLowerCase() === 'redis' &&
    String(process.env.REDIS_URL || '').trim();

  if (!wantRedis) {
    return { store: new MemoryLudoQueueStore() };
  }

  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => {
    console.warn('[ludo-queue] Redis client error:', err?.message || err);
  });
  await client.connect();
  console.log('[ludo-queue] Using Redis backend for Ludo matchmaking queues');
  return {
    store: new RedisLudoQueueStore(client),
    close: async () => {
      try {
        await client.quit();
      } catch {
        /* ignore */
      }
    },
  };
}
