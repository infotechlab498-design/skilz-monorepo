export function cn(...inputs) {
  return inputs.flat().filter(Boolean).join(' ');
}

export function generateProblem(difficulty) {
  const id = Math.random().toString(36).substring(7);
  let question = "";
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
    // Hard: mix of multiplication and addition/subtraction
    const a = getNum(15);
    const b = getNum(12);
    const c = getNum(50);
    const op2 = Math.random() > 0.5 ? '+' : '-';
    
    if (op2 === '+') {
      question = `(${a} x ${b}) + ${c}`;
      answer = (a * b) + c;
    } else {
      question = `(${a} x ${b}) - ${c}`;
      answer = (a * b) - c;
    }
  }

  return {
    id,
    question,
    answer,
    options: [], // Not used in this version
    target: answer
  };
}

export function calculateXP(score, streak) {
  return Math.floor(score * 0.1) + (streak * 5);
}

export function getLevelFromXP(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

