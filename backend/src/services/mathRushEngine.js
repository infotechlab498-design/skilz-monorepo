/**
 * Server-side Math Rush problem generation (must match client logic in
 * src/games/mathRush/lib/utils.js).
 */

/** Map UI difficulty including "rush" to generator tier. */
export function normalizeDifficulty(d) {
  const x = String(d || 'easy').toLowerCase();
  if (x === 'rush') return 'hard';
  if (['easy', 'medium', 'hard'].includes(x)) return x;
  return 'easy';
}

export function generateProblem(difficultyRaw) {
  const difficulty = normalizeDifficulty(difficultyRaw);
  const id = Math.random().toString(36).substring(7);
  let question = '';
  let answer = 0;

  const getNum = (max) => Math.floor(Math.random() * max) + 1;

  if (difficulty === 'easy') {
    const a = getNum(12);
    const b = getNum(12);
    const op = Math.random() > 0.5 ? '+' : '-';
    if (op === '+') {
      question = `${a} + ${b}`;
      answer = a + b;
    } else {
      const max = Math.max(a, b);
      const min = Math.min(a, b);
      question = `${max} - ${min}`;
      answer = max - min;
    }
  } else if (difficulty === 'medium') {
    const a = getNum(20);
    const b = getNum(15);
    const op = Math.random() > 0.6 ? 'x' : Math.random() > 0.3 ? '+' : '-';
    if (op === 'x') {
      question = `${a} x ${b}`;
      answer = a * b;
    } else if (op === '+') {
      const c = getNum(20);
      question = `${a} + ${b} + ${c}`;
      answer = a + b + c;
    } else {
      question = `${a + b} - ${a}`;
      answer = b;
    }
  } else {
    const a = getNum(15);
    const b = getNum(12);
    const c = getNum(50);
    const op2 = Math.random() > 0.5 ? '+' : '-';
    if (op2 === '+') {
      question = `(${a} x ${b}) + ${c}`;
      answer = a * b + c;
    } else {
      question = `(${a} x ${b}) - ${c}`;
      answer = a * b - c;
    }
  }

  return {
    id,
    question,
    answer,
    options: [],
    target: answer,
  };
}
