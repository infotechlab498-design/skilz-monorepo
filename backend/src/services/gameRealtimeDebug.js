/**
 * Verbose logs for realtime games (console on server).
 * Test checkpoints log PASS/FAIL when an invariant is checked.
 *
 * Set REALTIME_DEBUG=0 to silence [DEBUG] lines only (TRIVIA/MATH_RUSH tags stay).
 */

const debugOn = () => process.env.REALTIME_DEBUG !== '0';

/** Unified launcher-style logs (match user-facing debug format). */
export function debugRealtime(area, tag, data) {
  if (!debugOn()) return;
  if (data !== undefined) console.log(`[DEBUG][${area}] ${tag}:`, data);
  else console.log(`[DEBUG][${area}] ${tag}`);
}

export function ludoLog(tag, data) {
  if (!debugOn()) return;
  if (data !== undefined) console.log(`[DEBUG][LUDO] ${tag}:`, data);
  else console.log(`[DEBUG][LUDO] ${tag}`);
}

export function platformLog(tag, data) {
  if (!debugOn()) return;
  if (data !== undefined) console.log(`[DEBUG][SERVER] ${tag}:`, data);
  else console.log(`[DEBUG][SERVER] ${tag}`);
}

export function triviaLog(tag, message, extra) {
  if (extra !== undefined) console.log(`[TRIVIA] ${tag}:`, message, extra);
  else console.log(`[TRIVIA] ${tag}:`, message);
}

export function mathRushLog(tag, message, extra) {
  if (extra !== undefined) console.log(`[MATH_RUSH] ${tag}:`, message, extra);
  else console.log(`[MATH_RUSH] ${tag}:`, message);
}

export function triviaCheckpoint(name, pass, detail) {
  console.log(`[TRIVIA][TEST] ${name}: ${pass ? 'PASS' : 'FAIL'}`, detail ?? '');
}

export function mathRushCheckpoint(name, pass, detail) {
  console.log(`[MATH_RUSH][TEST] ${name}: ${pass ? 'PASS' : 'FAIL'}`, detail ?? '');
}
