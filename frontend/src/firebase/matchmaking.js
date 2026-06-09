// src/firebase/matchmaking.js
// XP & Level based matchmaking helpers. Pure logic + optional persistence to Firestore.

import { v4 as uuidv4 } from 'uuid';
import { firestore } from './config.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Compute a distance between two player profiles using level and xp

function computeDistance(a = {}, b = {}) {
  const levelA = a.level ?? 1;
  const levelB = b.level ?? 1;
  const xpA = a.xp ?? 0;
  const xpB = b.xp ?? 0;

  const levelDiff = Math.abs(levelA - levelB);
  const xpDiff = Math.abs(xpA - xpB);

  // Weight level diff higher than raw XP

  return levelDiff * 10000 + xpDiff;
}

export function findBestMatch(currentPlayer, candidates = [], options = {}) {

  if (!currentPlayer) return null;
  const currentUid = currentPlayer.uid;
  const currentProfile = currentPlayer.profile || {};

  const filtered = candidates.filter((c) => c && c.profile && c.uid !== currentUid);
  if (filtered.length === 0) return null;

  const scored = filtered.map((c) => ({
    candidate: c,
    distance: computeDistance(currentProfile, c.profile),
  }));

  scored.sort((a, b) => a.distance - b.distance);

  const best = scored[0];

  const threshold = options.threshold ?? 20000;
  return best && best.distance <= threshold ? best.candidate : null;
}

export function createBotForLevel(level = 1) {
  const lv = Math.max(1, Math.floor(level));
  const uid = `bot_${lv}_${Math.random().toString(36).slice(2, 8)}`;
  const xp = lv * 1200 + Math.floor(Math.random() * 500);
  const difficulty = lv;

  return {
    uid,
    isBot: true,
    profile: {
      displayName: `Bot Lv${lv}`,
      avatar: '/vite.svg',
      xp,
      level: lv,
      difficulty,
    },
    presence: { status: 'online', meta: { displayName: `Bot Lv${lv}` } },
  };
}

export async function createMatch(currentPlayer, opponentPlayer, options = {}) {
  const mode = options.mode || '1v1';
  const status = options.status || 'waiting';

  const matchObj = {
    id: options.id || uuidv4(),
    players: [
      { uid: currentPlayer.uid, profile: currentPlayer.profile || {} },
      { uid: opponentPlayer.uid, profile: opponentPlayer.profile || {} },
    ],
    mode,
    status,
    createdAt: new Date().toISOString(),
  };

  if (options.persist && firestore) {
    try {
      const col = collection(firestore, 'lobbies');
      const docRef = await addDoc(col, {
        ...matchObj,
        createdAt: serverTimestamp(),
      });
      return { ...matchObj, docId: docRef.id };
    } catch {
      /* Firestore optional; in-memory match still returned below */
    }
  }

  return matchObj;
}

export default {
  findBestMatch,
  createBotForLevel,
  createMatch,
};
