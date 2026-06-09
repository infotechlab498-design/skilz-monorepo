/**
 * Lobby-scoped Socket.IO: chat relay, typing, presence, and PeerJS ID exchange for WebRTC voice.
 * Rooms use prefix `lobby_chat:` to avoid colliding with game socket rooms.
 *
 * Presence uses `io.in(room).fetchSockets()` so it stays consistent when @socket.io/redis-adapter
 * is enabled (multi-node). Per-uid display names are stored on `socket.data`.
 */

const ROOM_PREFIX = 'lobby_chat:';

/** @param {string} lobbyId */
function roomName(lobbyId) {
  return `${ROOM_PREFIX}${String(lobbyId)}`;
}

/** @type {Map<string, Map<string, string>>} lobbyId -> uid -> peerId */
const lobbyVoicePeers = new Map();

/** @type {Map<string, number[]>} uid -> timestamps (sliding window) */
const lobbyMessageRate = new Map();
/** @type {Map<string, number[]>} */
const lobbyTypingRate = new Map();

const MESSAGE_BURST = 45;
const MESSAGE_WINDOW_MS = 60_000;
const TYPING_BURST = 80;
const TYPING_WINDOW_MS = 60_000;

function allowSlidingWindow(map, key, max, windowMs) {
  const now = Date.now();
  let arr = map.get(key);
  if (!arr) arr = [];
  arr = arr.filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    map.set(key, arr);
    return false;
  }
  arr.push(now);
  map.set(key, arr);
  return true;
}

function memberDisplayName(socket, fallbackFromPayload) {
  const n =
    (typeof fallbackFromPayload === 'string' && fallbackFromPayload.trim()) ||
    socket.user?.name ||
    (socket.user?.email && String(socket.user.email).split('@')[0]) ||
    'Player';
  return String(n).slice(0, 120);
}

/**
 * @param {import('socket.io').Server} io
 * @param {string} lobbyId
 */
async function buildPresenceUsers(io, lobbyId) {
  const sockets = await io.in(roomName(lobbyId)).fetchSockets();
  const byUid = new Map();
  for (const remote of sockets) {
    const uid = remote.data?.lobbyChatUid || remote.user?.uid;
    if (!uid) continue;
    if (!byUid.has(uid)) {
      byUid.set(uid, {
        uid,
        displayName: remote.data?.lobbyChatDisplayName || 'Player',
        socketId: remote.id,
      });
    }
  }
  return [...byUid.values()];
}

/**
 * @param {import('socket.io').Server} io
 * @param {string} lobbyId
 */
async function broadcastPresence(io, lobbyId) {
  try {
    const users = await buildPresenceUsers(io, lobbyId);
    io.to(roomName(lobbyId)).emit('lobby:presence', {
      lobbyId,
      users,
    });
  } catch (e) {
    console.warn('[lobbyChat] broadcastPresence', e?.message || e);
  }
}

function removeVoicePeer(lobbyId, uid) {
  const vm = lobbyVoicePeers.get(lobbyId);
  if (!vm) return;
  vm.delete(uid);
  if (vm.size === 0) lobbyVoicePeers.delete(lobbyId);
}

/**
 * @param {import('socket.io').Server} io
 */
