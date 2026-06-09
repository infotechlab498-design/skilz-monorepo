import { auth } from '../../firebase/config.js';
import {
  createUser as createFirestoreUser,
  getUser as getFirestoreUser,
} from '../../services/userService.js';
import { callUpdateGameStats } from '../../api/cloudFunctionsApi.js';

export const api = {
  async createUser(uid, displayName, photoURL) {
    const cu = auth.currentUser;
    if (!cu || cu.uid !== uid) {
      throw new Error('Sign in with Firebase before creating a wallet row');
    }
    return createFirestoreUser(uid, {
      displayName: displayName || cu.displayName || 'Player',
      photoURL: photoURL || cu.photoURL || '',
      email: cu.email || null,
      coins: 200,
      xp: 0,
    });
  },

  async getUser(uid) {
    const user = await getFirestoreUser(uid);
    if (!user) throw new Error('User not found');
    return user;
  },

  async deductCoins(uid, amount) {
    void uid;
    await callUpdateGameStats({ coinsDelta: -Math.abs(Number(amount) || 0), xpDelta: 0 });
    return getFirestoreUser(auth.currentUser?.uid || uid);
  },

  async updateScore(uid, score, streak, coinsGained, isWinner, successCount, failureCount) {
    void streak;
    const xpDelta = Math.max(0, Number(score) || 0);
    const coinsDelta = Number(coinsGained) || 0;
    await callUpdateGameStats({
      coinsDelta,
      xpDelta,
      winsDelta: isWinner ? 1 : 0,
      challengesDelta: 1,
      mathRush: {
        matches: 1,
        wins: isWinner ? 1 : 0,
        failures: Number(failureCount) || 0,
        successes: Number(successCount) || 0,
      },
    });
    return getFirestoreUser(uid);
  },

  async getLeaderboard() {
    return [];
  },

  async createGame(gameId, players) {
    void gameId;
    void players;
    return { success: true };
  },

  async updateGameScore(gameId, playerId, score, successCount, failureCount) {
    void gameId;
    void playerId;
    void score;
    void successCount;
    void failureCount;
    return { success: true };
  },

  async quitGame(gameId, playerId, score, successCount, failureCount) {
    void gameId;
    void playerId;
    void score;
    void successCount;
    void failureCount;
    return { success: true };
  },

  async getGameData(gameId) {
    void gameId;
    return null;
  },
};
