import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../src/services/firebaseAdmin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_CSV_PATH = path.join(__dirname, 'generated_question_bank.csv');

const TRIVIA_CATEGORIES = ['history', 'current_affairs'];
const ENIGMA_CATEGORIES = ['General Knowledge', 'Science', 'History', 'Sports'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MIN_PER_CATEGORY_DIFFICULTY = 50;
const COLLECTION = 'questions';

function normDifficulty(raw) {
  const d = String(raw || 'easy').trim().toLowerCase();
  if (d === 'medium' || d === 'hard') return d;
  return 'easy';
}

function normGameType(raw) {
  const g = String(raw || 'trivia').trim().toLowerCase().replace(/-/g, '_');
  if (g === 'enigma_pulse' || g === 'enigmapulse') return 'enigma_pulse';
  return 'trivia';
}

function normTriviaCategory(raw) {
  const c = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (c === 'current_affairs' || c === 'current-affairs' || c === 'current affairs') {
    return 'current_affairs';
  }
  return 'history';
}

function normEnigmaCategory(raw) {
  const t = String(raw || '').trim();
  if (!t) return 'General Knowledge';
  const found = ENIGMA_CATEGORIES.find((x) => x.toLowerCase() === t.toLowerCase());
  return found || 'General Knowledge';
}

function toOptions(d) {
  if (Array.isArray(d.options) && d.options.length) {
    return d.options.map((x) => String(x || '').trim()).slice(0, 4);
  }
  return [d.option1, d.option2, d.option3, d.option4].map((x) => String(x || '').trim());
}

function toQuestionText(d) {
  return String(d.question ?? d.text ?? '').trim();
}

function sanitizeDoc(raw) {
  const gameType = normGameType(raw.gameType);
  const category = gameType === 'enigma_pulse' ? normEnigmaCategory(raw.category) : normTriviaCategory(raw.category);
  const difficulty = normDifficulty(raw.difficulty);
  const question = toQuestionText(raw);
  const options = toOptions(raw);
  const correctIndex = Number(raw.correctIndex);
  const active = raw.active === false || String(raw.active).toLowerCase() === 'false' ? false : true;

  const valid =
    Boolean(question) &&
    options.length === 4 &&
    options.every(Boolean) &&
    Number.isInteger(correctIndex) &&
    correctIndex >= 0 &&
    correctIndex <= 3;

  return {
    valid,
    data: {
      gameType,
      category,
      difficulty,
      question,
      options,
      correctIndex,
      active,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: raw.createdAt ?? FieldValue.serverTimestamp(),
    },
  };
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function questionRow(gameType, category, difficulty, i) {
  const stem = `${category} ${difficulty} question ${i + 1}`;
  const answer = `Answer ${((i % 4) + 1)}`;
  const wrongA = `Distractor ${((i + 1) % 4) + 1}`;
  const wrongB = `Distractor ${((i + 2) % 4) + 1}`;
  const wrongC = `Distractor ${((i + 3) % 4) + 1}`;
  const options = [answer, wrongA, wrongB, wrongC];
  return {
    category,
    difficulty,
    question: `(${gameType}) ${stem}: choose the best answer.`,
    option1: options[0],
    option2: options[1],
    option3: options[2],
    option4: options[3],
    correctIndex: 0,
    gameType,
    tags: `${gameType};${String(category).toLowerCase().replace(/\s+/g, '_')};${difficulty}`,
    active: true,
  };
}

function buildSeedRows() {
  const rows = [];
  for (const category of TRIVIA_CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < MIN_PER_CATEGORY_DIFFICULTY; i += 1) {
        rows.push(questionRow('trivia', category, difficulty, i));
      }
    }
  }
  for (const category of ENIGMA_CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < MIN_PER_CATEGORY_DIFFICULTY; i += 1) {
        rows.push(questionRow('enigma_pulse', category, difficulty, i));
      }
    }
  }
  return rows;
}

