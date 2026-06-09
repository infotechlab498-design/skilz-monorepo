import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COPY_PATH = join(__dirname, '../../../../.vibecheck/truthpack/copy.json');

function readTruthpackCopy() {
  try {
    if (!existsSync(COPY_PATH)) return null;
    return JSON.parse(readFileSync(COPY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function enigmaErrors() {
  const c = readTruthpackCopy();
  return c?.games?.enigmaPulse?.errors || {};
}

/** User-visible string for socket ERROR when the question pool cannot build a match. */
export function epInsufficientQuestionsMessage() {
  const m = enigmaErrors().insufficientQuestions;
  return typeof m === 'string' && m.trim() ? m.trim() : 'Not enough questions available';
}

/** User-visible string when Syllogism cannot fill a 10-card deck per player. */
export function epSyllogismDeckIncompleteMessage() {
  const m = enigmaErrors().syllogismDeckIncomplete;
  return typeof m === 'string' && m.trim()
    ? m.trim()
    : 'Syllogism requires a full 10-question deck per player';
}

/** User-visible string when Word Cipher cannot fill 20 alternating rounds (10 per player). */
export function epWordCipherDeckIncompleteMessage() {
  const m = enigmaErrors().wordCipherDeckIncomplete;
  return typeof m === 'string' && m.trim()
    ? m.trim()
    : 'Word Cipher requires 10 unique questions per player — not enough in the question bank';
}
