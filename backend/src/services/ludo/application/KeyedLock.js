export class KeyedLock {
  constructor() {
    /** @type {Map<string, Promise<void>>} */
    this.queues = new Map();
  }

  async run(key, fn) {
    const prior = this.queues.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const queued = prior.then(() => gate);
    this.queues.set(key, queued);
    await prior;
    try {
      return await fn();
    } finally {
      release();
      if (this.queues.get(key) === queued) {
        this.queues.delete(key);
      }
    }
  }
}