export function createLobbyChatHandlers(io) {
  return function attachLobbyChat(socket) {
    /** @type {string | null} */
    let joinedLobbyId = null;

    function leaveLobbyChat(socketInstance = socket) {
      const lid = joinedLobbyId;
      if (!lid) return;
      joinedLobbyId = null;
      socketInstance.leave(roomName(lid));
      delete socketInstance.data.lobbyChatUid;
      delete socketInstance.data.lobbyChatDisplayName;
      removeVoicePeer(lid, socketInstance.user?.uid);
      socketInstance.to(roomName(lid)).emit('lobby:user_left', {
        lobbyId: lid,
        uid: socketInstance.user?.uid,
        socketId: socketInstance.id,
      });
      void broadcastPresence(io, lid);
      socketInstance.to(roomName(lid)).emit('lobby:voice:left', {
        lobbyId: lid,
        uid: socketInstance.user?.uid,
      });
    }

    socket.on('lobby:join', async (payload = {}) => {
      const lobbyId = String(payload.lobbyId ?? '').trim();
      const uid = socket.user?.uid;
      if (!lobbyId || !uid) return;

      leaveLobbyChat(socket);

      joinedLobbyId = lobbyId;
      socket.data.lobbyChatUid = uid;
      socket.data.lobbyChatDisplayName = memberDisplayName(socket, payload.displayName);
      socket.join(roomName(lobbyId));

      try {
        const users = await buildPresenceUsers(io, lobbyId);
        socket.emit('lobby:joined', {
          lobbyId,
          users,
        });

        socket.to(roomName(lobbyId)).emit('lobby:user_joined', {
          lobbyId,
          uid,
          displayName: socket.data.lobbyChatDisplayName,
        });

        await broadcastPresence(io, lobbyId);
      } catch (e) {
        console.warn('[lobbyChat] lobby:join', e?.message || e);
      }
    });

    socket.on('lobby:leave', () => {
      leaveLobbyChat(socket);
    });

    socket.on('lobby:message', (payload = {}) => {
      const lobbyId = String(payload.lobbyId ?? '').trim();
      const uid = socket.user?.uid;
      if (!lobbyId || !uid || lobbyId !== joinedLobbyId) return;

      if (!allowSlidingWindow(lobbyMessageRate, `${uid}:${lobbyId}`, MESSAGE_BURST, MESSAGE_WINDOW_MS)) {
        return;
      }

      const text = String(payload.text ?? '').trim();
      if (!text || text.length > 4000) return;

      const clientMsgId =
        typeof payload.clientMsgId === 'string' && payload.clientMsgId.length <= 128
          ? payload.clientMsgId
          : null;

      const msg = {
        lobbyId,
        uid,
        displayName: memberDisplayName(socket, payload.displayName),
        avatar: typeof payload.avatar === 'string' ? payload.avatar.slice(0, 2048) : '',
        text,
        type: 'text',
        clientMsgId,
        createdAt: Date.now(),
      };

      socket.to(roomName(lobbyId)).emit('lobby:message', msg);
    });

    socket.on('lobby:typing', (payload = {}) => {
      const lobbyId = String(payload.lobbyId ?? '').trim();
      if (!lobbyId || lobbyId !== joinedLobbyId || !socket.user?.uid) return;

      if (!allowSlidingWindow(lobbyTypingRate, `${socket.user.uid}:${lobbyId}`, TYPING_BURST, TYPING_WINDOW_MS)) {
        return;
      }

      socket.to(roomName(lobbyId)).emit('lobby:typing', {
        lobbyId,
        uid: socket.user.uid,
        displayName: memberDisplayName(socket, payload.displayName),
        typing: Boolean(payload.typing),
      });
    });

    socket.on('lobby:voice:peer', (payload = {}) => {
      const lobbyId = String(payload.lobbyId ?? '').trim();
      const peerId = String(payload.peerId ?? '').trim();
      const uid = socket.user?.uid;
      if (!lobbyId || !peerId || !uid || lobbyId !== joinedLobbyId) return;
      if (peerId.length > 512) return;

      if (!lobbyVoicePeers.has(lobbyId)) lobbyVoicePeers.set(lobbyId, new Map());
      const vm = lobbyVoicePeers.get(lobbyId);

      const peersSnapshot = [...vm.entries()].map(([u, p]) => ({ uid: u, peerId: p }));

      vm.set(uid, peerId);

      socket.emit('lobby:voice:peers', {
        lobbyId,
        peers: peersSnapshot.filter((p) => p.uid !== uid),
      });

      socket.to(roomName(lobbyId)).emit('lobby:voice:peer', {
        lobbyId,
        uid,
        peerId,
      });
    });

    socket.on('disconnect', () => {
      leaveLobbyChat(socket);
    });
  };
}
