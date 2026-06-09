import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import XLSX from 'xlsx';
import { getAdminFirestore } from './firebaseAdmin.js';
import { createHttpError } from '../middleware/errorHandler.js';
import {
  normalizeTriviaCategory,
  normalizeTriviaDifficulty,
} from './firestoreQuestionBank.js';
import {
  ENIGMA_PULSE_LOBBY_CATEGORIES,
  ENIGMA_PULSE_ADMIN_CATEGORIES,
  WORD_CIPHER_CATEGORY,
  normalizeEnigmaPulseCategory,
  normalizeEnigmaPulseAdminCategory,
  normalizeWordCipherCategory,
} from '../../../shared/enigmaPulse/categories.js';

const COLLECTION = 'questions';
const MAX_QUESTION_LEN = 500;
const ENIGMA_QUESTION_TYPES = ['riddle_classic', 'riddle_sequence', 'logic_grid', 'word_cipher', 'syllogism'];
const SEARCH_TOKEN_MIN_LEN = 2;
const SEARCH_TOKEN_MAX_COUNT = 20;
const SEARCH_QUERY_TOKEN_LIMIT = 10;

function normalizeEnigmaQuestionType(rawType) {
  const t = String(rawType || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!t) return '';
  if (t === 'logic' || t === 'logic_quiz' || t === 'trivia_logic') return 'riddle_classic';
  if (t === 'sequence' || t === 'sequence_iq' || t === 'pattern_recognition') return 'riddle_sequence';
  if (t === 'logic_master' || t === 'pattern_logic') return 'logic_grid';
  if (t === 'cipher' || t === 'wordcipher') return 'word_cipher';
  if (t === 'syllogism_logic' || t === 'syllogistic') return 'syllogism';
  return t;
}

/** @param {unknown} raw */
export function normalizeGameType(raw) {
  const g = String(raw ?? 'trivia')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (g === 'enigma_pulse' || g === 'enigmapulse') return 'enigma_pulse';
  return 'trivia';
}

function firestoreRequired() {
  const db = getAdminFirestore();
  if (!db) throw createHttpError(503, 'Firestore Admin is not configured');
  return db;
}

function parseTags(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
  }
  const s = String(raw).trim();
  return [...new Set(s
    .split(/[,|]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean))];
}

/**
 * RFC4180-style CSV parse (supports quoted fields and doubled quotes).
 * @param {Buffer} buffer
 * @returns {Record<string, string>[]}
 */
export function parseQuestionsCsv(buffer) {
  const text = Buffer.from(buffer).toString('utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i++];
    if (inQuotes) {
      if (c === '"') {
        if (text[i] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField();
      pushRow();
    } else if (c === '\r') {
      /* ignore CR */
    } else {
      field += c;
    }
  }
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
    pushRow();
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? String(cells[idx]).trim() : '';
    });
    const allEmpty = Object.values(obj).every((v) => !String(v || '').trim());
    if (!allEmpty) out.push(obj);
  }
  return out;
}

/**
 * First worksheet → row objects with lowercase keys (same contract as CSV).
 * @param {Buffer} buffer
 */
export function parseQuestionsXlsx(buffer) {
  const wb = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.map((row) => {
    const o = {};
    if (row && typeof row === 'object') {
      for (const [k, v] of Object.entries(row)) {
        o[String(k || '').trim().toLowerCase()] = v == null ? '' : String(v).trim();
      }
    }
    return o;
  });
}

