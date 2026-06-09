/**
 * EnigmaPulse socket payload validators (queue, submit, invite).
 */

import { WORD_CIPHER_CATEGORY } from './categories.js';

function safeText(v, fallback = '') {
  return typeof v === 'string' ? v.trim() : fallback;
}

const ALLOWED_ENIGMA_GAME_KEYS = new Set([
  'riddle_text_input',
  'riddle_classic',
  'riddle_mcq_b',
  'riddle_sequence',
  'pattern_recognition',
  'logic_grid',
  'word_cipher',
  'syllogism',
]);

function normalizeDifficulty(raw) {
  const d = safeText(raw, 'easy').toLowerCase();
  return d === 'hard' || d === 'medium' ? d : 'easy';
}

function normalizeGameKey(raw) {
  const key = safeText(raw, 'riddle_classic').toLowerCase();
  return ALLOWED_ENIGMA_GAME_KEYS.has(key) ? key : 'riddle_classic';
}

function normalizeCategory(raw, gameKey) {
  const gk = String(gameKey || '').toLowerCase();
  if (gk === 'syllogism') return 'Syllogism';
  if (gk === 'word_cipher') return WORD_CIPHER_CATEGORY;
  return safeText(raw, 'General Knowledge');
}

export function validateQueuePayload(payload = {}) {
  const gameKey = normalizeGameKey(payload.gameKey);
  return {
    displayName: safeText(payload.displayName, 'Player'),
    photoURL: safeText(payload.photoURL, ''),
    difficulty: normalizeDifficulty(payload.difficulty),
    category: normalizeCategory(payload.category, gameKey),
    gameKey,
    xp: Number(payload.xp || 0),
    soloBot: Boolean(payload.soloBot),
  };
}

export function validateJoinPrivatePayload(payload = {}) {
  return {
    roomId: safeText(payload.roomId),
    displayName: safeText(payload.displayName, 'Player'),
    photoURL: safeText(payload.photoURL, ''),
  };
}

/**
 * EnigmaPulse `ep_submit_answer` payload (not used by Trivia/MathRush).
 * Text answers are primary; `selectedIndex` is legacy-only fallback.
 */
export function validateSubmitPayload(payload = {}) {
  const roomId = safeText(payload.roomId);
  const questionId = safeText(payload.questionId);
  const selectedIndex = payload.selectedIndex == null ? null : Number(payload.selectedIndex);
  const answerText = safeText(payload.answerText);
  const questionIndex = Number(payload.questionIndex);
  const useDoublePoints = Boolean(payload.useDoublePoints);
  const hasOption = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex <= 3;
  const hasText = answerText.length > 0;
  return {
    roomId,
    questionId,
    selectedIndex,
    answerText,
    questionIndex,
    useDoublePoints,
    valid:
      !!roomId &&
      (hasOption || hasText) &&
      Number.isInteger(questionIndex) &&
      questionIndex >= 0,
  };
}

export function validateInvitePayload(payload = {}) {
  const gameKey = normalizeGameKey(payload.gameKey);
  return {
    targetUserId: safeText(payload.targetUserId),
    targetEmail: safeText(payload.targetEmail),
    category: normalizeCategory(payload.category, gameKey),
    difficulty: normalizeDifficulty(payload.difficulty || 'medium'),
    gameKey,
  };
}

export function validateSequenceQuestionPayload(payload = {}) {
  const sequence = Array.isArray(payload.sequence)
    ? payload.sequence.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const options = Array.isArray(payload.options)
    ? payload.options.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const correctIndex = Number(payload.correctIndex);
  const patternKind = safeText(payload.patternKind).toLowerCase();
  const hint = safeText(payload.hint);
  const explanation = safeText(payload.explanation);
  const validPatternKinds = new Set([
    '',
    'arithmetic',
    'geometric',
    'exponential',
    'fibonacci',
    'prime',
    'alternating',
    'multi_step',
  ]);
  return {
    sequence,
    options,
    correctIndex,
    patternKind,
    hint,
    explanation,
    valid:
      sequence.length >= 3 &&
      options.length === 4 &&
      Number.isInteger(correctIndex) &&
      correctIndex >= 0 &&
      correctIndex <= 3 &&
      validPatternKinds.has(patternKind),
  };
}
