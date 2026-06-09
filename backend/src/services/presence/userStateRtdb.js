/**
 * Server-authoritative RTDB `userState/{uid}` for matchmaking / room context (available-players API).
 * Complements client-written `presence/{uid}` (heartbeat). Admin SDK bypasses RTDB rules.
 */
import { ServerValue } from 'firebase-admin/database';
import { getAdminDatabase } from '../firebaseAdmin.js';

/** @type {Map<string, Set<string>>} */
const uidToSocketIds = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const offlineTimers = new Map();

function graceMs() {
  const n = Number(process.env.SOCKET_PRESENCE_GRACE_MS);
  if (Number.isFinite(n) && n >= 2000 && n <= 120000) return n;
  return 8000;
}

function rtdb() {
  return getAdminDatabase();
}

async function updateRef(path, data) {
  const db = rtdb();
  if (!db) return;
  try {
    await db.ref(path).update(data);
  } catch (e) {
    console.warn('[userStateRtdb] update failed', path, e?.message || e);
  }
}

/**
 * Merge fields under `userState/{uid}` (always sets updatedAt).
 * @param {string} uid
 * @param {Record<string, unknown>} fields
 */
export async function mergeUserState(uid, fields) {
  const u = String(uid || '').trim();
  if (!u) return;
  await updateRef(`userState/${u}`, {
    ...fields,
    updatedAt: ServerValue.TIMESTAMP,
  });
}

/** @param {import('socket.io').Server} io */
export async function emitOnlinePlayersRefresh(io, uid) {
  const u = String(uid || '').trim();
  if (!u || !io) return;
  try {
    io.to(`uid:${u}`).emit('onlinePlayers:update', { at: Date.now() });
  } catch {
    /* ignore */
  }
}

function clearGrace(uid) {
  const t = offlineTimers.get(uid);
  if (t) {
    clearTimeout(t);
    offlineTimers.delete(uid);
  }
}

/**
 * Authenticated Socket.IO connection: track multi-tab, cancel pending offline.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function onPresenceSocketConnected(io, socket) {
  const uid = String(socket.user?.uid || '').trim();
  if (!uid) return;
  if (!uidToSocketIds.has(uid)) uidToSocketIds.set(uid, new Set());
  uidToSocketIds.get(uid).add(socket.id);
  clearGrace(uid);
  socket.join(`uid:${uid}`);
  const count = uidToSocketIds.get(uid).size;
  void mergeUserState(uid, {
    socketCount: count,
    lastSocketId: socket.id,
  });
  void updateRef(`presence/${uid}`, {
    online: true,
    lastSeen: ServerValue.TIMESTAMP,
  });
  void emitOnlinePlayersRefresh(io, uid);
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function onPresenceSocketDisconnected(io, socket) {
  const uid = String(socket.user?.uid || '').trim();
  if (!uid) return;
  const set = uidToSocketIds.get(uid);
  if (set) {
    set.delete(socket.id);
    if (set.size === 0) {
      uidToSocketIds.delete(uid);
      scheduleGraceDisconnect(io, uid);
    } else {
      void mergeUserState(uid, {
        socketCount: set.size,
      });
    }
  }
}

/** @param {import('socket.io').Server} io */
function scheduleGraceDisconnect(io, uid) {
  clearGrace(uid);
  const tid = setTimeout(() => {
    offlineTimers.delete(uid);
    if (uidToSocketIds.has(uid) && uidToSocketIds.get(uid).size > 0) return;
    void applyGraceOffline(io, uid);
  }, graceMs());
  offlineTimers.set(uid, tid);
}

/** @param {import('socket.io').Server} io */
async function applyGraceOffline(io, uid) {
  await mergeUserState(uid, {
    socketCount: 0,
    inQueue: false,
    ludoRoomId: null,
    inPlayingMatch: false,
    lastSocketId: null,
  });
  await updateRef(`presence/${uid}`, {
    online: false,
    status: 'offline',
    game: null,
    lastSeen: ServerValue.TIMESTAMP,
  });
  void emitOnlinePlayersRefresh(io, uid);
}

/**
 * Socket ping from client (10–15s) — refreshes server-visible activity.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function onPresencePing(io, socket) {
  const uid = String(socket.user?.uid || '').trim();
  if (!uid) return;
  void mergeUserState(uid, { lastPingAt: ServerValue.TIMESTAMP });
  void updateRef(`presence/${uid}`, {
    online: true,
    lastSeen: ServerValue.TIMESTAMP,
  });
  void emitOnlinePlayersRefresh(io, uid);
}

export async function setLudoQueueState(uid, inQueue) {
  const u = String(uid || '').trim();
  if (!u) return;
  await mergeUserState(u, { inQueue: Boolean(inQueue) });
}

/**
 * User is in a Ludo room (lobby or match). `inPlayingMatch` when board is active.
 * @param {string} uid
 * @param {string | null} roomId
 * @param {{ playing?: boolean }} [opts]
 */
export async function setLudoRoomContext(uid, roomId, opts = {}) {
  const u = String(uid || '').trim();
  if (!u) return;
  const rid = roomId ? String(roomId).trim() : null;
  await mergeUserState(u, {
    inQueue: false,
    ludoRoomId: rid,
    inPlayingMatch: Boolean(opts.playing),
  });
}

export async function clearLudoRoomContext(uid) {
  await setLudoRoomContext(uid, null, { playing: false });
}

export async function refreshLudoRoomContexts(io, uids) {
  const list = [...new Set((uids || []).map((u) => String(u || '').trim()).filter(Boolean))];
  await Promise.all(list.map((u) => emitOnlinePlayersRefresh(io, u)));
}
