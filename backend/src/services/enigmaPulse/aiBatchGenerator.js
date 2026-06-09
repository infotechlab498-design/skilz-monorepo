import { getAdminFirestore } from '../firebaseAdmin.js';
import { normalizeAnswer } from './engine/AnswerValidator.js';

function providerName() {
  return String(process.env.ENIGMA_PULSE_AI_PROVIDER || 'openai').toLowerCase();
}

const MAX_QUESTION_TEXT_LEN = 220;
const MAX_OPTION_LEN = 80;
const MAX_ACCEPTED_ALIAS = 12;

function validateGeneratedShape(q) {
  if (!q || typeof q !== 'object') return false;
  const text = String(q.text || '').trim();
  if (!text || text.length > MAX_QUESTION_TEXT_LEN) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  const opts = q.options.map((x) => String(x).trim()).filter(Boolean);
  if (opts.length !== 4) return false;
  if (opts.some((o) => o.length > MAX_OPTION_LEN)) return false;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) return false;
  const ci = Number(q.correctIndex);
  if (!Number.isInteger(ci) || ci < 0 || ci > 3) return false;
  return true;
}

function buildPersistDoc(q, category, difficulty, source) {
  const text = String(q.text).trim();
  const options = q.options.map((x) => String(x).trim());
  const correctIndex = Number(q.correctIndex);
  const canonical = String(options[correctIndex] || '').trim();

  let acceptedAnswers = [];
  if (Array.isArray(q.acceptedAnswers)) {
    acceptedAnswers = q.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_ACCEPTED_ALIAS);
  }
  if (!acceptedAnswers.length && canonical) acceptedAnswers = [canonical];

  const normalizedAnswer =
    typeof q.normalizedAnswer === 'string' && q.normalizedAnswer.trim()
      ? normalizeAnswer(q.normalizedAnswer)
      : normalizeAnswer(canonical);

  const dedup = [];
  const seen = new Set();
  for (const a of acceptedAnswers) {
    const key = a.toLowerCase();
    if (seen.has(key) || a.length > MAX_OPTION_LEN * 2) continue;
    seen.add(key);
    dedup.push(a);
  }
  acceptedAnswers = dedup.slice(0, MAX_ACCEPTED_ALIAS);

  return {
    text,
    options,
    correctIndex,
    acceptedAnswers,
    normalizedAnswer,
    category,
    difficulty,
    source,
    active: true,
    gameType: 'enigma_pulse',
    createdAt: new Date(),
  };
}

async function generateWithOpenAI({ category, difficulty, count }) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY is required for batch generation');
  }
  const prompt = `Generate ${count} trivia questions for EnigmaPulse (text-typed answers; MCQ fields are legacy compatibility only).
Category: ${category}
Difficulty: ${difficulty}
Rules:
- Question text must be clear and unambiguous; under ${MAX_QUESTION_TEXT_LEN} characters.
- Four options: one clearly correct; distractors plausible but not ambiguous.
- acceptedAnswers: short literal strings players might type (synonyms, spacing variants). Max ${MAX_ACCEPTED_ALIAS} entries.
- normalizedAnswer: canonical normalized form (lowercase, no punctuation) of the primary correct answer (usually same as correct option text after normalization).

Return strict JSON array only, no markdown:
[{"text":"...","options":["a","b","c","d"],"correctIndex":0,"acceptedAnswers":["a","a option"],"normalizedAnswer":"a"}]`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: prompt,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }
  const json = await response.json();
  const text = json?.output?.[0]?.content?.[0]?.text || '[]';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('OpenAI returned non-JSON question payload');
  }
  if (!Array.isArray(parsed)) throw new Error('OpenAI JSON must be an array');
  return parsed;
}

export async function generateQuestionBatch({ category, difficulty, count }) {
  const provider = providerName();
  if (provider !== 'openai') {
    throw new Error(`Unsupported ENIGMA_PULSE_AI_PROVIDER: ${provider}`);
  }
  const raw = await generateWithOpenAI({ category, difficulty, count });
  const out = [];
  for (const q of raw) {
    if (!validateGeneratedShape(q)) continue;
    out.push(q);
  }
  return out;
}

export async function persistQuestionBatch(questions, { category, difficulty, source = 'openai-batch' }) {
  const db = getAdminFirestore();
  if (!db) throw new Error('Firestore Admin is not configured');
  const batch = db.batch();
  let saved = 0;
  for (const q of questions) {
    if (!validateGeneratedShape(q)) continue;
    const ref = db.collection('questions').doc();
    batch.set(ref, buildPersistDoc(q, category, difficulty, source));
    saved += 1;
  }
  if (saved > 0) await batch.commit();
  return { saved };
}