export function validateQuestionPayload(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid payload' };
  }

  const gameType = normalizeGameType(input.gameType ?? input.game_type ?? input.gametype);
  let category = '';
  if (gameType === 'enigma_pulse') {
    const rawCategory = String(input.category || '').trim();
    const normalized =
      normalizeWordCipherCategory(rawCategory) ||
      normalizeEnigmaPulseCategory(rawCategory) ||
      (rawCategory.toLowerCase() === 'syllogism' ? 'Syllogism' : '');
    category = normalized;
    if (!category) {
      return {
        ok: false,
        error: `EnigmaPulse category must be one of: ${ENIGMA_PULSE_ADMIN_CATEGORIES.join(', ')}`,
      };
    }
  } else {
    category = normalizeTriviaCategory(input.category);
  }
  const difficulty = normalizeTriviaDifficulty(input.difficulty);
  const rawType = normalizeEnigmaQuestionType(input.type ?? input.questionType ?? '');
  let type = rawType;
  if (gameType === 'enigma_pulse') {
    type = rawType || 'riddle_classic';
    if (!ENIGMA_QUESTION_TYPES.includes(type)) {
      return { ok: false, error: `EnigmaPulse type must be one of: ${ENIGMA_QUESTION_TYPES.join(', ')}` };
    }
    if (type === 'syllogism' && String(category || '').toLowerCase() !== 'syllogism') {
      return { ok: false, error: 'Syllogism questions must use category "Syllogism"' };
    }
    if (type !== 'syllogism' && String(category || '').toLowerCase() === 'syllogism') {
      return { ok: false, error: 'Category "Syllogism" is reserved for type "syllogism"' };
    }
    if (type === 'word_cipher' && category !== WORD_CIPHER_CATEGORY) {
      return { ok: false, error: 'Word Cipher questions must use category "brain_twisters"' };
    }
    if (type !== 'word_cipher' && category === WORD_CIPHER_CATEGORY) {
      return { ok: false, error: 'Category "brain_twisters" is reserved for type "word_cipher"' };
    }
  }
  const question = String(input.question ?? input.text ?? '').trim();

  let options = input.options;
  if (!Array.isArray(options)) {
    options = [
      input.option1,
      input.option2,
      input.option3,
      input.option4,
    ].map((x) => String(x ?? '').trim());
  } else {
    options = options.map((x) => String(x ?? '').trim());
  }

  const correctRaw = input.correctIndex ?? input.correct_index;
  const correctIndex = Number(correctRaw);

  if (!question) return { ok: false, error: 'Question text is required' };
  if (question.length > MAX_QUESTION_LEN) {
    return { ok: false, error: `Question must be at most ${MAX_QUESTION_LEN} characters` };
  }
  if (options.length !== 4 || options.some((o) => !o)) {
    return { ok: false, error: 'Exactly four non-empty options are required' };
  }
  const lower = options.map((o) => o.toLowerCase());
  if (new Set(lower).size !== 4) {
    return { ok: false, error: 'Options must be unique (case-insensitive)' };
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return { ok: false, error: 'correctIndex must be an integer from 0 to 3' };
  }

  const tags = parseTags(input.tags);
  const sequence = Array.isArray(input.sequence)
    ? input.sequence.map((x) => String(x ?? '').trim()).filter(Boolean)
    : String(input.sequence || '')
      .split(/[,|]/)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
  const patternKind = String(input.patternKind ?? input.pattern_kind ?? '').trim().toLowerCase();
  const hint = String(input.hint ?? '').trim();
  const explanation = String(input.explanation ?? '').trim();

  return {
    ok: true,
    data: {
      gameType,
      category,
      difficulty,
      type,
      question,
      options,
      correctIndex,
      tags,
      active: input.active !== false && String(input.active).toLowerCase() !== 'false',
      sequence,
      patternKind,
      hint,
      explanation,
    },
  };
}

export function hashQuestion(data) {
  const payload = {
    gameType: data.gameType || 'trivia',
    type: data.type || '',
    q: String(data.question || '').trim().toLowerCase().replace(/\s+/g, ' '),
    o: (data.options || []).map((x) => String(x || '').trim().toLowerCase()),
    s: (data.sequence || []).map((x) => String(x || '').trim().toLowerCase()),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

function normalizeSearchText(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function buildSearchTokens(text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  const tokens = normalized
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= SEARCH_TOKEN_MIN_LEN);
  return [...new Set(tokens)].slice(0, SEARCH_TOKEN_MAX_COUNT);
}

function computeSearchFields(question) {
  const questionLower = normalizeSearchText(question);
  const searchTokens = buildSearchTokens(questionLower);
  return { questionLower, searchTokens };
}

function scoreDocForQuery(docSnap, normalizedQuery, queryTokens) {
  const d = docSnap.data() || {};
  const questionLower = normalizeSearchText(d.questionLower || d.question || '');
  if (!questionLower) return -1;
  let score = 0;
  if (normalizedQuery && questionLower.includes(normalizedQuery)) {
    score += 100;
  }
  for (const token of queryTokens) {
    if (questionLower.includes(token)) score += 10;
  }
  return score;
}

function applySearchFilterAndSort(docsArr, normalizedQuery, queryTokens) {
  const ranked = docsArr
    .map((docSnap) => ({
      docSnap,
      score: scoreDocForQuery(docSnap, normalizedQuery, queryTokens),
      createdAtMs: docCreatedAtMs(docSnap),
    }))
    .filter((x) => x.score >= 0);

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    return String(a.docSnap.id).localeCompare(String(b.docSnap.id));
  });

  return ranked.map((x) => x.docSnap);
}

