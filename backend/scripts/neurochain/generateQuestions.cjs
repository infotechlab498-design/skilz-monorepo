/**
 * Generates neurochainQuestions.json (200+ tiered pattern puzzles).
 * Run: node backend/scripts/neurochain/generateQuestions.cjs
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../functions/data/neurochainQuestions.json');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeOptions(correct, wrongs) {
  const opts = shuffle([correct, ...wrongs]);
  const correctIndex = opts.indexOf(correct);
  return { options: opts.map(String), correctIndex };
}

const questions = [];
let seq = 0;

function add(q) {
  seq += 1;
  questions.push({ id: `nc_${seq}`, ...q });
}

// --- Easy: +k, *k small ---
for (let k = 2; k <= 12; k += 1) {
  const start = k + 1;
  const s = [start, start + k, start + 2 * k, start + 3 * k];
  const next = start + 4 * k;
  const { options, correctIndex } = makeOptions(next, [next + 1, next - k, next + k]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'easy',
    patternType: 'addition',
  });
}

for (let m = 2; m <= 6; m += 1) {
  const a = m + 1;
  const s = [a, a * m, a * m * m, a * m ** 3].map((x) => Math.min(x, 9999));
  const next = a * m ** 4;
  if (next > 99999) continue;
  const { options, correctIndex } = makeOptions(next, [next + m, next - 1, next + 2 * m]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'easy',
    patternType: 'multiplication',
  });
}

// --- Medium: *3 style, alternating ---
for (let base = 2; base <= 20; base += 1) {
  const s = [base, base * 3, base * 9, base * 27];
  if (s[3] > 50000) continue;
  const next = base * 81;
  const { options, correctIndex } = makeOptions(next, [next + 3, base * 80, next - base]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'medium',
    patternType: 'multiplication',
  });
}

for (let a = 1; a <= 25; a += 1) {
  const s = [a, a + 2, a + 4, a + 6];
  const next = a + 8;
  const { options, correctIndex } = makeOptions(next, [next + 1, a + 7, next - 2]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'medium',
    patternType: 'addition',
  });
}

for (let x = 5; x <= 40; x += 1) {
  const s = [x, x + 1, x + 3, x + 6];
  const next = x + 10;
  const { options, correctIndex } = makeOptions(next, [x + 9, x + 11, x + 8]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'medium',
    patternType: 'alternating',
  });
}

// --- Hard: powers, primes ---
for (let p = 2; p <= 12; p += 1) {
  const s = [2 ** p, 2 ** (p + 1), 2 ** (p + 2), 2 ** (p + 3)];
  if (s[3] > 100000) continue;
  const next = 2 ** (p + 4);
  const { options, correctIndex } = makeOptions(next, [next - 2 ** p, next + 2 ** p, next + 1]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'hard',
    patternType: 'powers',
  });
}

const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
for (let i = 0; i + 4 < primes.length; i += 1) {
  const s = primes.slice(i, i + 4);
  const next = primes[i + 4];
  const { options, correctIndex } = makeOptions(next, [next + 2, next - 2, primes[i + 3] + 1]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'hard',
    patternType: 'primes',
  });
}

for (let n = 10; n <= 80; n += 3) {
  const s = [n, n * n, n, n * n];
  const next = n;
  const wrongs = [n + 1, n - 1, n * 2];
  const { options, correctIndex } = makeOptions(next, wrongs);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'hard',
    patternType: 'alternating',
  });
}

// More medium *2 chains
for (let t = 3; t <= 35; t += 1) {
  const s = [t, t * 2, t * 4, t * 8];
  if (s[3] > 40000) continue;
  const next = t * 16;
  const { options, correctIndex } = makeOptions(next, [next + t, next - 2, t * 15]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'medium',
    patternType: 'multiplication',
  });
}

// Easy subtract pattern
for (let s0 = 50; s0 <= 90; s0 += 1) {
  const d = 4;
  const s = [s0, s0 - d, s0 - 2 * d, s0 - 3 * d];
  const next = s0 - 4 * d;
  const { options, correctIndex } = makeOptions(next, [next + 1, next - 1, s0 - 3 * d - 1]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: 'easy',
    patternType: 'addition',
  });
}

// Pad to 220+ with mixed easy fib-like
let a = 1;
let b = 1;
for (let i = 0; i < 120; i += 1) {
  const s = [a, b, a + b, a + 2 * b];
  const next = 2 * a + 3 * b;
  const na = b;
  const nb = a + b;
  a = na;
  b = nb;
  if (next > 50000 || next < 2) continue;
  const tier = questions.length % 3 === 0 ? 'easy' : questions.length % 3 === 1 ? 'medium' : 'hard';
  const { options, correctIndex } = makeOptions(next, [next + 1, next - 2, next + 3]);
  add({
    sequence: s.map(String).concat('?'),
    options,
    correctIndex,
    difficulty: tier,
    patternType: 'addition',
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(questions, null, 0), 'utf8');
console.log('Wrote', questions.length, 'questions to', OUT);
