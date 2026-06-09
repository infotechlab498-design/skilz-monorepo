import { GameEngineBase } from '../engines/GameEngine.js';
import { loadEnigmaPulseQuestionPack } from '../questionProvider.js';
import {
  enrichQuestionForPlay,
  isAnswerCorrect,
  normalizeAnswer,
} from './AnswerValidator.js';

export class RiddleEngine extends GameEngineBase {
  async generateQuestions({ category, difficulty, count }) {
    const pack = await loadEnigmaPulseQuestionPack({ category, difficulty, count });
    return pack.full.map((q) => enrichQuestionForPlay(q));
  }

  validateAnswer({ question, answerText, selectedIndex }) {
    const q = enrichQuestionForPlay(question);
    let text = String(answerText ?? '').trim();
    if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex <= 3 && q.options?.length) {
      const opt = q.options[selectedIndex];
      if (opt != null && String(opt).trim()) text = String(opt);
    }
    const normalizedUser = normalizeAnswer(text);
    const correct = isAnswerCorrect(normalizedUser, q, { typoTolerance: true });
    return { correct, normalizedAnswer: normalizedUser };
  }

  calculateScore({ correct, difficulty, attemptsUsed }) {
    if (!correct) return { scoreDelta: 0, coinsDelta: 0 };
    const d = String(difficulty || 'medium').toLowerCase();
    const base = d === 'hard' ? 14 : d === 'easy' ? 8 : 10;
    const penalty = Math.max(0, Number(attemptsUsed || 1) - 1) * 2;
    const scoreDelta = Math.max(4, base - penalty);
    const coinsDelta = Math.max(1, Math.round(scoreDelta / 2));
    return { scoreDelta, coinsDelta };
  }

  getDifficultyDistribution({ difficulty }) {
    const d = String(difficulty || 'medium').toLowerCase();
    if (d === 'easy') return { easy: 0.7, medium: 0.25, hard: 0.05 };
    if (d === 'hard') return { easy: 0.1, medium: 0.35, hard: 0.55 };
    return { easy: 0.2, medium: 0.6, hard: 0.2 };
  }
}