function buildDoc(data, questionHash, createdByUid, isUpdate = false) {
  const { questionLower, searchTokens } = computeSearchFields(data.question);
  const base = {
    gameType: data.gameType || 'trivia',
    category: data.category,
    difficulty: data.difficulty,
    type: data.type || '',
    question: data.question,
    options: data.options,
    correctIndex: data.correctIndex,
    tags: data.tags || [],
    active: Boolean(data.active),
    sequence: Array.isArray(data.sequence) ? data.sequence : [],
    patternKind: data.patternKind || '',
    hint: data.hint || '',
    explanation: data.explanation || '',
    questionLower,
    searchTokens,
    questionHash,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!isUpdate) {
    base.createdAt = FieldValue.serverTimestamp();
    base.createdByUid = createdByUid || null;
  }
  return base;
}

async function fetchExistingHashes(db, hashes) {
  const out = new Set();
  const unique = [...new Set(hashes)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snap = await db.collection(COLLECTION).where('questionHash', 'in', chunk).get();
    snap.docs.forEach((d) => {
      const h = d.data()?.questionHash;
      if (h) out.add(h);
    });
  }
  return out;
}

function tsToMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

export function serializeQuestionDoc(doc) {
  const d = doc.data() || {};
  return {
    id: doc.id,
    gameType: d.gameType || 'trivia',
    category: d.category ?? '',
    difficulty: d.difficulty ?? '',
    type: d.type ?? '',
    question: d.question ?? '',
    options: Array.isArray(d.options) ? d.options : [],
    correctIndex: Number(d.correctIndex) || 0,
    tags: Array.isArray(d.tags) ? d.tags : [],
    active: Boolean(d.active),
    sequence: Array.isArray(d.sequence) ? d.sequence : [],
    patternKind: d.patternKind ?? '',
    hint: d.hint ?? '',
    explanation: d.explanation ?? '',
    questionHash: d.questionHash ?? '',
    createdAt: tsToMs(d.createdAt),
    updatedAt: tsToMs(d.updatedAt),
    createdByUid: d.createdByUid ?? '',
  };
}

export async function createQuestion(payload, createdByUid) {
  const db = firestoreRequired();
  const v = validateQuestionPayload(payload);
  if (!v.ok) throw createHttpError(400, v.error);
  const h = hashQuestion(v.data);
  const existing = await fetchExistingHashes(db, [h]);
  if (existing.has(h)) throw createHttpError(409, 'Duplicate question');
  const ref = db.collection(COLLECTION).doc();
  await ref.set(buildDoc(v.data, h, createdByUid, false));
  const snap = await ref.get();
  return serializeQuestionDoc(snap);
}

