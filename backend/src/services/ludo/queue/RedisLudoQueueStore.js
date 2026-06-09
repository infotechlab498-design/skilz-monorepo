import crypto from 'crypto';
import { computeMatchmakingDequeue } from './computeMatchmakingDequeue.js';
import { incMetric } from '../infrastructure/observability/ludoMetrics.js';

function hashBucketKey(bucketKey) {
  return crypto.createHash('sha256').update(String(bucketKey), 'utf8').digest('hex');
}

/**
 * Redis-backed Ludo queue: ordered tickets per bucket hash, atomic trim via WATCH/MULTI/EXEC.
 */
export class RedisLudoQueueStore {
  /**
   * @param {import('redis').RedisClientType} client Connected redis client (caller owns lifecycle)
   */
  constructor(client) {
    this.client = client;
    this.BUCKETS = 'ludo:q:buckets';
  }

  bucketKeyRedisKey(h) {
    return `ludo:q:bk:${h}`;
  }

  listKey(h) {
    return `ludo:q:l:${h}`;
  }

  sockKey(sid) {
    return `ludo:q:s:${sid}`;
  }

  uidKey(uid) {
    return `ludo:q:u:${uid}`;
  }

  mutKey(h) {
    return `ludo:q:m:${h}`;
  }

  async enqueueTicket(bucketKey, ticket) {
    const h = hashBucketKey(bucketKey);
    const json = JSON.stringify(ticket);
    const p = this.client.multi();
    p.rPush(this.listKey(h), json);
    p.set(this.sockKey(ticket.socketId), h);
    p.set(this.bucketKeyRedisKey(h), bucketKey);
    p.sAdd(this.uidKey(String(ticket.uid)), h);
    p.sAdd(this.BUCKETS, h);
    await p.exec();
  }

  async removeSocketFromLudoQueue(socketId) {
    const sid = String(socketId || '');
    if (!sid) return [];
    const h = await this.client.get(this.sockKey(sid));
    if (!h) return [];
    const lk = this.listKey(h);
    const mk = this.mutKey(h);
    const got = await this.client.set(mk, '1', { NX: true, EX: 5 });
    if (!got) {
      await new Promise((r) => setTimeout(r, 40));
      return this.removeSocketFromLudoQueue(socketId);
    }
    try {
      const raw = await this.client.lRange(lk, 0, -1);
      const tickets = raw.map((j) => JSON.parse(j));
      const removed = tickets.filter((x) => x.socketId === sid);
      const next = tickets.filter((x) => x.socketId !== sid);
      const p = this.client.multi();
      p.del(lk);
      for (const t of next) {
        p.rPush(lk, JSON.stringify(t));
      }
      p.del(this.sockKey(sid));
      for (const t of removed) {
        p.sRem(this.uidKey(String(t.uid)), h);
      }
      await p.exec();
      if (next.length === 0) {
        await this.client.del(this.bucketKeyRedisKey(h));
        await this.client.sRem(this.BUCKETS, h);
      }
      return removed;
    } finally {
      await this.client.del(mk).catch(() => {});
    }
  }

  async removeUidFromAllLudoQueues(uidStr) {
    const uidNorm = String(uidStr || '').trim();
    if (!uidNorm) return [];
    const hashes = await this.client.sMembers(this.uidKey(uidNorm));
    const removedAll = [];
    for (const h of hashes) {
      const mk = this.mutKey(h);
      const got = await this.client.set(mk, '1', { NX: true, EX: 5 });
      if (!got) continue;
      try {
        const lk = this.listKey(h);
        const raw = await this.client.lRange(lk, 0, -1);
        const tickets = raw.map((j) => JSON.parse(j));
        const removed = tickets.filter((x) => String(x.uid) === uidNorm);
        if (!removed.length) continue;
        const next = tickets.filter((x) => String(x.uid) !== uidNorm);
        const p = this.client.multi();
        p.del(lk);
        for (const t of next) {
          p.rPush(lk, JSON.stringify(t));
        }
        for (const t of removed) {
          p.del(this.sockKey(t.socketId));
          p.sRem(this.uidKey(uidNorm), h);
        }
        await p.exec();
        removedAll.push(...removed);
        if (next.length === 0) {
          await this.client.del(this.bucketKeyRedisKey(h));
          await this.client.sRem(this.BUCKETS, h);
        }
      } finally {
        await this.client.del(mk).catch(() => {});
      }
    }
    return removedAll;
  }

  async activeBucketKeys() {
    const hashes = await this.client.sMembers(this.BUCKETS);
    const out = [];
    for (const h of hashes) {
      const bk = await this.client.get(this.bucketKeyRedisKey(h));
      if (bk) out.push(bk);
    }
    return [...new Set(out)];
  }

  /**
   * @param {string} bucketKey logical bucket key (not hash)
   * @returns {Promise<null | { batch: any[], plan: ReturnType<typeof computeMatchmakingDequeue> }>}
   */
  async tryConsumeOneReadyBatch(bucketKey) {
    const h = hashBucketKey(bucketKey);
    const lk = this.listKey(h);
    const now = Date.now();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await this.client.watch(lk);
      const raw = await this.client.lRange(lk, 0, -1);
      if (!raw.length) {
        await this.client.unwatch();
        return null;
      }
      const tickets = raw.map((j) => JSON.parse(j));
      const plan = computeMatchmakingDequeue(tickets, now);
      if (!plan) {
        await this.client.unwatch();
        return null;
      }
      const take = plan.take;
      const batch = tickets.slice(0, take);
      const multi = this.client.multi();
      multi.lTrim(lk, take, -1);
      for (const t of batch) {
        multi.del(this.sockKey(t.socketId));
        multi.sRem(this.uidKey(String(t.uid)), h);
      }
      const execRes = await multi.exec();
      if (execRes === null) {
        incMetric('queueFlushContention');
        continue;
      }
      const len = await this.client.lLen(lk);
      if (len === 0) {
        await this.client.del(this.bucketKeyRedisKey(h));
        await this.client.sRem(this.BUCKETS, h);
      }
      return { batch, plan };
    }
    return null;
  }
}
