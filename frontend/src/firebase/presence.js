// src/firebase/presence.js
// Real-time presence utilities. Demo mode active — Firebase not yet enabled.

// --- DEMO MODE STUBS ---

export function startPresence(user) {
  if (!user || !user.uid) return () => { };
  console.log('[Demo] startPresence for', user.uid);
  return () => { };
}

export async function setUserStatus(uid, status) {
  console.log('[Demo] setUserStatus', uid, status);
}

export function onPresenceChange(callback) {
  console.warn('[Demo] onPresenceChange called but Firebase is not active.');
  callback({});
  return () => { };
}

export default { startPresence, setUserStatus, onPresenceChange };