export async function updateQuestion(id, patch, _updatedByUid) {
  const db = firestoreRequired();
  const ref = db.collection(COLLECTION).doc(String(id));
  const cur = await ref.get();
  if (!cur.exists) throw createHttpError(404, 'Question not found');

  const curData = cur.data() || {};
  const mergedGameType =
    patch.gameType !== undefined
      ? normalizeGameType(patch.gameType)
      : normalizeGameType(curData.gameType || 'trivia');
  const merged = {
    gameType: mergedGameType,
    category: patch.category !== undefined ? patch.category : curData.category,
    difficulty: patch.difficulty !== undefined ? patch.difficulty : curData.difficulty,
    type: patch.type !== undefined ? patch.type : curData.type,
    question: patch.question !== undefined ? patch.question : curData.question,
    options: patch.options !== undefined ? patch.options : curData.options,
    correctIndex:
      patch.correctIndex !== undefined ? patch.correctIndex : curData.correctIndex,
    tags:
      patch.tags !== undefined ? parseTags(patch.tags) : parseTags(curData.tags || []),
    active: patch.active !== undefined ? Boolean(patch.active) : Boolean(curData.active),
    sequence: patch.sequence !== undefined ? patch.sequence : curData.sequence,
    patternKind: patch.patternKind !== undefined ? patch.patternKind : curData.patternKind,
    hint: patch.hint !== undefined ? patch.hint : curData.hint,
    explanation: patch.explanation !== undefined ? patch.explanation : curData.explanation,
  };

  const v = validateQuestionPayload({
    ...merged,
    category: merged.category,
    difficulty: merged.difficulty,
    gameType: merged.gameType,
  });
  if (!v.ok) throw createHttpError(400, v.error);

  const h = hashQuestion(v.data);
  const snapDup = await db.collection(COLLECTION).where('questionHash', '==', h).limit(2).get();
  for (const d of snapDup.docs) {
    if (d.id !== ref.id) throw createHttpError(409, 'Duplicate question');
  }

  await ref.set(buildDoc(v.data, h, cur.data().createdByUid, true), { merge: true });
  const snap = await ref.get();
  return serializeQuestionDoc(snap);
}

export async function deleteQuestion(id) {
  const db = firestoreRequired();
  const ref = db.collection(COLLECTION).doc(String(id));
  const cur = await ref.get();
  if (!cur.exists) throw createHttpError(404, 'Question not found');
  await ref.delete();
  return { id: ref.id };
}

export async function getQuestion(id) {
  const db = firestoreRequired();
  const ref = db.collection(COLLECTION).doc(String(id));
  const cur = await ref.get();
  if (!cur.exists) throw createHttpError(404, 'Question not found');
  return serializeQuestionDoc(cur);
}

function docCreatedAtMs(docSnap) {
  const c = docSnap.data()?.createdAt;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  if (c instanceof Date) return c.getTime();
  return 0;
}

/**
 * When composite index (e.g. gameType + createdAt) is not deployed yet, avoid orderBy and sort in memory.
 * Caps reads at 500 docs; cursor pagination is best-effort within that window.
 */
async function listQuestionsInMemorySortFallback({
  db,
  gameTypeFilter,
  typeFilter,
  cat,
  diff,
  activeFilter,
  lim,
  cursor,
  qNormalized = '',
  qTokens = [],
}) {
  let q2 = db.collection(COLLECTION);
  if (gameTypeFilter) q2 = q2.where('gameType', '==', gameTypeFilter);
  if (typeFilter) q2 = q2.where('type', '==', typeFilter);
  if (cat != null) q2 = q2.where('category', '==', cat);
  if (diff != null) q2 = q2.where('difficulty', '==', diff);
  if (activeFilter !== null) q2 = q2.where('active', '==', activeFilter);

  const fetchCap = Math.min(500, Math.max((lim + 1) * 30, 120));
  q2 = q2.limit(fetchCap);
  const raw = await q2.get();
  let docsArr = [...raw.docs];
  if (qNormalized || (qTokens && qTokens.length > 0)) {
    docsArr = applySearchFilterAndSort(docsArr, qNormalized, qTokens);
  } else {
    docsArr.sort((a, b) => docCreatedAtMs(b) - docCreatedAtMs(a));
  }

  if (cursor) {
    const cdoc = await db.collection(COLLECTION).doc(String(cursor)).get();
    if (!cdoc.exists) throw createHttpError(400, 'Invalid cursor');
    const cts = docCreatedAtMs(cdoc);
    const cid = cdoc.id;
    let start = 0;
    for (; start < docsArr.length; start += 1) {
      const d = docsArr[start];
      const dts = docCreatedAtMs(d);
      if (dts < cts) break;
      if (dts === cts && d.id === cid) {
        start += 1;
        break;
      }
    }
    docsArr = docsArr.slice(start);
  }

  return { docs: docsArr.slice(0, lim + 1) };
}

