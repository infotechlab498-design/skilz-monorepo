import { ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import { enigmaGameKeyForQuestionSelection, isPatternRecognitionGameKey, isWordCipherGameKey } from '../../../../shared/enigmaPulse/gameKeys.js';
import {
  normalizeEnigmaPulseCategory,
  normalizeWordCipherCategory,
  ENIGMA_PULSE_LOBBY_CATEGORIES,
  WORD_CIPHER_CATEGORY,
} from '../../../../shared/enigmaPulse/categories.js';
import { getAdminFirestore } from '../firebaseAdmin.js';
import { enrichQuestionForPlay } from './engine/AnswerValidator.js';
import {
  getLocalQuestions,
  getLocalSequenceIqFallbackRows,
  getLocalSyllogismFallbackRows,
  stableLocalQuestionId,
} from './localQuestionBank.js';
import {
  loadEnigmaPlayedIdSet,
  resetEnigmaPlayedHistory,
} from './enigmaPlayedHistory.js';
import { logEnigmaDeckBuild } from './enigmaDeckTiming.js';
import {
  getSyllogismPoolCached,
  setSyllogismPoolCache,
  syllogismPoolCacheKey,
} from './syllogismPoolCache.js';
import {
  enigmaCandidatePoolCacheKey,
  enigmaSequenceIqMergedPoolCacheKey,
  getEnigmaCandidatePoolCached,
  setEnigmaCandidatePoolCache,
} from './enigmaCandidatePoolCache.js';

export function enigmaQuestionSourceMode() {
  const raw = String(process.env.ENIGMA_PULSE_QUESTION_SOURCE || 'auto').toLowerCase().trim();
  if (raw === 'local' || raw === 'firestore' || raw === 'auto') return raw;
  return 'auto';
}

/**
 * Legacy / console uploads may omit `options` and use option1–4.
 * @param {Record<string, unknown>} d
 */
function optionsFromDocData(d) {
  if (Array.isArray(d.options) && d.options.length) {
    return d.options.map((x) => String(x ?? '').trim());
  }
  return [d.option1, d.option2, d.option3, d.option4].map((x) => String(x ?? '').trim());
}

/** Treat missing `active` as on; only explicit false disables. */
function isDocActiveForPlay(d) {
  if (d.active === false) return false;
  if (String(d.active).toLowerCase() === 'false') return false;
  return true;
}

/**
 * Firestore category strings to try for a lobby chip. Trivia admin maps most CSV
 * categories (including "General Knowledge") to `history`, so we widen GK queries.
 * @param {string} canonicalLobbyCategory
 */
function firestoreCategoryQueryValues(canonicalLobbyCategory) {
  const c = String(canonicalLobbyCategory || '').trim();
  if (!c) return [];
  const out = new Set([c]);
  const lower = c.toLowerCase();
  out.add(lower);
  out.add(lower.replace(/\s+/g, '_'));
  if (c === 'General Knowledge' || lower === 'general knowledge') {
    out.add('history');
  }
  if (c === 'History' || lower === 'history') {
    out.add('history');
    out.add('History');
  }
  if (c === WORD_CIPHER_CATEGORY || lower === 'brain_twisters' || lower === 'brain twisters') {
    out.add(WORD_CIPHER_CATEGORY);
    out.add('Brain Twisters');
  }
  return [...out];
}

function difficultyQueryValues(normalizedLower) {
  const d0 = String(normalizedLower || 'easy').trim().toLowerCase();
  if (d0 !== 'easy' && d0 !== 'medium' && d0 !== 'hard') {
    return [d0];
  }
  const cap = d0.charAt(0).toUpperCase() + d0.slice(1);
  return [...new Set([d0, cap])];
}

function isIndexOrMissingCompositeError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  return code === 9 || /FAILED_PRECONDITION|requires an index/i.test(msg);
}

/**
 * @param {FirebaseFirestore.QueryDocumentSnapshot} doc
 */
function docToRow(doc) {
  const d = doc.data() || {};
  const options = optionsFromDocData(d);
  const correctIndex = Number(d.correctIndex);
  const sequence = Array.isArray(d.sequence) ? d.sequence.map((x) => String(x ?? '')) : [];
  return {
    id: doc.id,
    category: String(d.category || ''),
    difficulty: String(d.difficulty || 'easy'),
    text: String(d.question ?? d.text ?? '').trim(),
    options,
    correctIndex,
    imageUrl: String(d.imageUrl || ''),
    acceptedAnswers: Array.isArray(d.acceptedAnswers)
      ? d.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean)
      : [],
    normalizedAnswer:
      typeof d.normalizedAnswer === 'string' ? String(d.normalizedAnswer).trim() : '',
    type: String(d.type || d.questionType || '').trim().toLowerCase(),
    enigmaDeck: String(d.enigmaDeck ?? d.enigma_deck ?? '').trim(),
    hint: String(d.hint || '').trim(),
    explanation: String(d.explanation || '').trim(),
    patternKind: String(d.patternKind || d.pattern_kind || '').trim().toLowerCase(),
    ...(sequence.length ? { sequence } : {}),
  };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const FIRESTORE_QUERY_CONCURRENCY = Math.max(2, Math.min(16, Number(process.env.ENIGMA_FIRESTORE_QUERY_CONCURRENCY || 8)));
const ALLOW_BROAD_QUESTION_SCAN =
  String(process.env.ENIGMA_PULSE_ALLOW_BROAD_QUESTION_SCAN || 'true').toLowerCase() !== 'false';

/**
 * @param {(() => Promise<void>)[]} tasks
 * @param {number} [concurrency]
 */
async function runPool(tasks, concurrency = FIRESTORE_QUERY_CONCURRENCY) {
  if (!tasks.length) return;
  let cursor = 0;
  const workerCount = Math.min(concurrency, tasks.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      await tasks[i]();
    }
  });
  await Promise.all(workers);
}

function syllogismDifficultyForIndex(index) {
  const q = Number(index || 0) + 1;
  if (q <= 5) return 'easy';
  if (q <= 10) return 'medium';
  return 'hard';
}

