/**
 * Lightweight deck-build timing for EnigmaPulse (opt-in verbose + always-on slow warnings).
 * Set ENIGMA_PULSE_DECK_TIMING=1 for JSON lines per match. P95 uses last N samples in-process.
 */

const VERBOSE =
  String(process.env.ENIGMA_PULSE_DECK_TIMING || '').toLowerCase() === '1' ||
  String(process.env.ENIGMA_PULSE_DECK_TIMING || '').toLowerCase() === 'true';

const SLOW_MS = Number(process.env.ENIGMA_PULSE_DECK_SLOW_MS || 800);
const MAX_SAMPLES = Number(process.env.ENIGMA_PULSE_DECK_TIMING_MAX_SAMPLES || 200);

/** @type {number[]} */
const totalMsSamples = [];

/**
 * @param {Record<string, unknown>} meta
 * @param {{
 *   totalMs: number;
 *   historyMs?: number;
 *   firestoreMs?: number;
 *   pickMs?: number;
 *   retryCount?: number;
 *   broadScan?: boolean;
 *   cacheHit?: boolean;
 * }} phases
 */
export function logEnigmaDeckBuild(meta, phases) {
  const payload = { ...meta, ...phases, t: new Date().toISOString() };
  const line = JSON.stringify(payload);
  if (VERBOSE) {
    console.info(`[EnigmaPulse][deck_timing] ${line}`);
  }
  if (Number(phases.totalMs) >= SLOW_MS) {
    console.warn(`[EnigmaPulse][deck_slow] ${line}`);
  }
  totalMsSamples.push(Number(phases.totalMs) || 0);
  if (totalMsSamples.length > MAX_SAMPLES) totalMsSamples.splice(0, totalMsSamples.length - MAX_SAMPLES);
}

export function enigmaDeckBuildTimingSummary() {
  if (!totalMsSamples.length) return { n: 0, p50: 0, p95: 0 };
  const sorted = [...totalMsSamples].sort((a, b) => a - b);
  const n = sorted.length;
  const p50 = sorted[Math.floor(n * 0.5)] ?? sorted[n - 1];
  const p95 = sorted[Math.floor(n * 0.95)] ?? sorted[n - 1];
  return { n, p50, p95 };
}

export function isEnigmaDeckTimingVerbose() {
  return VERBOSE;
}
