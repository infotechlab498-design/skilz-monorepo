/**
 * Periodically drop finished Ludo rooms from the in-memory store to cap RSS under load.
 * @param {{ entries: () => Iterable<[string, object]>, delete: (id: string) => unknown }} roomStateStore
 * @param {{ ms?: number, intervalMs?: number }} [opts]
 */
export function startLudoRoomGc(roomStateStore, opts = {}) {
  const maxAgeMs = Math.max(0, Number(opts.ms ?? process.env.LUDO_ROOM_GC_MS ?? 0));
  if (!maxAgeMs) return () => {};
  const intervalMs = Math.min(
    3600000,
    Math.max(30000, Number(opts.intervalMs ?? process.env.LUDO_ROOM_GC_INTERVAL_MS ?? 120000))
  );
  const tid = setInterval(() => {
    const now = Date.now();
    try {
      for (const [roomId, st] of roomStateStore.entries()) {
        if (!st || st.status !== 'FINISHED') continue;
        const lu = Number(st.lastUpdated || 0);
        if (lu && now - lu > maxAgeMs) {
          roomStateStore.delete(roomId);
        }
      }
    } catch (e) {
      console.warn('[ludo-room-gc] sweep error:', e?.message || e);
    }
  }, intervalMs);
  return () => clearInterval(tid);
}