export async function listQuestions({
  q,
  category,
  difficulty,
  active,
  gameType: gameTypeRaw,
  type: typeRaw,
  limit = 25,
  cursor,
}) {
  const db = firestoreRequired();
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const qNormalized = normalizeSearchText(q);
  const qTokens = buildSearchTokens(qNormalized).slice(0, SEARCH_QUERY_TOKEN_LIMIT);
  const gameTypeFilter =
    gameTypeRaw != null && String(gameTypeRaw).trim() !== ''
      ? normalizeGameType(gameTypeRaw)
      : null;
  const typeFilter =
    typeRaw != null && String(typeRaw).trim() !== ''
      ? normalizeEnigmaQuestionType(typeRaw)
      : null;

  const activeFilter =
    active === true || active === false
      ? active
      : active === 'true'
        ? true
        : active === 'false'
          ? false
          : null;

  const diff =
    difficulty != null && String(difficulty).trim() !== ''
      ? normalizeTriviaDifficulty(difficulty)
      : null;

  let cat = null;
  if (category != null && String(category).trim() !== '') {
    if (gameTypeFilter === 'enigma_pulse') {
      cat = normalizeEnigmaPulseAdminCategory(category);
      if (!cat) throw createHttpError(400, 'Invalid EnigmaPulse category filter');
    } else {
      cat = normalizeTriviaCategory(category);
    }
  }

  let queryBase = db.collection(COLLECTION);
  if (gameTypeFilter) queryBase = queryBase.where('gameType', '==', gameTypeFilter);
  if (typeFilter) queryBase = queryBase.where('type', '==', typeFilter);
  if (cat != null) queryBase = queryBase.where('category', '==', cat);
  if (diff != null) queryBase = queryBase.where('difficulty', '==', diff);
  if (activeFilter !== null) queryBase = queryBase.where('active', '==', activeFilter);

  let docs;
  if (qNormalized) {
    if (qNormalized.length < 2) {
      throw createHttpError(400, 'Search query must be at least 2 characters');
    }
    const tokenQueries = qTokens.length > 0 ? qTokens : [qNormalized];
    const byId = new Map();
    try {
      for (let i = 0; i < tokenQueries.length; i += SEARCH_QUERY_TOKEN_LIMIT) {
        const chunk = tokenQueries.slice(i, i + SEARCH_QUERY_TOKEN_LIMIT);
        let tq = queryBase.where('searchTokens', 'array-contains-any', chunk).limit(Math.max(200, lim * 12));
        const snap = await tq.get();
        snap.docs.forEach((d) => byId.set(d.id, d));
      }
      docs = applySearchFilterAndSort([...byId.values()], qNormalized, qTokens);
    } catch (err) {
      const isIndexError =
        err?.code === 9 ||
        /FAILED_PRECONDITION|requires an index/i.test(String(err?.message || ''));
      if (!isIndexError) throw err;
      const snap = await listQuestionsInMemorySortFallback({
        db,
        gameTypeFilter,
        typeFilter,
        cat,
        diff,
        activeFilter,
        lim: Math.max(200, lim * 8),
        cursor: null,
        qNormalized,
        qTokens,
      });
      docs = snap.docs;
    }
  } else {
    let qList = queryBase.orderBy('createdAt', 'desc').limit(lim + 1);

    if (cursor) {
      const cdoc = await db.collection(COLLECTION).doc(String(cursor)).get();
      if (!cdoc.exists) throw createHttpError(400, 'Invalid cursor');
      qList = qList.startAfter(cdoc);
    }

    let snap;
    try {
      snap = await qList.get();
    } catch (err) {
      const isIndexError =
        err?.code === 9 ||
        /FAILED_PRECONDITION|requires an index/i.test(String(err?.message || ''));
      if (isIndexError) {
        snap = await listQuestionsInMemorySortFallback({
          db,
          gameTypeFilter,
          typeFilter,
          cat,
          diff,
          activeFilter,
          lim,
          cursor,
        });
      } else {
        throw err;
      }
    }
    docs = snap.docs;
  }

  if (qNormalized && cursor) {
    const idx = docs.findIndex((d) => d.id === String(cursor));
    if (idx === -1) throw createHttpError(400, 'Invalid cursor');
    docs = docs.slice(idx + 1);
  }
  const page = docs.slice(0, lim).map((d) => serializeQuestionDoc(d));
  const nextCursor = docs.length > lim ? page[page.length - 1]?.id ?? null : null;

  return { questions: page, nextCursor };
}

