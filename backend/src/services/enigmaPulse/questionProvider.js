import { ENIGMA_PULSE } from '../../../../shared/enigmaPulse/constants.js';
import { getAdminFirestore } from '../firebaseAdmin.js';
import { getQuestions as getFirestoreQuestions } from './firestoreRepos.js';
import { getLocalQuestions } from './localQuestionBank.js';

function toClientQuestion(q) {
  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl || '',
    category: q.category,
    difficulty: q.difficulty,
  };
}

function questionSourceMode() {
  const raw = String(process.env.ENIGMA_PULSE_QUESTION_SOURCE || 'auto').toLowerCase().trim();
  if (raw === 'local' || raw === 'firestore' || raw === 'auto') return raw;
  return 'auto';
}

/**
 * @param {{ category: string; difficulty: string; count: number }} args
 */
async function fetchQuestionRows(args) {
  const mode = questionSourceMode();

  if (mode === 'local') {
    return getLocalQuestions(args);
  }
  if (mode === 'firestore') {
    return getFirestoreQuestions(args);
  }
  // auto
  const db = getAdminFirestore();
  if (!db) {
    return getLocalQuestions(args);
  }
  try {
    const rows = await getFirestoreQuestions(args);
    if (!rows.length) {
      return getLocalQuestions(args);
    }
    return rows;
  } catch (e) {
    console.warn('[EnigmaPulse] Firestore question fetch failed, using local bank:', e?.message || e);
    return getLocalQuestions(args);
  }
}

export async function loadEnigmaPulseQuestionPack({ category, difficulty, count = ENIGMA_PULSE.QUESTION_COUNT }) {
  const rows = await fetchQuestionRows({ category, difficulty, count });
  const filtered = [];
  const seen = new Set();
  let dupCount = 0;
  let invalidOptionsCount = 0;
  let invalidCorrectIndexCount = 0;
  for (const row of rows) {
    const key = `${row.category}|${row.difficulty}|${row.text}`;
    if (seen.has(key)) {
      dupCount += 1;
      continue;
    }
    if (!Array.isArray(row.options) || row.options.length !== 4) {
      invalidOptionsCount += 1;
      continue;
    }
    const parsedCorrectIndex = Number(row.correctIndex);
    if (
      !Number.isInteger(parsedCorrectIndex) ||
      parsedCorrectIndex < 0 ||
      parsedCorrectIndex > 3
    ) {
      invalidCorrectIndexCount += 1;
      continue;
    }
    seen.add(key);
    filtered.push({
      id: row.id,
      text: row.text,
      imageUrl: row.imageUrl || '',
      options: row.options.slice(0, 4),
      correctIndex: parsedCorrectIndex,
      acceptedAnswers: Array.isArray(row.acceptedAnswers)
        ? row.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean)
        : [],
      normalizedAnswer:
        typeof row.normalizedAnswer === 'string' ? String(row.normalizedAnswer).trim() : '',
      category: row.category,
      difficulty: row.difficulty,
    });
  }
  console.log('After filtering:', filtered.length);
  if (filtered.length < ENIGMA_PULSE.QUESTION_COUNT) {
    console.warn(
      `[EnigmaPulse] low question pool after filtering: category=${category} difficulty=${difficulty} usable=${filtered.length} required=${ENIGMA_PULSE.QUESTION_COUNT}`
    );
  }
  const selected = filtered.slice(0, ENIGMA_PULSE.QUESTION_COUNT);
  return {
    full: selected,
    client: selected.map(toClientQuestion),
  };
}
