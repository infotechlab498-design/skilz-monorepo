import { ref, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase/config.js';

let detach = null;
/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatInterval = null;
const HEARTBEAT_MS = 12000;

/**
 * RTDB presence for lobby / friends online (requires `VITE_FIREBASE_DATABASE_URL`).
 * This is actively consumed by player/friends hooks, so it remains enabled.
 */
/**
 * @param {string} uid
 * @param {'lobby'|'ludo-lobby'|'ludo-game'|string} [mode] 
 * Second arg is presence mode: `lobby` (default), `ludo-lobby` (Ludo matchmaking UI, still "available"), `ludo-game` (in a Ludo room/match), or legacy game id string → `in-game`.
 */
export function startUserPresence(uid, mode = 'lobby') {
   // OLD RTDB PRESENCE LOGIC (DISABLED)
  // Earlier variants wrote inconsistent presence shapes; use unified payload below.
  stopUserPresence();
  if (!rtdb || !uid) return;
  const r = ref(rtdb, `presence/${uid}`);
  const m = mode === undefined || mode === null ? 'lobby' : String(mode);
  const onlinePayload = () => {
    if (m === 'lobby') {
      return { online: true, status: 'online', game: 'lobby', lastSeen: serverTimestamp() };
    }
    if (m === 'ludo-lobby') {
      return { online: true, status: 'online', game: 'ludo', lastSeen: serverTimestamp() };
    }
    if (m === 'ludo-game') {
      return { online: true, status: 'in-game', game: 'ludo', lastSeen: serverTimestamp() };
    }
    return {
      online: true,
      status: 'in-game',
      game: m,
      lastSeen: serverTimestamp(),
    };
  };
  const offlinePayload = {
    online: false,
    status: 'offline',
    game: null,
    lastSeen: serverTimestamp(),
  };
  set(r, onlinePayload()).catch(() => {});
  onDisconnect(r).set(offlinePayload);
  heartbeatInterval = setInterval(() => {
    set(r, onlinePayload()).catch(() => {});
  }, HEARTBEAT_MS);
  detach = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    set(r, offlinePayload).catch(() => {});
    detach = null;
  };
}

export function stopUserPresence() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (typeof detach === 'function') {
    detach();
  }
}