/** Standard 4-option MCQ row (most Firestore trivia / enigma uploads). */
function isValidMcqRow(row) {
  const text = String(row.text ?? row.question ?? '').trim();
  if (!text) return false;
  if (!Array.isArray(row.options) || row.options.length !== 4) return false;
  if (!row.options.every((o) => String(o ?? '').trim())) return false;
  const parsedCorrectIndex = Number(row.correctIndex);
  if (!Number.isInteger(parsedCorrectIndex) || parsedCorrectIndex < 0 || parsedCorrectIndex > 3) {
    return false;
  }
  return true;
}

/** Typed / short-answer row: needs grading strings even if options are incomplete. */
function isValidTextAnswerRow(row) {
  const text = String(row.text ?? row.question ?? '').trim();
  if (!text) return false;
  const hasAA = Array.isArray(row.acceptedAnswers) && row.acceptedAnswers.some((x) => String(x).trim());
  const hasNA = typeof row.normalizedAnswer === 'string' && row.normalizedAnswer.trim();
  return Boolean(hasAA || hasNA);
}

function rowTypeNorm(row) {
  return String(row.type || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function deckNorm(row) {
  return String(row.enigmaDeck || row.enigma_deck || '').trim().toUpperCase();
}

function isBrainTwistersCategory(row) {
  const cat = String(row.category || '').trim().toLowerCase().replace(/\s+/g, '_');
  return cat === WORD_CIPHER_CATEGORY;
}

/** Firestore `type` buckets — each EnigmaPulse lobby `gameKey` must own disjoint rows. */
const SEQUENCE_TYPES = new Set(['sequence', 'riddle_sequence', 'pattern_recognition']);
const WORD_CIPHER_TYPES = new Set(['word_cipher', 'cipher']);
const LOGIC_GRID_TYPES = new Set(['logic_grid', 'logic_master', 'pattern_logic']);
const SYLLOGISM_TYPES = new Set(['syllogism', 'syllogism_logic']);
const MCQ_SET_B_TYPES = new Set(['mcq_set_b', 'set_b']);

function sequencePayloadLooksLikePattern(row) {
  const seq = Array.isArray(row.sequence) ? row.sequence : [];
  return seq.length >= 2;
}

function questionTypesForGameKey(gameKey) {
  const key = enigmaGameKeyForQuestionSelection(gameKey);
  if (key === 'riddle_sequence') return ['riddle_sequence', 'sequence', 'pattern_recognition'];
  if (key === 'logic_grid') return ['logic_grid', 'logic_master', 'pattern_logic'];
  if (key === 'word_cipher') return ['word_cipher', 'cipher'];
  if (key === 'syllogism') return ['syllogism', 'syllogism_logic'];
  if (key === 'riddle_classic') return ['riddle_classic', 'classic_riddle', 'riddle', 'mcq', 'trivia', 'enigma_pulse'];
  return [];
}

/**
 * Filter Firestore/local rows by lobby {@link gameKey}. Used before {@link normalizeRow}.
 * @param {Record<string, unknown>} row
 * @param {string} gameKey
 */
export function rowMatchesEnigmaGameKey(row, gameKey) {
  const key = enigmaGameKeyForQuestionSelection(gameKey || 'riddle_classic');
  const t = rowTypeNorm(row);
  const deck = deckNorm(row);
  const cat = String(row.category || '').trim().toLowerCase();

  if (key === 'syllogism') {
    if (!isValidMcqRow(row)) return false;
    const typeOk = t === 'syllogism' || t === 'syllogism_logic';
    const categoryOk = cat === 'syllogism';
    return typeOk && categoryOk;
  }

  if (key === 'riddle_text_input') {
    if (WORD_CIPHER_TYPES.has(t)) return false;
    if (isBrainTwistersCategory(row)) return false;
    if (SEQUENCE_TYPES.has(t)) return false;
    if (LOGIC_GRID_TYPES.has(t)) return false;
    if (SYLLOGISM_TYPES.has(t)) return false;
    if (deck === 'B' || MCQ_SET_B_TYPES.has(t)) return false;
    return isValidMcqRow(row) || isValidTextAnswerRow(row);
  }

  if (key === 'riddle_classic') {
    if (WORD_CIPHER_TYPES.has(t)) return false;
    if (isBrainTwistersCategory(row)) return false;
    if (LOGIC_GRID_TYPES.has(t)) return false;
    if (SEQUENCE_TYPES.has(t)) return false;
    if (SYLLOGISM_TYPES.has(t)) return false;
    if (deck === 'B') return false;
    if (MCQ_SET_B_TYPES.has(t)) return false;
    if (!isValidMcqRow(row)) return false;
    if ((t === '' || t === 'enigma_pulse') && sequencePayloadLooksLikePattern(row)) return false;
    return (
      !t ||
      t === 'riddle_classic' ||
      t === 'classic_riddle' ||
      t === 'riddle' ||
      t === 'mcq' ||
      t === 'trivia' ||
      t === 'enigma_pulse'
    );
  }

  if (key === 'riddle_mcq_b') {
    if (WORD_CIPHER_TYPES.has(t)) return false;
    if (isBrainTwistersCategory(row)) return false;
    if (SEQUENCE_TYPES.has(t)) return false;
    if (LOGIC_GRID_TYPES.has(t)) return false;
    if (SYLLOGISM_TYPES.has(t)) return false;
    if (!isValidMcqRow(row)) return false;
    return deck === 'B' || MCQ_SET_B_TYPES.has(t);
  }

  if (key === 'word_cipher') {
    if (!isValidMcqRow(row)) return false;
    if (!isBrainTwistersCategory(row)) return false;
    return t === 'word_cipher' || t === 'cipher';
  }

  if (key === 'riddle_sequence') {
    if (!isValidMcqRow(row)) return false;
    if (cat === 'syllogism') return false;
    if (isBrainTwistersCategory(row)) return false;
    return SEQUENCE_TYPES.has(t);
  }

  if (key === 'logic_grid') {
    if (!isValidMcqRow(row)) return false;
    if (SEQUENCE_TYPES.has(t)) return false;
    if (WORD_CIPHER_TYPES.has(t)) return false;
    if (SYLLOGISM_TYPES.has(t)) return false;
    if (isBrainTwistersCategory(row)) return false;
    return LOGIC_GRID_TYPES.has(t);
  }

  return false;
}

function normalizeRow(row) {
  const text = String(row.text ?? row.question ?? '').trim();
  let opts = Array.isArray(row.options) ? row.options.map((x) => String(x ?? '').trim()) : [];
  while (opts.length < 4) opts.push('');
  opts = opts.slice(0, 4);
  let parsedCorrectIndex = Number(row.correctIndex);
  if (!Number.isInteger(parsedCorrectIndex) || parsedCorrectIndex < 0 || parsedCorrectIndex > 3) {
    parsedCorrectIndex = 0;
  }
  const base = {
    id: row.id,
    text,
    imageUrl: row.imageUrl || '',
    options: opts,
    correctIndex: parsedCorrectIndex,
    acceptedAnswers: Array.isArray(row.acceptedAnswers)
      ? row.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean)
      : [],
    normalizedAnswer:
      typeof row.normalizedAnswer === 'string' ? String(row.normalizedAnswer).trim() : '',
    type: String(row.type || '').trim().toLowerCase(),
    category: row.category,
    difficulty: row.difficulty,
    enigmaDeck: String(row.enigmaDeck || row.enigma_deck || '').trim().toUpperCase(),
    hint: String(row.hint || '').trim(),
    explanation: String(row.explanation || '').trim(),
    patternKind: String(row.patternKind || row.pattern_kind || '').trim().toLowerCase(),
  };
  if (Array.isArray(row.sequence) && row.sequence.length) {
    return { ...base, sequence: row.sequence.map((x) => String(x ?? '')) };
  }
  return base;
}

/**
 * Load MCQ rows from Firestore for EnigmaPulse matches.
 * Accepts `enigma_pulse` and legacy `trivia` banks, widens GK→history, and
 * tolerates missing indexes / missing `active` / option1–4 fields.
 * 
 *
 * @param {{ category: string; difficulty: string; cap: number; gameKey?: string }} args
 * @returns {Promise<{ rows: ReturnType<typeof normalizeRow>[]; broadScan: boolean }>}
 */
async function fetchFirestoreEnigmaPulseRows({ category, difficulty, cap, gameKey = '' }) {
  const db = getAdminFirestore();
  if (!db) return { rows: [], broadScan: false };

  const limit = Math.min(400, Math.max(40, cap));
  const gk = enigmaGameKeyForQuestionSelection(gameKey || 'riddle_classic');
  const canonicalCat =
    gk === 'word_cipher'
      ? normalizeWordCipherCategory(category) || WORD_CIPHER_CATEGORY
      : normalizeEnigmaPulseCategory(category) || String(category || '').trim();
  const categoryAttempts = firestoreCategoryQueryValues(canonicalCat);
  const diffAttempts = difficultyQueryValues(difficulty);
  const typeAttempts = questionTypesForGameKey(gameKey);
  /** @type {Map<string, FirebaseFirestore.QueryDocumentSnapshot>} */
  const byId = new Map();
  let broadScanUsed = false;

  async function collectFromQuery(buildQuery) {
    try {
      const snap = await buildQuery().limit(limit).get();
      for (const doc of snap.docs) {
        byId.set(doc.id, doc);
      }
    } catch (e) {
      if (isIndexOrMissingCompositeError(e)) {
        console.warn('[EnigmaPulse] missing Firestore composite index for question query:', e?.message || e);
      } else {
        console.warn('[EnigmaPulse] Firestore question query failed:', e?.message || e);
      }
    }
  }

  const gameTypes = ['enigma_pulse'];
  /** @type {(() => Promise<void>)[]} */
  const phase1Tasks = [];

  for (const gameType of gameTypes) {
    for (const catQ of categoryAttempts) {
      for (const diffQ of diffAttempts) {
        if (typeAttempts.length) {
          for (const typeQ of typeAttempts) {
            phase1Tasks.push(async () => {
              await collectFromQuery(() =>
                db
                  .collection('questions')
                  .where('gameType', '==', gameType)
                  .where('type', '==', typeQ)
                  .where('category', '==', catQ)
                  .where('difficulty', '==', diffQ)
                  .where('active', '==', true)
              );
            });
          }
        } else {
          phase1Tasks.push(async () => {
            await collectFromQuery(() =>
              db
                .collection('questions')
                .where('gameType', '==', gameType)
                .where('category', '==', catQ)
                .where('difficulty', '==', diffQ)
                .where('active', '==', true)
            );
          });
        }
      }
    }
  }

  await runPool(phase1Tasks);

  if (byId.size === 0) {
    /** @type {(() => Promise<void>)[]} */
    const phase2Tasks = [];
    for (const gameType of gameTypes) {
      for (const catQ of categoryAttempts) {
        for (const diffQ of diffAttempts) {
          if (typeAttempts.length) {
            for (const typeQ of typeAttempts) {
              phase2Tasks.push(async () => {
                await collectFromQuery(() =>
                  db
                    .collection('questions')
                    .where('gameType', '==', gameType)
                    .where('type', '==', typeQ)
                    .where('category', '==', catQ)
                    .where('difficulty', '==', diffQ)
                );
              });
            }
          } else {
            phase2Tasks.push(async () => {
              await collectFromQuery(() =>
                db
                  .collection('questions')
                  .where('gameType', '==', gameType)
                  .where('category', '==', catQ)
                  .where('difficulty', '==', diffQ)
              );
            });
          }
        }
      }
    }
    await runPool(phase2Tasks);
    for (const doc of [...byId.values()]) {
      if (!isDocActiveForPlay(doc.data() || {})) {
        byId.delete(doc.id);
      }
    }
  }

  if (byId.size === 0 && ALLOW_BROAD_QUESTION_SCAN) {
    broadScanUsed = true;
    for (const gameType of gameTypes) {
      try {
        const snap = await db.collection('questions').where('gameType', '==', gameType).limit(500).get();
        const diffNorm = String(difficulty || 'easy').trim().toLowerCase();
        for (const doc of snap.docs) {
          const d = doc.data() || {};
          if (!isDocActiveForPlay(d)) continue;
          const dc = String(d.category || '').trim();
          if (!categoryAttempts.some((v) => v === dc)) continue;
          const dd = String(d.difficulty || '').trim().toLowerCase();
          if (dd !== diffNorm) continue;
          const dt = String(d.type || d.questionType || '').trim().toLowerCase();
          if (typeAttempts.length && !typeAttempts.includes(dt)) continue;
          byId.set(doc.id, doc);
        }
      } catch (e) {
        console.warn('[EnigmaPulse] Firestore broad question fetch failed:', e?.message || e);
      }
    }
  } else if (byId.size === 0 && !ALLOW_BROAD_QUESTION_SCAN) {
    console.warn(
      '[EnigmaPulse] Broad question scan disabled (ENIGMA_PULSE_ALLOW_BROAD_QUESTION_SCAN=false) and no indexed hits; ' +
        'deploy composite indexes from backend/firebase/firestore.indexes.json (questions: gameType+type+category+difficulty+active).'
    );
  }

  if (broadScanUsed) {
    console.warn(
      `[EnigmaPulse] Broad question scan used for gameKey=${gameKey} category=${canonicalCat} difficulty=${difficulty} — ` +
        'add/deploy Firestore composite indexes to avoid slow deck builds.'
    );
  }

  const rows = [...byId.values()]
    .map(docToRow)
    .filter((row) => rowMatchesEnigmaGameKey(row, gameKey))
    .map(normalizeRow);
  shuffleInPlace(rows);
  return { rows, broadScan: broadScanUsed };
}

/**
 * Syllogism: parallel easy/medium/hard Firestore passes + optional in-process cache.
 * @returns {Promise<{ rows: unknown[]; broadScan: boolean; cacheHit: boolean }>}
 */
async function fetchSyllogismCandidatesMerged({ category, cap, gameKey }) {
  const gk = enigmaGameKeyForQuestionSelection(gameKey || 'syllogism');
  const mode = enigmaQuestionSourceMode();
  if (gk !== 'syllogism') return { rows: [], broadScan: false, cacheHit: false };

  const cat = normalizeEnigmaPulseCategory(category) || String(category || '').trim();
  if (mode === 'local') return { rows: [], broadScan: false, cacheHit: false };

  const cacheKey = syllogismPoolCacheKey(cat, cap);
  const cached = getSyllogismPoolCached(cacheKey);
  if (cached && cached.length) {
    shuffleInPlace(cached);
    return { rows: cached, broadScan: false, cacheHit: true };
  }

  const db = getAdminFirestore();
  if (!db && mode !== 'firestore') {
    const localRows = (await getLocalSyllogismFallbackRows({ category: cat || 'Syllogism', count: cap }))
      .map((row) => normalizeRow(row))
      .filter((row) => rowMatchesEnigmaGameKey(row, gameKey));
    if (localRows.length) setSyllogismPoolCache(cacheKey, localRows);
    return { rows: localRows, broadScan: false, cacheHit: false };
  }

  const [ePack, mPack, hPack] = await Promise.all([
    fetchFirestoreEnigmaPulseRows({ category: cat, difficulty: 'easy', cap, gameKey: gk }),
    fetchFirestoreEnigmaPulseRows({ category: cat, difficulty: 'medium', cap, gameKey: gk }),
    fetchFirestoreEnigmaPulseRows({ category: cat, difficulty: 'hard', cap, gameKey: gk }),
  ]);

  const byId = new Map();
  for (const r of [...ePack.rows, ...mPack.rows, ...hPack.rows]) {
    byId.set(r.id, r);
  }
  let merged = [...byId.values()];
  const minPool = Math.min(24, Math.max(12, Math.floor(Number(cap) / 4)));
  if (merged.length < minPool) {
    const localExtra = await getLocalSyllogismFallbackRows({ category: cat || 'Syllogism', count: cap });
    for (const raw of localExtra) {
      const row = normalizeRow(raw);
      if (!rowMatchesEnigmaGameKey(row, gameKey)) continue;
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    merged = [...byId.values()];
  }
  if (merged.length) {
    setSyllogismPoolCache(cacheKey, merged);
  }
  const broadScan = Boolean(ePack.broadScan || mPack.broadScan || hPack.broadScan);
  const out = merged.map((r) => ({ ...r }));
  shuffleInPlace(out);
  return { rows: out, broadScan, cacheHit: false };
}

/**
 * Sequence IQ: merge easy + medium + hard Firestore (or local) pools like Syllogism, dedupe by id.
 * @returns {Promise<{ rows: ReturnType<typeof normalizeRow>[]; broadScan: boolean; poolCacheHit: boolean }>}
 */
async function fetchSequenceIqCandidatesMerged({ category, cap, gameKey }) {
  const gk = enigmaGameKeyForQuestionSelection(gameKey || 'pattern_recognition');
  const mode = enigmaQuestionSourceMode();
  const cat = normalizeEnigmaPulseCategory(category) || String(category || '').trim();
  const perCap = Math.min(400, Math.max(40, Math.ceil(Number(cap) / 2)));
  const perLocal = Math.min(200, Math.max(40, Math.ceil(Number(cap) / 2)));

  async function loadLocalMergedRows() {
    const [easyRows, medRows, hardRows] = await Promise.all([
      getLocalQuestions({ category: cat, difficulty: 'easy', count: perLocal }),
      getLocalQuestions({ category: cat, difficulty: 'medium', count: perLocal }),
      getLocalQuestions({ category: cat, difficulty: 'hard', count: perLocal }),
    ]);
    const byId = new Map();
    for (const raw of [...easyRows, ...medRows, ...hardRows]) {
      const r = /** @type {Record<string, unknown>} */ (raw);
      const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : stableLocalQuestionId(r);
      const row = normalizeRow({ ...r, id });
      if (!rowMatchesEnigmaGameKey(row, gameKey)) continue;
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    const merged = [...byId.values()];
    shuffleInPlace(merged);
    return merged;
  }

  if (mode === 'local') {
    const rows = (await getLocalSequenceIqFallbackRows({ category: cat, count: perCap }))
      .map((raw) => normalizeRow(raw))
      .filter((row) => rowMatchesEnigmaGameKey(row, gameKey));
    return { rows, broadScan: false, poolCacheHit: false };
  }

  const cacheKey = enigmaSequenceIqMergedPoolCacheKey(cat, perCap);
  const cached = getEnigmaCandidatePoolCached(cacheKey);
  if (cached && cached.length) {
    shuffleInPlace(cached);
    return { rows: cached, broadScan: false, poolCacheHit: true };
  }

  const db = getAdminFirestore();
  if (!db) {
    if (mode === 'firestore') return { rows: [], broadScan: false, poolCacheHit: false };
    const rows = (await getLocalSequenceIqFallbackRows({ category: cat, count: perCap }))
      .map((raw) => normalizeRow(raw))
      .filter((row) => rowMatchesEnigmaGameKey(row, gameKey));
    return { rows, broadScan: false, poolCacheHit: false };
  }

  const [ePack, mPack, hPack] = await Promise.all([
    fetchFirestoreEnigmaPulseRows({ category: cat, difficulty: 'easy', cap: perCap, gameKey: gk }),
    fetchFirestoreEnigmaPulseRows({ category: cat, difficulty: 'medium', cap: perCap, gameKey: gk }),
    fetchFirestoreEnigmaPulseRows({ category: cat, difficulty: 'hard', cap: perCap, gameKey: gk }),
  ]);

  const byId = new Map();
  for (const r of [...ePack.rows, ...mPack.rows, ...hPack.rows]) {
    byId.set(r.id, r);
  }
  let merged = [...byId.values()];
  const minPool = Math.min(40, perCap);
  if (merged.length < minPool) {
    const localExtra = await getLocalSequenceIqFallbackRows({ category: cat, count: perCap });
    for (const raw of localExtra) {
      const row = normalizeRow(raw);
      if (!rowMatchesEnigmaGameKey(row, gameKey)) continue;
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
    merged = [...byId.values()];
  }
  shuffleInPlace(merged);
  if (merged.length) setEnigmaCandidatePoolCache(cacheKey, merged);
  const broadScan = Boolean(ePack.broadScan || mPack.broadScan || hPack.broadScan);
  return { rows: merged, broadScan, poolCacheHit: false };
}

/**
 * @returns {Promise<{ rows: ReturnType<typeof normalizeRow>[]; poolCacheHit: boolean }>}
 */
async function fetchCandidateRows({ category, difficulty, cap, gameKey }) {
  const mode = enigmaQuestionSourceMode();
  const gk = enigmaGameKeyForQuestionSelection(gameKey || 'riddle_classic');
  const isSyllogism = gk.toLowerCase() === 'syllogism';
  const isWordCipher = gk === 'word_cipher';

  const pack = (rows, poolCacheHit = false) => ({ rows, poolCacheHit });

  async function firestoreWithFallback() {
    const catNorm = isWordCipher
      ? normalizeWordCipherCategory(category) || WORD_CIPHER_CATEGORY
      : normalizeEnigmaPulseCategory(category) || String(category || '').trim();
    const diffNorm = String(difficulty || 'easy').trim().toLowerCase();
    const limitArg = Math.min(400, Math.max(40, cap));
    const cacheKey = enigmaCandidatePoolCacheKey(gk, catNorm, diffNorm, limitArg);
    const cached = getEnigmaCandidatePoolCached(cacheKey);
    if (cached && cached.length) return { rows: cached, cacheHit: true };

    const queryCategory = isWordCipher ? catNorm : category;
    const { rows } = await fetchFirestoreEnigmaPulseRows({ category: queryCategory, difficulty, cap, gameKey: gk });
    if (rows.length) setEnigmaCandidatePoolCache(cacheKey, rows);
    return { rows, cacheHit: false };
  }

  if (isWordCipher) {
    const fb = await firestoreWithFallback();
    return pack(fb.rows, fb.cacheHit);
  }

  if (mode === 'local') {
    if (isSyllogism) return pack([], false);
    const rows = await getLocalQuestions({ category, difficulty, count: cap });
    return pack(rows.map((r) => normalizeRow(r)).filter((r) => rowMatchesEnigmaGameKey(r, gk)), false);
  }
  if (mode === 'firestore') {
    const fb = await firestoreWithFallback();
    if (fb.rows.length) return pack(fb.rows, fb.cacheHit);
    if (isSyllogism) return pack([], false);
    const localRows = await getLocalQuestions({ category, difficulty, count: cap });
    return pack(
      localRows.map((r) => normalizeRow(r)).filter((r) => rowMatchesEnigmaGameKey(r, gk)),
      false
    );
  }
  const db = getAdminFirestore();
  if (!db) {
    if (isSyllogism) return pack([], false);
    const rows = await getLocalQuestions({ category, difficulty, count: cap });
    return pack(rows.map((r) => normalizeRow(r)).filter((r) => rowMatchesEnigmaGameKey(r, gk)), false);
  }
  const fb0 = await firestoreWithFallback();
  let rows = fb0.rows;
  let poolHit = fb0.cacheHit;
  if (!rows.length) {
    if (isSyllogism) return pack([], false);
    const localRows = await getLocalQuestions({ category, difficulty, count: cap });
    rows = localRows.map((r) => normalizeRow(r)).filter((r) => rowMatchesEnigmaGameKey(r, gk));
    poolHit = false;
  }
  return pack(rows, poolHit);
}

function pickTwoDisjointDecks(rows, playedA, playedB, isBotB, count, gameKey, allowOverlap = false) {
  shuffleInPlace(rows);
  const used = new Set();
  const deckA = [];
  const deckB = [];

  for (const row of rows) {
    if (!rowMatchesEnigmaGameKey(row, gameKey)) continue;
    const norm = normalizeRow(row);
    if (deckA.length >= count) break;
    if (used.has(norm.id)) continue;
    if (playedA.has(norm.id)) continue;
    deckA.push(norm);
    used.add(norm.id);
  }

  for (const row of rows) {
    if (!rowMatchesEnigmaGameKey(row, gameKey)) continue;
    const norm = normalizeRow(row);
    if (deckB.length >= count) break;
    if (!allowOverlap && used.has(norm.id)) continue;
    if (!isBotB && playedB.has(norm.id)) continue;
    deckB.push(norm);
    if (!allowOverlap) used.add(norm.id);
  }

  return { deckA, deckB };
}

function pickSyllogismDecks(rows, playedA, playedB, isBotB, count, allowOverlap = false) {
  const normalized = rows
    .map((row) => normalizeRow(row))
    .filter((row) => rowMatchesEnigmaGameKey(row, 'syllogism'));
  shuffleInPlace(normalized);
  const used = new Set();
  const deckA = [];
  const deckB = [];

  function pickOne(deck, playedSet, preferredDifficulty) {
    const exact = normalized.find((row) => {
      if (deck.some((d) => d.id === row.id)) return false;
      if (!allowOverlap && used.has(row.id)) return false;
      if (playedSet.has(row.id)) return false;
      return String(row.difficulty || '').toLowerCase() === preferredDifficulty;
    });
    if (exact) return exact;
    return normalized.find((row) => {
      if (deck.some((d) => d.id === row.id)) return false;
      if (!allowOverlap && used.has(row.id)) return false;
      if (playedSet.has(row.id)) return false;
      return true;
    });
  }

  for (let i = 0; i < count; i += 1) {
    const preferred = syllogismDifficultyForIndex(i);
    const a = pickOne(deckA, playedA, preferred);
    if (!a) break;
    deckA.push(a);
    used.add(a.id);
  }
  for (let i = 0; i < count; i += 1) {
    const preferred = syllogismDifficultyForIndex(i);
    const b = pickOne(deckB, isBotB ? new Set() : playedB, preferred);
    if (!b) break;
    deckB.push(b);
    if (!allowOverlap) used.add(b.id);
  }
  return { deckA, deckB };
}

function sequenceRowDifficulty(row) {
  const d = String(row.difficulty || 'medium').trim().toLowerCase();
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  return 'medium';
}

/** Sequence IQ: disjoint decks + easy/medium/hard slot curve (same as syllogism index curve). */
function pickSequenceIqDecks(rows, playedA, playedB, isBotB, count, gameKey, allowOverlap = false) {
  const normalized = rows
    .map((row) => normalizeRow(row))
    .filter((row) => rowMatchesEnigmaGameKey(row, gameKey));
  shuffleInPlace(normalized);
  const used = new Set();
  const deckA = [];
  const deckB = [];

  function pickOne(deck, playedSet, preferredDifficulty) {
    const pd = String(preferredDifficulty || 'medium').toLowerCase();
    const exact = normalized.find((row) => {
      if (deck.some((d) => d.id === row.id)) return false;
      if (!allowOverlap && used.has(row.id)) return false;
      if (playedSet.has(row.id)) return false;
      return sequenceRowDifficulty(row) === pd;
    });
    if (exact) return exact;
    return normalized.find((row) => {
      if (deck.some((d) => d.id === row.id)) return false;
      if (!allowOverlap && used.has(row.id)) return false;
      if (playedSet.has(row.id)) return false;
      return true;
    });
  }

  for (let i = 0; i < count; i += 1) {
    const preferred = syllogismDifficultyForIndex(i);
    const a = pickOne(deckA, playedA, preferred);
    if (!a) break;
    deckA.push(a);
    used.add(a.id);
  }
  for (let i = 0; i < count; i += 1) {
    const preferred = syllogismDifficultyForIndex(i);
    const b = pickOne(deckB, isBotB ? new Set() : playedB, preferred);
    if (!b) break;
    deckB.push(b);
    if (!allowOverlap) used.add(b.id);
  }
  return { deckA, deckB };
}

/**
 * @param {{
 *   uidA: string;
 *   uidB: string;
 *   isBotB: boolean;
 *   category: string;
 *   difficulty: string;
 *   gameKey?: string;
 *   count?: number;
 *   roomId?: string;
 * }} args
 */
export async function buildEnigmaMatchQuestionDecks({
  uidA,
  uidB,
  isBotB,
  category,
  difficulty,
  gameKey = 'riddle_classic',
  count = ENIGMA_PULSE.QUESTION_COUNT,
  roomId: telemetryRoomId = '',
}) {
  const tBuild0 = performance.now();
  const isSequenceIq = isPatternRecognitionGameKey(gameKey);
  const isWordCipherGk = isWordCipherGameKey(gameKey);
  const cap = Math.min(
    400,
    Math.max(120, Math.floor(Number(count) * (isSequenceIq || isWordCipherGk ? 14 : 10)))
  );
  const cat = isWordCipherGk
    ? normalizeWordCipherCategory(category) || WORD_CIPHER_CATEGORY
    : normalizeEnigmaPulseCategory(category) || String(category || '').trim();
  const diff = String(difficulty || '').trim().toLowerCase();
  const isSyllogismGk = String(gameKey || '').toLowerCase() === 'syllogism';

  let totalHistoryMs = 0;
  let totalFirestoreMs = 0;
  let totalPickMs = 0;
  let retryCount = 0;
  let anyBroadScan = false;
  let anyCacheHit = false;
  let overlapFallbackUsed = false;
  let playedACount = 0;
  let playedBCount = 0;
  let deckALenPreSlice = 0;
  let deckBLenPreSlice = 0;

  /**
   * @param {null | 'both' | 'human_only'} resetHistory
   * @param {number} capMultiplier widen fetch without touching played history
   */
  async function runDeckPipeline(resetHistory, capMultiplier = 1) {
    const tHist0 = performance.now();
    if (resetHistory === 'both') {
      await Promise.all([
        resetEnigmaPlayedHistory(uidA, cat, diff, gameKey),
        isBotB ? Promise.resolve() : resetEnigmaPlayedHistory(uidB, cat, diff, gameKey),
      ]);
    } else if (resetHistory === 'human_only') {
      await resetEnigmaPlayedHistory(uidA, cat, diff, gameKey);
    }
    totalHistoryMs += performance.now() - tHist0;

    const scaledCap = Math.min(400, Math.max(40, Math.floor(cap * capMultiplier)));

    const tFs0 = performance.now();
    let rows;
    let playedA;
    let playedB;
    if (isSyllogismGk) {
      const [playedPair, pack] = await Promise.all([
        Promise.all([
          loadEnigmaPlayedIdSet(uidA, { gameKey }),
          isBotB ? Promise.resolve(new Set()) : loadEnigmaPlayedIdSet(uidB, { gameKey }),
        ]),
        fetchSyllogismCandidatesMerged({ category: cat, cap: scaledCap, gameKey }),
      ]);
      playedA = playedPair[0];
      playedB = playedPair[1];
      rows = pack.rows;
      anyBroadScan = anyBroadScan || pack.broadScan;
      anyCacheHit = anyCacheHit || pack.cacheHit;
    } else if (isSequenceIq) {
      const [playedPair, pack] = await Promise.all([
        Promise.all([
          loadEnigmaPlayedIdSet(uidA, { gameKey }),
          isBotB ? Promise.resolve(new Set()) : loadEnigmaPlayedIdSet(uidB, { gameKey }),
        ]),
        fetchSequenceIqCandidatesMerged({ category: cat, cap: scaledCap, gameKey }),
      ]);
      playedA = playedPair[0];
      playedB = playedPair[1];
      rows = pack.rows;
      anyBroadScan = anyBroadScan || pack.broadScan;
      anyCacheHit = anyCacheHit || pack.poolCacheHit;
    } else {
      const [[pa, pb], fetched] = await Promise.all([
        Promise.all([
          loadEnigmaPlayedIdSet(uidA, { gameKey }),
          isBotB ? Promise.resolve(new Set()) : loadEnigmaPlayedIdSet(uidB, { gameKey }),
        ]),
        fetchCandidateRows({ category: cat, difficulty: diff, cap: scaledCap, gameKey }),
      ]);
      playedA = pa;
      playedB = pb;
      rows = fetched.rows;
      anyCacheHit = anyCacheHit || fetched.poolCacheHit;
    }
    totalFirestoreMs += performance.now() - tFs0;
    playedACount = playedA.size;
    playedBCount = playedB.size;

    const tPick0 = performance.now();
    let disjoint;
    if (isSyllogismGk) {
      disjoint = pickSyllogismDecks(rows, playedA, playedB, isBotB, count, false);
    } else if (isSequenceIq) {
      disjoint = pickSequenceIqDecks(rows, playedA, playedB, isBotB, count, gameKey, false);
    } else {
      disjoint = pickTwoDisjointDecks(rows, playedA, playedB, isBotB, count, gameKey, false);
    }

    if (disjoint.deckA.length >= count && disjoint.deckB.length >= count) {
      totalPickMs += performance.now() - tPick0;
      return { ...disjoint, overlapUsed: false };
    }
    if (isSyllogismGk) {
      totalPickMs += performance.now() - tPick0;
      return { ...disjoint, overlapUsed: false };
    }
    if (isWordCipherGk) {
      totalPickMs += performance.now() - tPick0;
      return { ...disjoint, overlapUsed: false };
    }
    if (isSequenceIq) {
      totalPickMs += performance.now() - tPick0;
      const overlapDeck = pickSequenceIqDecks(rows, playedA, playedB, isBotB, count, gameKey, true);
      const disjointMin = Math.min(disjoint.deckA.length, disjoint.deckB.length);
      const overlapMin = Math.min(overlapDeck.deckA.length, overlapDeck.deckB.length);
      if (
        overlapMin > disjointMin ||
        overlapDeck.deckA.length > disjoint.deckA.length ||
        overlapDeck.deckB.length > disjoint.deckB.length
      ) {
        return { ...overlapDeck, overlapUsed: true };
      }
      return { ...disjoint, overlapUsed: false };
    }
    const overlapAllowed = pickTwoDisjointDecks(rows, playedA, playedB, isBotB, count, gameKey, true);
    totalPickMs += performance.now() - tPick0;
    return { ...overlapAllowed, overlapUsed: true };
  }

  let { deckA, deckB, overlapUsed: ob0 } = await runDeckPipeline(null, 1);
  overlapFallbackUsed = Boolean(ob0);

  /** Sequence IQ: at most one widen retry, then local fallback pick (no history-reset storm). */
  if (isSequenceIq && Math.min(deckA.length, deckB.length) < count) {
    retryCount += 1;
    const second = await runDeckPipeline(null, 1.35);
    if (
      Math.min(second.deckA.length, second.deckB.length) > Math.min(deckA.length, deckB.length) ||
      second.deckA.length > deckA.length ||
      second.deckB.length > deckB.length
    ) {
      deckA = second.deckA;
      deckB = second.deckB;
      overlapFallbackUsed = Boolean(second.overlapUsed);
    }
  }

  if (isSequenceIq && Math.min(deckA.length, deckB.length) < count) {
    retryCount += 1;
    const localRows = (await getLocalSequenceIqFallbackRows({ category: cat, count: cap }))
      .map((row) => normalizeRow(row))
      .filter((row) => rowMatchesEnigmaGameKey(row, gameKey));
    if (localRows.length) {
      const fallbackPick = pickSequenceIqDecks(
        localRows,
        new Set(),
        new Set(),
        true,
        count,
        gameKey,
        true
      );
      if (
        Math.min(fallbackPick.deckA.length, fallbackPick.deckB.length) >
          Math.min(deckA.length, deckB.length) ||
        fallbackPick.deckA.length > deckA.length ||
        fallbackPick.deckB.length > deckB.length
      ) {
        deckA = fallbackPick.deckA;
        deckB = fallbackPick.deckB;
        overlapFallbackUsed = true;
      }
    }
  }

  if (isWordCipherGk && Math.min(deckA.length, deckB.length) < count) {
    retryCount += 1;
    const second = await runDeckPipeline(null, 1.35);
    if (
      Math.min(second.deckA.length, second.deckB.length) > Math.min(deckA.length, deckB.length) ||
      second.deckA.length > deckA.length ||
      second.deckB.length > deckB.length
    ) {
      deckA = second.deckA;
      deckB = second.deckB;
      overlapFallbackUsed = Boolean(second.overlapUsed);
    }
  }

  if (!isSequenceIq && !isWordCipherGk && (deckA.length < count || deckB.length < count)) {
    retryCount = 1;
    const retry = await runDeckPipeline(isBotB ? 'human_only' : 'both', 1);
    deckA = retry.deckA;
    deckB = retry.deckB;
    overlapFallbackUsed = Boolean(retry.overlapUsed);
  }

  if (isWordCipherGk && Math.min(deckA.length, deckB.length) < count) {
    retryCount += 1;
    const retry = await runDeckPipeline(isBotB ? 'human_only' : 'both', 1);
    deckA = retry.deckA;
    deckB = retry.deckB;
    overlapFallbackUsed = Boolean(retry.overlapUsed);
  }

  deckALenPreSlice = deckA.length;
  deckBLenPreSlice = deckB.length;

  const target = Math.min(count, deckA.length, deckB.length);
  const requiredSeq = ENIGMA_PULSE.SEQUENCE_IQ_SHARED_ROUNDS;
  const shortSequenceDeck = isSequenceIq && target < requiredSeq;

  /** Any game with zero usable rounds — log failure (Sequence IQ used to log ok:true here). */
  if (target < 1) {
    logEnigmaDeckBuild(
      {
        roomId: telemetryRoomId,
        gameKey,
        category: cat,
        questionTarget: 0,
        ok: false,
        shortSequenceDeck: isSequenceIq ? shortSequenceDeck : undefined,
        requiredSequenceRounds: isSequenceIq ? requiredSeq : undefined,
        overlapFallbackUsed,
        playedACount,
        playedBCount,
        deckALenPreSlice,
        deckBLenPreSlice,
      },
      {
        totalMs: performance.now() - tBuild0,
        historyMs: totalHistoryMs,
        firestoreMs: totalFirestoreMs,
        pickMs: totalPickMs,
        retryCount,
        broadScan: anyBroadScan,
        cacheHit: anyCacheHit,
      }
    );
    return {
      decksByUid: {
        [uidA]: [],
        [uidB]: [],
      },
      questionTarget: 0,
    };
  }

  if (isSyllogismGk && target < count) {
    logEnigmaDeckBuild(
      { roomId: telemetryRoomId, gameKey, category: cat, questionTarget: 0, ok: false },
      {
        totalMs: performance.now() - tBuild0,
        historyMs: totalHistoryMs,
        firestoreMs: totalFirestoreMs,
        pickMs: totalPickMs,
        retryCount,
        broadScan: anyBroadScan,
        cacheHit: anyCacheHit,
      }
    );
    return {
      decksByUid: {
        [uidA]: [],
        [uidB]: [],
      },
      questionTarget: 0,
    };
  }
  if (isWordCipherGk && target < count) {
    logEnigmaDeckBuild(
      {
        roomId: telemetryRoomId,
        gameKey,
        category: cat,
        questionTarget: 0,
        ok: false,
        requiredWordCipherRounds: ENIGMA_PULSE.WORD_CIPHER_SHARED_ROUNDS,
        overlapFallbackUsed,
      },
      {
        totalMs: performance.now() - tBuild0,
        historyMs: totalHistoryMs,
        firestoreMs: totalFirestoreMs,
        pickMs: totalPickMs,
        retryCount,
        broadScan: anyBroadScan,
        cacheHit: anyCacheHit,
      }
    );
    return {
      decksByUid: {
        [uidA]: [],
        [uidB]: [],
      },
      questionTarget: 0,
    };
  }
  const sliceA = deckA.slice(0, target).map((q) => enrichQuestionForPlay(q));
  const sliceB = deckB.slice(0, target).map((q) => enrichQuestionForPlay(q));

  logEnigmaDeckBuild(
    {
      roomId: telemetryRoomId,
      gameKey,
      category: cat,
      questionTarget: Math.max(0, target),
      ok: true,
      shortSequenceDeck,
      requiredSequenceRounds: isSequenceIq ? requiredSeq : undefined,
      overlapFallbackUsed,
      playedACount,
      playedBCount,
      deckALenPreSlice,
      deckBLenPreSlice,
    },
    {
      totalMs: performance.now() - tBuild0,
      historyMs: totalHistoryMs,
      firestoreMs: totalFirestoreMs,
      pickMs: totalPickMs,
      retryCount,
      broadScan: anyBroadScan,
      cacheHit: anyCacheHit,
    }
  );

  if (shortSequenceDeck) {
    console.warn(
      `[EnigmaPulse][sequence_iq_short_deck] target=${target} required=${requiredSeq} category=${cat} lobbyDiff=${diff} ` +
        `deckA=${deckALenPreSlice} deckB=${deckBLenPreSlice} playedA=${playedACount} playedB=${playedBCount} overlap=${overlapFallbackUsed} cache=${anyCacheHit}`
    );
  }

  return {
    decksByUid: {
      [uidA]: sliceA,
      [uidB]: sliceB,
    },
    questionTarget: Math.max(0, target),
  };
}

/**
 * Prefetch merged question pools into in-process cache after server boot.
 * Set ENIGMA_PULSE_WARM_POOLS=false to skip.
 * @returns {Promise<{ skipped?: boolean; ms?: number; tasks?: number }>}
 */
export async function warmEnigmaQuestionPools() {
  if (String(process.env.ENIGMA_PULSE_WARM_POOLS || 'true').toLowerCase() === 'false') {
    return { skipped: true };
  }
  const t0 = performance.now();
  const cap = Math.min(400, Math.max(80, Number(process.env.ENIGMA_PULSE_WARM_CAP || 200)));
  /** @type {Promise<unknown>[]} */
  const tasks = [];

  for (const cat of ENIGMA_PULSE_LOBBY_CATEGORIES) {
    tasks.push(
      fetchSequenceIqCandidatesMerged({ category: cat, cap, gameKey: 'pattern_recognition' }).catch((e) => {
        console.warn(`[EnigmaPulse][warm] sequence pool failed (${cat}):`, e?.message || e);
        return null;
      })
    );
    for (const diff of ['easy', 'medium', 'hard']) {
      tasks.push(
        fetchCandidateRows({ category: cat, difficulty: diff, cap: Math.floor(cap * 0.6), gameKey: 'riddle_classic' }).catch(
          (e) => {
            console.warn(`[EnigmaPulse][warm] riddle_classic pool failed (${cat}/${diff}):`, e?.message || e);
            return null;
          }
        )
      );
    }
  }

  for (const diff of ['easy', 'medium', 'hard']) {
    tasks.push(
      fetchCandidateRows({
        category: WORD_CIPHER_CATEGORY,
        difficulty: diff,
        cap: Math.floor(cap * 0.6),
        gameKey: 'word_cipher',
      }).catch((e) => {
        console.warn(`[EnigmaPulse][warm] word_cipher pool failed (${WORD_CIPHER_CATEGORY}/${diff}):`, e?.message || e);
        return null;
      })
    );
  }

  tasks.push(
    fetchSyllogismCandidatesMerged({ category: 'Syllogism', cap, gameKey: 'syllogism' }).catch((e) => {
      console.warn('[EnigmaPulse][warm] syllogism pool failed:', e?.message || e);
      return null;
    })
  );

  await Promise.all(tasks);
  const ms = Math.round(performance.now() - t0);
  console.info(`[EnigmaPulse] question pools warmed in ${ms}ms (${tasks.length} prefetch tasks)`);
  return { ms, tasks: tasks.length };
}
