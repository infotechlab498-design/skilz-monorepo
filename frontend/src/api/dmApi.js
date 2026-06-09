import {
  addDoc,
  collection,
  doc,
  limit as qLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import app, { db } from '../firebase/config.js';
import { toSerializableFirebase } from '../services/userService.js';

function threadIdFor(uidA, uidB) {
  return [String(uidA || ''), String(uidB || '')].sort().join('__');
}

function threadRef(threadId) {
  return doc(db, 'dmThreads', threadId);
}

function messagesRef(threadId) {
  return collection(db, 'dmThreads', threadId, 'messages');
}

export async function getOrCreateThread(myUid, otherUid) {
  const me = String(myUid || '').trim();
  const other = String(otherUid || '').trim();
  if (!me || !other || me === other) throw new Error('Invalid participants');
  const threadId = threadIdFor(me, other);
  await setDoc(
    threadRef(threadId),
    {
      threadId,
      participants: [me, other],
      participantMap: { [me]: true, [other]: true },
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return threadId;
}

export async function sendTextMessage(threadId, myUid, text, displayName = 'Player') {
  const body = String(text || '').trim();
  if (!threadId || !myUid || !body) return;
  await addDoc(messagesRef(threadId), {
    senderUid: String(myUid),
    senderName: String(displayName || 'Player'),
    type: 'text',
    text: body,
    meta: null,
    createdAt: serverTimestamp(),
  });
  await setDoc(
    threadRef(threadId),
    {
      lastMessageText: body,
      lastMessageType: 'text',
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function sendVoiceMessage(threadId, myUid, blob, displayName = 'Player') {
  if (!threadId || !myUid || !blob) return;
  const storage = getStorage(app);
  const msgId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `dmVoice/${threadId}/${msgId}.webm`;
  const fRef = storageRef(storage, path);
  await uploadBytes(fRef, blob, { contentType: blob.type || 'audio/webm' });
  const url = await getDownloadURL(fRef);

  await addDoc(messagesRef(threadId), {
    senderUid: String(myUid),
    senderName: String(displayName || 'Player'),
    type: 'voice',
    text: '',
    meta: {
      url,
      storagePath: path,
      mimeType: blob.type || 'audio/webm',
      sizeBytes: blob.size || 0,
    },
    createdAt: serverTimestamp(),
  });

  await setDoc(
    threadRef(threadId),
    {
      lastMessageText: 'Voice message',
      lastMessageType: 'voice',
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeThreadMessages(threadId, onData) {
  if (!threadId) return () => {};
  const q = query(messagesRef(threadId), orderBy('createdAt', 'asc'), qLimit(200));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => toSerializableFirebase({ id: d.id, ...d.data() }));
      onData(rows);
    },
    () => onData([])
  );
}

