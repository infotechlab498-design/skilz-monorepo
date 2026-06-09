import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BANK_PATH = path.join(__dirname, 'data', 'enigmaPulseQuestions.json');
const WORD_CIPHER_BANK_PATH = path.join(__dirname, 'data', 'wordCipherQuestions.json');
const SEQUENCE_IQ_FALLBACK_PATH = path.join(__dirname, 'data', 'sequenceIqLocalFallback.json');
const SYLLOGISM_FALLBACK_PATH = path.join(__dirname, 'data', 'syllogismLocalFallback.json');

/** @type {unknown[] | null} */
let cachedRows = null;
/** @type {unknown[] | null} */
let cachedWordCipherRows = null;
/** @type {unknown[] | null} */
let cachedSequenceFallbackRows = null;
/** @type {unknown[] | null} */
let cachedSyllogismFallbackRows = null;

function bankPath() {
  const raw = String(process.env.ENIGMA_PULSE_QUESTIONS_PATH || '').trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  return DEFAULT_BANK_PATH;
}

function loadAllRows() {
  if (cachedRows) return cachedRows;
  const p = bankPath();
  const raw = readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`[EnigmaPulse] local question bank must be a JSON array: ${p}`);
  }
  cachedRows = parsed;
  return cachedRows;
}

function loadWordCipherRows() {
  if (cachedWordCipherRows) return cachedWordCipherRows;
  const raw = readFileSync(WORD_CIPHER_BANK_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`[EnigmaPulse] word cipher local bank must be a JSON array: ${WORD_CIPHER_BANK_PATH}`);
  }
  cachedWordCipherRows = parsed;
  return cachedWordCipherRows;
}

/**
 * Stable id for file-backed rows (matches must compare questionId across sockets).
 * @param {Record<string, unknown>} row
 */
export function stableLocalQuestionId(row) {
  const cat = String(row.category ?? '');
  const diff = String(row.difficulty ?? '');
  const text = String(row.text ?? '');
  const h = createHash('sha256').update(`${cat}|${diff}|${text}`).digest('hex').slice(0, 20);
  return `epq_${h}`;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Same contract as Firestore {@link import('./firestoreRepos.js').getQuestions}:
 * filter by category + difficulty, shuffle, cap list length.
 * @param {{ category: string; difficulty: string; count: number }} args
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function getLocalQuestions({ category, difficulty, count }) {
  const rows = loadAllRows();
  const cat = String(category || '').trim();
  const diff = String(difficulty || '').trim().toLowerCase();
  const cap = Math.max(40, Number(count) * 4);
  const matched = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    if (String(r.category || '').trim() !== cat) continue;
    if (String(r.difficulty || '').trim().toLowerCase() !== diff) continue;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : stableLocalQuestionId(r);
    matched.push({ ...r, id });
  }
  shuffleInPlace(matched);
  return matched.slice(0, cap);
}

/**
 * Dedicated local bank for the `word_cipher` game mode only.
 * @param {{ category: string; difficulty: string; count: number }} args
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function getLocalWordCipherQuestions({ category, difficulty, count }) {
  const rows = loadWordCipherRows();
  const cat = String(category || '').trim();
  const diff = String(difficulty || '').trim().toLowerCase();
  const cap = Math.max(40, Number(count) * 4);
  const matched = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    if (String(r.category || '').trim() !== cat) continue;
    if (String(r.difficulty || '').trim().toLowerCase() !== diff) continue;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : stableLocalQuestionId(r);
    matched.push({ ...r, id, type: 'word_cipher' });
  }
  shuffleInPlace(matched);
  return matched.slice(0, cap);
}

function loadSequenceIqFallbackRows() {
  if (cachedSequenceFallbackRows) return cachedSequenceFallbackRows;
  const raw = readFileSync(SEQUENCE_IQ_FALLBACK_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`[EnigmaPulse] sequence IQ fallback bank must be a JSON array: ${SEQUENCE_IQ_FALLBACK_PATH}`);
  }
  cachedSequenceFallbackRows = parsed;
  return cachedSequenceFallbackRows;
}

function loadSyllogismFallbackRows() {
  if (cachedSyllogismFallbackRows) return cachedSyllogismFallbackRows;
  const raw = readFileSync(SYLLOGISM_FALLBACK_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`[EnigmaPulse] syllogism fallback bank must be a JSON array: ${SYLLOGISM_FALLBACK_PATH}`);
  }
  cachedSyllogismFallbackRows = parsed;
  return cachedSyllogismFallbackRows;
}

/**
 * File-backed Sequence IQ rows when Firestore pool is thin (type riddle_sequence).
 * @param {{ category?: string; count?: number }} [args]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function getLocalSequenceIqFallbackRows({ category, count = 120 } = {}) {
  const rows = loadSequenceIqFallbackRows();
  const cat = String(category || '').trim();
  const cap = Math.max(20, Number(count) || 120);
  const matched = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    if (cat && String(r.category || '').trim() !== cat) continue;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : stableLocalQuestionId(r);
    matched.push({ ...r, id, type: 'riddle_sequence' });
  }
  shuffleInPlace(matched);
  return matched.slice(0, cap);
}

/**
 * File-backed Syllogism rows when Firestore pool is thin.
 * @param {{ category?: string; count?: number }} [args]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function getLocalSyllogismFallbackRows({ category, count = 120 } = {}) {
  const rows = loadSyllogismFallbackRows();
  const cat = String(category || 'Syllogism').trim();
  const cap = Math.max(12, Number(count) || 120);
  const matched = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    if (cat && String(r.category || '').trim() !== cat) continue;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : stableLocalQuestionId(r);
    matched.push({ ...r, id, type: 'syllogism', category: 'Syllogism' });
  }
  shuffleInPlace(matched);
  return matched.slice(0, cap);
}

/** Test helper: reset module cache after mutating env path. */
export function __resetLocalQuestionBankCacheForTests() {
  cachedRows = null;
  cachedWordCipherRows = null;
  cachedSequenceFallbackRows = null;
  cachedSyllogismFallbackRows = null;
}
