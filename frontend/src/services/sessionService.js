
/**
 * Game Session Service (Ludo Master)
 * Handles persistence for match configuration and state.
 * Initially using localStorage, ready for Backend/Firebase scaling.
 */

import { auth } from '../firebase/config.js';

const STORAGE_KEY_PREFIX = 'ludo_session_';

export const sessionService = {
  /**
   * Current signed-in Firebase user id (no localStorage auth persistence).
   */
  getUserId() {
    return auth.currentUser?.uid || null;
  },

  /**
   * Creates a new game session and returns the ID
   */
  createSession(config) {
    const gameId = `game-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
    const sessionData = {
      gameId,
      config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'LOBBY',
      state: null
    };

    this.saveSession(gameId, sessionData);
    return gameId;
  },

  /**
   * Retrieves an existing session by ID
   */
  getSession(gameId) {
    const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${gameId}`);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (err) {
      console.error('Session recovery failed:', err);
      return null;
    }
  },

  /**
   * Internal save method
   */
  saveSession(gameId, data) {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${gameId}`,
      JSON.stringify({ ...data, updatedAt: new Date().toISOString() })
    );
  },

  /**
   * Persists real-time match progress (tokens, turns, etc.)
   */
  saveGameProgress(gameId, gameState) {
    const session = this.getSession(gameId);
    if (session) {
      this.saveSession(gameId, { ...session, state: gameState, status: 'PLAYING' });
    }
  },

  /**
   * Cleans up a session
   */
  deleteSession(gameId) {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${gameId}`);
  }
};
