import { RiddleClassicEngine } from './riddleClassicEngine.js';

const classic = new RiddleClassicEngine();

const engines = {
  syllogism: classic,
  riddle_text_input: classic,
  riddle_classic: classic,
  riddle_mcq_b: classic,
  riddle_sequence: classic,
  pattern_recognition: classic,
  logic_grid: classic,
  word_cipher: classic,
};

export function resolveEnigmaEngine(gameKey) {
  const key = String(gameKey || 'riddle_classic').toLowerCase();
  return engines[key] || classic;
}

export function listEnigmaEngines() {
  return Object.keys(engines);
}
