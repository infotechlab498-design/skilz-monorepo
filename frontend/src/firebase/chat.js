// src/firebase/chat.js
// Firebase-backed chat service (drop-in replacement for demo API)
//
// Firestore "INTERNAL ASSERTION FAILED" (IDs ca9 / b815, WatchChangeAggregator / TargetState)
// comes from the Firebase Web SDK watch pipeline (firebase_firestore.js), not from a syntax
// bug here. See docs/FIRESTORE_LOBBY_CHAT_ERRORS.md and firebase-js-sdk#9267 / #9491.

import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit as qLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import app, { auth, db } from "./config.js";

const storage = getStorage(app);

/** Max messages kept in the live Firestore listener window (cost + memory). */
export const CHAT_LISTENER_PAGE_SIZE = 200;

function lobbyDocRef(lobbyId) {
  return doc(db, "lobbies", String(lobbyId));
}

function messagesColRef(lobbyId) {
  return collection(db, "lobbies", String(lobbyId), "messages");
}

function messageToUI(id, data) {
  const createdAt =
    typeof data?.createdAt?.toMillis === "function"
      ? data.createdAt.toMillis()
      : Date.now();
  const meta = data?.meta || null;
  const clientMsgId =
    meta && typeof meta.clientMsgId === "string" ? meta.clientMsgId : null;
  return {
    id,
    uid: data?.uid || "unknown",
    displayName: data?.displayName || "Guest",
    avatar: data?.avatar || "",
    text: data?.text || "",
    type: data?.type || "text",
    meta,
    clientMsgId,
    createdAt,
  };
}

/**
 * Creates lobby + welcome message once (transaction-safe).
 */
export async function ensureLobbyInitialized(lobbyId) {
  const lRef = lobbyDocRef(lobbyId);
  const mRef = messagesColRef(lobbyId);
  const actorUid = auth.currentUser?.uid || null;
  await runTransaction(db, async (tx) => {
    const lobbySnap = await tx.get(lRef);
    if (!lobbySnap.exists()) {
      tx.set(lRef, {
        lobbyId: String(lobbyId),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        welcomeSent: false,
        messageCount: 0,
      });
    }

    const current = lobbySnap.exists() ? lobbySnap.data() : {};
    if (!current.welcomeSent && actorUid) {
      const welcomeRef = doc(mRef);
      tx.set(welcomeRef, {
        uid: actorUid,
        displayName: "System",
        avatar: "",
        text: `Welcome to the ${lobbyId} lobby chat!`,
        type: "system",
        meta: null,
        createdAt: serverTimestamp(),
      });
      tx.set(
        lRef,
        {
          welcomeSent: true,
          updatedAt: serverTimestamp(),
          lastMessageText: `Welcome to the ${lobbyId} lobby chat!`,
          lastMessageType: "system",
          lastMessageAt: serverTimestamp(),
          messageCount: (current.messageCount || 0) + 1,
        },
        { merge: true }
      );
    }
  });
}

/**
 * Send a message to a lobby.
 * message = { uid, displayName, avatar, text, type?, meta? }
 */

export async function sendMessage(lobbyId, message) {
  if (!lobbyId || !message?.uid) return;
  await ensureLobbyInitialized(lobbyId);

  const meta =
    message.meta && typeof message.meta === "object" ? { ...message.meta } : {};
  if (
    typeof message.clientMsgId === "string" &&
    message.clientMsgId.length > 0
  ) {
    meta.clientMsgId = message.clientMsgId.slice(0, 128);
  }

  const payload = {
    uid: String(message.uid),
    displayName: message.displayName || "Guest",
    avatar: message.avatar || "",
    text: message.text || "",
    type: message.type || "text",
    meta: Object.keys(meta).length > 0 ? meta : null,
    createdAt: serverTimestamp(),
  };
  await addDoc(messagesColRef(lobbyId), payload);
}

/**
 * Fetch last `limit` messages for a lobby.
 * Returns ascending order for chat UI rendering.
 */
export async function fetchRecentMessages(lobbyId, limit = 50) {
  if (!lobbyId) return [];
  await ensureLobbyInitialized(lobbyId);
  const q = query(messagesColRef(lobbyId), orderBy("createdAt", "desc"), qLimit(limit));
  const snap = await getDocs(q);
  return snap.docs.map((d) => messageToUI(d.id, d.data())).reverse();
}

/**
 * Subscribe to message stream (initial + realtime updates).
 * Uses newest-first query + full snapshot list each tick so:
 * - Pending serverTimestamp() writes still sort with an estimated time (desc = recent window).
 * - asc + limitToLast can temporarily exclude brand-new rows while createdAt is unset.
 *
 * @param {string} lobbyId
 * @param {(messagesAsc: object[]) => void} onMessagesAsc — last CHAT_LISTENER_PAGE_SIZE messages, oldest first
 * @param {{ onError?: (err: Error) => void }} [options]
 */

export function subscribeToChat(lobbyId, onMessagesAsc, options = {}) {
  if (!lobbyId) return () => {};

  const { onError } = options;

  const q = query(
    messagesColRef(lobbyId),
    orderBy("createdAt", "desc"),
    qLimit(CHAT_LISTENER_PAGE_SIZE)
  );
  const unsub = onSnapshot(
    q,
    (snap) => {
      const asc = [...snap.docs]
        .reverse()
        .map((d) => messageToUI(d.id, d.data()));
      onMessagesAsc(asc);
    },
    (err) => {
      console.error("[chat] subscribeToChat error:", err);
      onError?.(err);
    }
  );
  return () => {
    unsub();
  };
}

/**
 * Send a voice message:
 * 1) Upload blob to Firebase Storage
 * 2) Save Firestore message with `type: 'voice'` and `meta.url`
 */

export async function sendVoiceMessage(lobbyId, uid, blob) {
  if (!lobbyId || !uid || !blob) return null;
  await ensureLobbyInitialized(lobbyId);

  const cleanLobby = String(lobbyId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const messageId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `chatVoice/${cleanLobby}/${messageId}.webm`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, blob, { contentType: blob.type || "audio/webm" });
  const url = await getDownloadURL(fileRef);

  const cu = auth.currentUser;
  const payload = {
    uid: String(uid),
    displayName: cu?.displayName || String(uid),
    avatar: cu?.photoURL || "",
    text: "",
    type: "voice",
    meta: {
      url,
      storagePath: path,
      mimeType: blob.type || "audio/webm",
      sizeBytes: blob.size || 0,
    },
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(messagesColRef(lobbyId), payload);
  return messageToUI(docRef.id, { ...payload, createdAt: { toMillis: () => Date.now() } });
}