export async function getQuestionStats() {
  const db = firestoreRequired();
  const triviaCategories = ['history', 'current_affairs'];
  const difficulties = ['easy', 'medium', 'hard'];
  const actives = [true, false];
  const tasks = [];
  for (const c of triviaCategories) {
    for (const d of difficulties) {
      for (const a of actives) {
        tasks.push(
          (async () => {
            const snap = await db
              .collection(COLLECTION)
              .where('category', '==', c)
              .where('difficulty', '==', d)
              .where('active', '==', a)
              .select()
              .get();
            return { gameType: 'trivia', category: c, difficulty: d, active: a, count: snap.size };
          })()
        );
      }
    }
  }
  const enigmaTasks = [];
  for (const c of ENIGMA_PULSE_LOBBY_CATEGORIES) {
    for (const d of difficulties) {
      for (const a of actives) {
        enigmaTasks.push(
          (async () => {
            const snap = await db
              .collection(COLLECTION)
              .where('gameType', '==', 'enigma_pulse')
              .where('category', '==', c)
              .where('difficulty', '==', d)
              .where('active', '==', a)
              .select()
              .get();
            return { gameType: 'enigma_pulse', category: c, difficulty: d, active: a, count: snap.size };
          })()
        );
      }
    }
  }
  for (const d of difficulties) {
    for (const a of actives) {
      enigmaTasks.push(
        (async () => {
          const snap = await db
            .collection(COLLECTION)
            .where('gameType', '==', 'enigma_pulse')
            .where('category', '==', WORD_CIPHER_CATEGORY)
            .where('type', '==', 'word_cipher')
            .where('difficulty', '==', d)
            .where('active', '==', a)
            .select()
            .get();
          return {
            gameType: 'enigma_pulse',
            category: WORD_CIPHER_CATEGORY,
            type: 'word_cipher',
            difficulty: d,
            active: a,
            count: snap.size,
          };
        })()
      );
    }
  }
  const breakdown = await Promise.all(tasks);
  const enigmaBreakdown = await Promise.all(enigmaTasks);
  return { breakdown, enigmaBreakdown };
}

export async function bulkInsertQuestions(rows, createdByUid) {
  const db = firestoreRequired();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { created: 0, skipped: [{ reason: 'No rows provided' }] };
  }

  const skipped = [];
  const validated = [];
  for (let i = 0; i < rows.length; i += 1) {
    const v = validateQuestionPayload(rows[i]);
    if (!v.ok) {
      skipped.push({ rowIndex: i, reason: v.error });
      continue;
    }
    validated.push({ rowIndex: i, data: v.data });
  }

  const seen = new Set();
  const uniqueItems = [];
  for (const item of validated) {
    const h = hashQuestion(item.data);
    if (seen.has(h)) {
      skipped.push({ rowIndex: item.rowIndex, reason: 'Duplicate row in upload' });
      continue;
    }
    seen.add(h);
    uniqueItems.push(item);
  }

  const hashes = uniqueItems.map((it) => hashQuestion(it.data));
  const existing = await fetchExistingHashes(db, hashes);

  let created = 0;
  const writes = [];

  for (const item of uniqueItems) {
    const h = hashQuestion(item.data);
    if (existing.has(h)) {
      skipped.push({ rowIndex: item.rowIndex, reason: 'Duplicate question in bank' });
      continue;
    }
    const ref = db.collection(COLLECTION).doc();
    writes.push({ ref, data: buildDoc(item.data, h, createdByUid, false) });
    existing.add(h);
    created += 1;
  }

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) {
      batch.set(w.ref, w.data);
    }
    await batch.commit();
  }

  return { created, skipped };
}
