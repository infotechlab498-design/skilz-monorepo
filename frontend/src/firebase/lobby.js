// src/firebase/lobby.js
// Lobby management. Demo mode active — uses REST API/SQLite backend.

// --- DEMO MODE / SQLITE BACKEND STUBS ---

export async function createLobby(ownerPlayer, options = {}) {
  console.warn('[Demo] Creating lobby via API/SQLite.');
  try {
    const res = await fetch('/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerUid: ownerPlayer.uid, options })
    });
    return await res.json();
  } catch (_err) {
    return { id: `demo_${Date.now()}`, ...options, players: [ownerPlayer.uid] };
  }
}

export async function sendInvite(lobbyId, invitee, inviter) {
  console.warn('[Demo] Sending invite via API/SQLite.');
  // This will be called for each invited player in handleConfirmInvite
  return await fetch('/api/invite/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lobbyId, invitee, inviterUid: inviter.uid })
  });
}

export async function getLobby() { return null; }
export async function joinLobby(lobbyId, player) { return { id: lobbyId, players: [player] }; }
export async function leaveLobby() { return null; }
export async function setPlayerReady() { return null; }
export async function setLobbyStatus() { return null; }
export function subscribeToLobby(lobbyId, callback) {
  callback(null);
  return () => { };
}
export async function startMatch() { return null; }

export default {
  createLobby,
  sendInvite,
  getLobby,
  joinLobby,
  leaveLobby,
  setPlayerReady,
  setLobbyStatus,
  subscribeToLobby,
  startMatch,
};
