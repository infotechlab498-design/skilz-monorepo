/**
 * EnigmaPulse-only text answer normalization and validation.
 * Keeps compatibility with legacy MCQ fields (options[], correctIndex) via {@link enrichQuestionForPlay}.
 */

/** @param {unknown} input */
export function normalizeAnswer(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array(n + 1);
  for (let j = 0; j <= n; j += 1) row[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Build normalized accepted variants from a question row (post-{@link enrichQuestionForPlay}).
 * @param {Record<string, unknown>} question
 * @returns {string[]}
 */
export function normalizedAcceptedSet(question) {
  const out = new Set();
  const primary = typeof question.normalizedAnswer === 'string' ? question.normalizedAnswer.trim() : '';
  if (primary) out.add(primary);
  const list = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
  for (const raw of list) {
    const n = normalizeAnswer(raw);
    if (n) out.add(n);
  }
  return [...out];
}

/**
 * @param {Record<string, unknown>} question
 */
export function enrichQuestionForPlay(question) {
  const q = question && typeof question === 'object' ? { ...question } : {};
  const options = Array.isArray(q.options) ? q.options.map((x) => String(x)) : [];
  const ci = Number(q.correctIndex);
  const canonicalText =
    Number.isInteger(ci) && ci >= 0 && ci < options.length ? String(options[ci] || '').trim() : '';

  /** @type {string[]} */
  let acceptedAnswers = [];
  if (Array.isArray(q.acceptedAnswers)) {
    acceptedAnswers = q.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean);
  } else if (typeof q.acceptedAnswers === 'string' && q.acceptedAnswers.trim()) {
    acceptedAnswers = String(q.acceptedAnswers)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!acceptedAnswers.length && canonicalText) {
    acceptedAnswers = [canonicalText];
  }

  const normalizedAnswer =
    typeof q.normalizedAnswer === 'string' && q.normalizedAnswer.trim()
      ? normalizeAnswer(q.normalizedAnswer)
      : normalizeAnswer(canonicalText);

  return {
    ...q,
    options,
    correctIndex: Number.isInteger(ci) ? ci : 0,
    acceptedAnswers,
    normalizedAnswer,
  };
}

/**
 * @param {string} normalizedUser
 * @param {Record<string, unknown>} question enriched
 * @param {{ typoTolerance?: boolean }} [opts]
 */
export function isAnswerCorrect(normalizedUser, question, opts = {}) {
  const nu = String(normalizedUser || '').trim();
  if (!nu) return false;
  const typoTolerance = opts.typoTolerance !== false;
  const accepted = normalizedAcceptedSet(question);
  for (const a of accepted) {
    if (!a) continue;
    if (nu === a) return true;
    if (typoTolerance && nu.length >= 4 && a.length >= 4 && levenshtein(nu, a) <= 1) return true;
  }
  return false;
}

/**
 * First-character hint from canonical display text (not full answer).
 * @param {Record<string, unknown>} question
 */
export function getHintPreview(question) {
  const options = Array.isArray(question.options) ? question.options : [];
  const ci = Number(question.correctIndex);
  const fromOption =
    Number.isInteger(ci) && ci >= 0 && ci < options.length ? String(options[ci] || '').trim() : '';
  const fromAccepted =
    Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length
      ? String(question.acceptedAnswers[0] || '').trim()
      : '';
  const ans = fromOption || fromAccepted;
  if (!ans) return 'Think step by step';
  return `${ans.slice(0, 1)}... (${ans.length} letters)`;
}
