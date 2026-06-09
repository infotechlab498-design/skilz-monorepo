/**
 * @typedef {Object} GameEngine
 * @property {(args: { category: string, difficulty: string, count: number }) => Promise<Array<Record<string, any>>>} generateQuestions
 * @property {(args: { question: Record<string, any>, answerText?: string, selectedIndex?: number }) => { correct: boolean, normalizedAnswer: string }} validateAnswer
 * @property {(args: { correct: boolean, difficulty: string, attemptsUsed: number }) => { scoreDelta: number, coinsDelta: number }} calculateScore
 * @property {(args: { difficulty: string }) => { easy: number, medium: number, hard: number }} getDifficultyDistribution
 */

export class GameEngineBase {
  async generateQuestions() {
    throw new Error('generateQuestions() not implemented');
  }

  validateAnswer() {
    throw new Error('validateAnswer() not implemented');
  }

  calculateScore() {
    throw new Error('calculateScore() not implemented');
  }

  getDifficultyDistribution() {
    throw new Error('getDifficultyDistribution() not implemented');
  }
}