function writeCsv(rows) {
  const header = [
    'category',
    'difficulty',
    'question',
    'option1',
    'option2',
    'option3',
    'option4',
    'correctIndex',
    'gameType',
    'tags',
    'active',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.category,
        row.difficulty,
        row.question,
        row.option1,
        row.option2,
        row.option3,
        row.option4,
        row.correctIndex,
        row.gameType,
        row.tags,
        row.active,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  fs.writeFileSync(OUT_CSV_PATH, lines.join('\n'), 'utf8');
  return OUT_CSV_PATH;
}

function rowKey(row) {
  return `${row.gameType}|${row.category}|${row.difficulty}|${row.question.toLowerCase()}`;
}

async function runFirestoreRepairAndSeed({ deleteInvalid = true }) {
  const db = getAdminFirestore();
  if (!db) {
    throw new Error(
      'Firestore Admin unavailable. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS before running this script.'
    );
  }

  const snap = await db.collection(COLLECTION).get();
  let repaired = 0;
  let removed = 0;
  let unchanged = 0;
  const existingKeys = new Set();

  let batch = db.batch();
  let ops = 0;
  async function flushBatch() {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }

  for (const doc of snap.docs) {
    const src = doc.data() || {};
    const sanitized = sanitizeDoc(src);
    if (!sanitized.valid) {
      if (deleteInvalid) {
        batch.delete(doc.ref);
        ops += 1;
        removed += 1;
      } else {
        unchanged += 1;
      }
      if (ops >= 400) await flushBatch();
      continue;
    }

    existingKeys.add(rowKey(sanitized.data));
    const merged = { ...sanitized.data };
    delete merged.updatedAt;
    const same =
      normGameType(src.gameType) === merged.gameType &&
      String(src.category || '') === merged.category &&
      normDifficulty(src.difficulty) === merged.difficulty &&
      toQuestionText(src) === merged.question &&
      Number(src.correctIndex) === merged.correctIndex &&
      (src.active === undefined ? true : Boolean(src.active)) === merged.active &&
      JSON.stringify(toOptions(src)) === JSON.stringify(merged.options);

    if (same && src.createdAt) {
      unchanged += 1;
      continue;
    }

    batch.set(doc.ref, sanitized.data, { merge: true });
    ops += 1;
    repaired += 1;
    if (ops >= 400) await flushBatch();
  }
  await flushBatch();

  const seedRows = buildSeedRows();
  let inserted = 0;
  batch = db.batch();
  ops = 0;
  for (const row of seedRows) {
    const key = rowKey(row);
    if (existingKeys.has(key)) continue;
    const ref = db.collection(COLLECTION).doc();
    batch.set(ref, {
      gameType: row.gameType,
      category: row.category,
      difficulty: row.difficulty,
      question: row.question,
      options: [row.option1, row.option2, row.option3, row.option4],
      correctIndex: Number(row.correctIndex),
      active: true,
      tags: String(row.tags || '')
        .split(/[;,|]/)
        .map((x) => String(x).trim())
        .filter(Boolean),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      seededBy: 'fixAndSeedQuestions.js',
    });
    existingKeys.add(key);
    inserted += 1;
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  return { repaired, removed, unchanged, inserted, totalExisting: snap.size };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const writeCsvOnly = args.has('--write-csv-only');
  const skipDeleteInvalid = args.has('--keep-invalid');

  const csvRows = buildSeedRows();
  const csvPath = writeCsv(csvRows);
  console.log(`[questions] CSV generated: ${csvPath}`);
  console.log(`[questions] CSV rows: ${csvRows.length}`);

  if (writeCsvOnly) return;

  const result = await runFirestoreRepairAndSeed({ deleteInvalid: !skipDeleteInvalid });
  console.log('[questions] Firestore repair/seed summary:', result);
}

main().catch((err) => {
  console.error('[questions] fatal:', err?.stack || err);
  process.exit(1);
});
