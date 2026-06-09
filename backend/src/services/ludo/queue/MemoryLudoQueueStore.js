import { computeMatchmakingDequeue } from './computeMatchmakingDequeue.js';

/**
 * In-process Ludo matchmaking queue (original Map behavior).
 */
export class MemoryLudoQueueStore {
  constructor() {
    /** @type {Map<string, any[]>} */
    this.ludoQueueBuckets = new Map();
    /** @type {Map<string, string>} socketId -> bucketKey */
    this.ludoQueueSocketToBucket = new Map();
  }

  async removeSocketFromLudoQueue(socketId) {
    const sid = String(socketId || '');
    if (!sid) return [];
    const bKey = this.ludoQueueSocketToBucket.get(sid);
    if (!bKey) return [];
    this.ludoQueueSocketToBucket.delete(sid);
    const arr = this.ludoQueueBuckets.get(bKey) || [];
    const removed = arr.filter((x) => x.socketId === sid);
    const next = arr.filter((x) => x.socketId !== sid);
    if (next.length === 0) this.ludoQueueBuckets.delete(bKey);
    else this.ludoQueueBuckets.set(bKey, next);
    return removed;
  }

  async removeUidFromAllLudoQueues(uidStr) {
    const uidNorm = String(uidStr || '').trim();
    if (!uidNorm) return [];
    const removedAll = [];
    for (const [bk, arr] of [...this.ludoQueueBuckets.entries()]) {
      const removed = arr.filter((x) => String(x.uid) === uidNorm);
      const next = arr.filter((x) => String(x.uid) !== uidNorm);
      if (removed.length) {
        removedAll.push(...removed);
        removed.forEach((x) => this.ludoQueueSocketToBucket.delete(x.socketId));
        if (next.length === 0) this.ludoQueueBuckets.delete(bk);
        else this.ludoQueueBuckets.set(bk, next);
      }
    }
    return removedAll;
  }

  async enqueueTicket(bucketKey, ticket) {
    if (!this.ludoQueueBuckets.has(bucketKey)) this.ludoQueueBuckets.set(bucketKey, []);
    this.ludoQueueBuckets.get(bucketKey).push(ticket);
    this.ludoQueueSocketToBucket.set(ticket.socketId, bucketKey);
  }

  async activeBucketKeys() {
    return [...this.ludoQueueBuckets.keys()];
  }

  /**
   * @param {string} bucketKey
   * @returns {Promise<null | { batch: any[], plan: ReturnType<typeof computeMatchmakingDequeue> }>}
   */
  async tryConsumeOneReadyBatch(bucketKey) {
    const arr = this.ludoQueueBuckets.get(bucketKey);
    if (!arr?.length) return null;
    const plan = computeMatchmakingDequeue(arr, Date.now());
    if (!plan) return null;
    const take = plan.take;
    const batch = arr.slice(0, take);
    const rest = arr.slice(take);
    if (rest.length) this.ludoQueueBuckets.set(bucketKey, rest);
    else this.ludoQueueBuckets.delete(bucketKey);
    batch.forEach((t) => this.ludoQueueSocketToBucket.delete(t.socketId));
    return { batch, plan };
  }
}
