import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../firebaseAdmin.js';

function dbOrThrow() {
  const db = getAdminFirestore();
  if (!db) throw new Error('Firestore Admin is not configured');
  return db;
}

export async function createEnigmaInvite({
  inviteId,
  fromUserId,
  toUserId = null,
  toEmail = null,
  gameType = 'enigma_pulse',
  gameKey = 'riddle_classic',
  category = 'General Knowledge',
  difficulty = 'medium',
  roomId = null,
  expiresAtMs,
}) {
  const db = dbOrThrow();
  const ref = db.collection('invites').doc(String(inviteId));
  await ref.set(
    {
      fromUserId,
      toUserId: toUserId || null,
      toEmail: toEmail || null,
      gameType,
      gameId: gameType,
      gameKey,
      category,
      difficulty,
      status: 'pending',
      roomId: roomId || null,
      expiresAt: new Date(Number(expiresAtMs)),
      usedBy: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return ref.id;
}

export async function getInviteById(inviteId) {
  const db = dbOrThrow();
  const snap = await db.collection('invites').doc(String(inviteId)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function markInviteAccepted(inviteId, { userId, roomId }) {
  const db = dbOrThrow();
  const ref = db.collection('invites').doc(String(inviteId));
  await ref.set(
    {
      status: 'accepted',
      usedBy: userId,
      roomId,
      acceptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markInviteExpired(inviteId) {
  const db = dbOrThrow();
  const ref = db.collection('invites').doc(String(inviteId));
  await ref.set(
    {
      status: 'expired',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createNotification({
  userId,
  type,
  message,
  meta = {},
}) {
  const db = dbOrThrow();
  const ref = db.collection('notifications').doc();
  await ref.set({
    userId,
    type,
    message,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    ...meta,
  });
  return ref.id;
}

export async function markNotificationRead(notificationId, userId) {
  const db = dbOrThrow();
  const ref = db.collection('notifications').doc(String(notificationId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  if (String(snap.data()?.userId || '') !== String(userId || '')) return { ok: false };
  await ref.update({ read: true });
  return { ok: true };
}
