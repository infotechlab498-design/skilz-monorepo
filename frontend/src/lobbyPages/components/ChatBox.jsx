import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import EmojiPicker from 'emoji-picker-react';
import {
  ensureLobbyInitialized,
  subscribeToChat,
  sendMessage,
} from '../../firebase/chat';
import { auth } from '../../firebase/config.js';
import { socketService } from '../../services/socketService';
import VoiceRecorder from './VoiceRecorder';
import LobbyVoiceChat from './LobbyVoiceChat';
import '../PlayersLobby.css';

const TYPING_DEBOUNCE_MS = 420;
const TYPING_IDLE_EMIT_MS = 600;

function newClientMsgId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

function messageSortKey(ts) {
  if (ts == null) return 0;
  if (typeof ts === 'object' && typeof ts.toMillis === 'function') return ts.toMillis();
  const n = Number(ts);
  return Number.isFinite(n) ? n : 0;
}

function firestoreListenErrorMessage(err) {
  const code = err?.code;
  if (code === 'permission-denied') {
    return 'Chat: permission denied. Sign in and ensure you can access this lobby.';
  }
  if (code === 'unauthenticated') {
    return 'Chat: sign in required.';
  }
  return `Chat sync error${code ? ` (${code})` : ''}.`;
}

export default function ChatBox({ lobbyId, currentUser, layoutVariant = 'default' }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [typingNames, setTypingNames] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [relayWarning, setRelayWarning] = useState(null);
  const [footerExpanded, setFooterExpanded] = useState(false);
  const [isCompactFooter, setIsCompactFooter] = useState(false);

  useEffect(() => {
    const isLobbyCompactVariant =
      layoutVariant === 'trivia-lobby' ||
      layoutVariant === 'math-rush-lobby' ||
      layoutVariant === 'enigma-lobby';
    if (!isLobbyCompactVariant) return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => {
      setIsCompactFooter(mq.matches);
      if (!mq.matches) setFooterExpanded(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [layoutVariant]);

  const containerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const messageIdsRef = useRef(new Set());
  const effectGenerationRef = useRef(0);
  const typingThrottleRef = useRef(0);
  const typingIdleRef = useRef(null);
  const typingPeerTimeoutsRef = useRef(new Map());

  const flushTypingIndicator = useCallback(() => {
    if (!lobbyId) return;
    socketService.emit('lobby:typing', {
      lobbyId,
      displayName: currentUser?.displayName,
      typing: false,
    });
  }, [lobbyId, currentUser?.displayName]);

  
  // ─────────────────────────────────────────────
  // FIRESTORE SUBSCRIPTION (wait for Firebase Auth — rules require request.auth)
  // ─────────────────────────────────────────────


  const firestoreChatUnsubRef = useRef(() => {});

  useEffect(() => {
    if (!lobbyId) return;

    let cancelled = false;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;

      firestoreChatUnsubRef.current();
      firestoreChatUnsubRef.current = () => {};

      setMessages([]);
      setError(null);
      setRelayWarning(null);
      messageIdsRef.current = new Set();
      stickToBottomRef.current = true;

      if (!user) {
        return;
      }

      const gen = ++effectGenerationRef.current;

      const init = async () => {
        try {
          await ensureLobbyInitialized(lobbyId);
          if (cancelled || gen !== effectGenerationRef.current) return;

          firestoreChatUnsubRef.current = subscribeToChat(
            lobbyId,
            (listAsc) => {
              if (gen !== effectGenerationRef.current) return;

              setMessages((prev) => {
                const socketRows = prev.filter((m) => Boolean(m.socketRelay));
                const optRows = prev.filter((m) =>
                  String(m.id).startsWith('opt_')
                );

                const fsDupKeys = new Set(
                  listAsc.flatMap((m) => {
                    const cid = m.clientMsgId || m.meta?.clientMsgId;
                    return cid && m.uid ? [`${m.uid}::${cid}`] : [];
                  })
                );

                const socketDeduped = socketRows.filter((m) => {
                  const cid = m.clientMsgId;
                  if (!cid || !m.uid) return true;
                  return !fsDupKeys.has(`${m.uid}::${cid}`);
                });

                const listCids = new Set(
                  listAsc
                    .map((m) => m.clientMsgId || m.meta?.clientMsgId)
                    .filter(Boolean)
                );
                const keptOpt = optRows.filter(
                  (m) => !listCids.has(m.clientMsgId)
                );

                const merged = [...keptOpt, ...listAsc, ...socketDeduped];
                const byId = new Map();
                for (const m of merged) {
                  if (!byId.has(m.id)) byId.set(m.id, m);
                }
                const next = Array.from(byId.values());
                messageIdsRef.current = new Set(next.map((m) => m.id));
                return next;
              });
            },
            {
              onError: (err) => {
                if (cancelled || gen !== effectGenerationRef.current) return;
                setError(firestoreListenErrorMessage(err));
              },
            }
          );
        } catch (err) {
          console.error('[ChatBox init error]', err);
          if (!cancelled && gen === effectGenerationRef.current) {
            setError('Chat connection failed.');
          }
        }
      };

      void init();
    });

    return () => {
      cancelled = true;
      unsubAuth();
      firestoreChatUnsubRef.current();
      firestoreChatUnsubRef.current = () => {};
    };
  }, [lobbyId]);


  // ─────────────────────────────────────────────
  // SOCKET.IO LOBBY (presence, relay messages, typing)
  // ─────────────────────────────────────────────


  useEffect(() => {
    if (!lobbyId || !currentUser?.uid) {
      setSocketReady(false);
      setPresenceUsers([]);
      setRelayWarning(null);
      return;
    }

    let cancelled = false;
    const socket = socketService.getSocket();

    const run = async () => {
      try {
        await socketService.ensureConnected();
        if (cancelled) return;
        socketService.emit('lobby:join', {
          lobbyId,
          displayName: currentUser.displayName,
        });
        setSocketReady(true);
        setRelayWarning(null);
      } catch (e) {
        console.warn('[ChatBox] socket lobby:', e?.message || e);
        if (!cancelled) setSocketReady(false);
      }
    };

    void run();

    const onPresence = (payload) => {
      if (payload?.lobbyId !== lobbyId) return;
      const users = Array.isArray(payload.users) ? payload.users : [];
      setPresenceUsers(users);
    };

    const onJoined = (payload) => {
      if (payload?.lobbyId !== lobbyId) return;
      const users = Array.isArray(payload.users) ? payload.users : [];
      setPresenceUsers(users);
    };

    const onSocketMessage = (payload) => {
      if (payload?.lobbyId !== lobbyId || payload.uid === currentUser.uid) return;
      const cid = payload.clientMsgId || null;
      const id = cid
        ? `sock_${payload.uid}_${cid}`
        : `sock_${payload.uid}_${payload.createdAt}`;

      setMessages((prev) => {
        if (messageIdsRef.current.has(id)) return prev;
        messageIdsRef.current.add(id);
        const row = {
          id,
          uid: payload.uid,
          displayName: payload.displayName || 'Guest',
          avatar: payload.avatar || '',
          text: payload.text || '',
          type: 'text',
          createdAt: payload.createdAt,
          clientMsgId: cid,
          socketRelay: true,
        };
        const cidClean = row.clientMsgId;
        const deduped =
          cidClean != null
            ? prev.filter(
                (m) =>
                  !(
                    String(m.id).startsWith('sock_') &&
                    m.uid === row.uid &&
                    m.clientMsgId === cidClean
                  )
              )
            : prev;
        return [...deduped, row];
      });
    };

    const bumpTypingPeer = (payload) => {
      if (payload?.lobbyId !== lobbyId || payload.uid === currentUser.uid) return;
      const uid = payload.uid;
      const label = payload.displayName || 'Someone';

      if (!payload.typing) {
        setTypingNames((prev) => prev.filter((x) => x.uid !== uid));
        const t = typingPeerTimeoutsRef.current.get(uid);
        if (t) clearTimeout(t);
        typingPeerTimeoutsRef.current.delete(uid);
        return;
      }

      setTypingNames((prev) => {
        const others = prev.filter((x) => x.uid !== uid);
        return [...others, { uid, label }];
      });

      const prevT = typingPeerTimeoutsRef.current.get(uid);
      if (prevT) clearTimeout(prevT);
      const timer = setTimeout(() => {
        setTypingNames((p) => p.filter((x) => x.uid !== uid));
        typingPeerTimeoutsRef.current.delete(uid);
      }, 3200);
      typingPeerTimeoutsRef.current.set(uid, timer);
    };

    socket?.on('lobby:presence', onPresence);
    socket?.on('lobby:joined', onJoined);
    socket?.on('lobby:message', onSocketMessage);
    socket?.on('lobby:typing', bumpTypingPeer);

    return () => {
      cancelled = true;
      socket?.off('lobby:presence', onPresence);
      socket?.off('lobby:joined', onJoined);
      socket?.off('lobby:message', onSocketMessage);
      socket?.off('lobby:typing', bumpTypingPeer);
      flushTypingIndicator();
      socketService.emit('lobby:leave');
      setSocketReady(false);
      setRelayWarning(null);
      setPresenceUsers([]);
      setTypingNames([]);
      for (const t of typingPeerTimeoutsRef.current.values()) clearTimeout(t);
      typingPeerTimeoutsRef.current.clear();
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    };
  }, [lobbyId, currentUser?.uid, currentUser?.displayName, flushTypingIndicator]);



  // ─────────────────────────────────────────────
  // AUTO SCROLL (stick to bottom unless user scrolled up)
  // ─────────────────────────────────────────────



  const onMessagesScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 80;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);



  // ─────────────────────────────────────────────
  // SEND MESSAGE (socket relay + Firestore)
  // ─────────────────────────────────────────────




  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !lobbyId || !currentUser || sending) return;

    setSending(true);

    const clientMsgId = newClientMsgId();
    const optimisticId = `opt_${clientMsgId}`;

    const optimisticMsg = {
      id: optimisticId,
      uid: currentUser.uid,
      displayName: currentUser.displayName || 'You',
      avatar: currentUser.avatar || '',
      text: trimmed,
      type: 'text',
      createdAt: Date.now(),
      sending: true,
      clientMsgId,
    };

    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, optimisticMsg]);
    setText('');
    setShowEmojis(false);
    flushTypingIndicator();

    const relayOk = socketService.emit('lobby:message', {
      lobbyId,
      text: trimmed,
      clientMsgId,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar || '',
    });
    if (!relayOk) {
      setRelayWarning(
        'Live relay is offline — others may see your message after a short delay once it syncs.'
      );
    } else {
      setRelayWarning(null);
    }

    try {
      await sendMessage(lobbyId, {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'Guest',
        avatar: currentUser.avatar || '',
        text: trimmed,
        clientMsgId,
      });
    } catch (err) {
      console.error(err);
      setError('Message failed');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setText(v);

    if (!lobbyId || !socketReady) return;

    const now = Date.now();
    if (now - typingThrottleRef.current >= TYPING_DEBOUNCE_MS) {
      typingThrottleRef.current = now;
      socketService.emit('lobby:typing', {
        lobbyId,
        displayName: currentUser.displayName,
        typing: true,
      });
    }

    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      flushTypingIndicator();
    }, TYPING_IDLE_EMIT_MS);
  };

  const isMe = (msg) => msg.uid === currentUser?.uid;

  const formatTime = (ts) => {
    if (!ts) return '';
    const d =
      typeof ts === 'object' && typeof ts.toDate === 'function'
        ? ts.toDate()
        : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const othersTyping =
    typingNames.length > 0
      ? `${typingNames.map((t) => t.label).join(', ')} typing…`
      : null;

  const presenceLabel =
    presenceUsers.length > 0 ? `${presenceUsers.length} Online` : '';

  const isLobbyCompactVariant =
    layoutVariant === 'trivia-lobby' ||
    layoutVariant === 'math-rush-lobby' ||
    layoutVariant === 'enigma-lobby';
  const showCompactFooter = isLobbyCompactVariant && isCompactFooter && !footerExpanded;
  const showExpandedCollapse = footerExpanded && isCompactFooter && isLobbyCompactVariant;
  const onlineCount = presenceUsers.length || 0;

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => messageSortKey(a.createdAt) - messageSortKey(b.createdAt)
      ),
    [messages]
  );

  return (
    <div
      className={[
        'chat-box',
        layoutVariant === 'trivia-lobby' ? 'chat-box--trivia-lobby' : '',
        layoutVariant === 'math-rush-lobby' ? 'chat-box--math-rush-lobby' : '',
        layoutVariant === 'enigma-lobby' ? 'chat-box--enigma-lobby' : '',
        showCompactFooter ? 'chat-box--footer-compact' : '',
        footerExpanded ? 'chat-box--footer-expanded' : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        className="chat-header"
        role={showCompactFooter ? 'button' : undefined}
        tabIndex={showCompactFooter ? 0 : undefined}
        onClick={showCompactFooter ? () => setFooterExpanded(true) : undefined}
        onKeyDown={
          showCompactFooter
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFooterExpanded(true);
                }
              }
            : undefined
        }
      >
        <span className="chat-header__title">Lobby Chat</span>
        {showCompactFooter ? (
          <span className="chat-header__online-pill">{onlineCount || 0} Online</span>
        ) : null}
        {!showCompactFooter && lobbyId ? (
          <span className="chat-header__lobby">{lobbyId}</span>
        ) : null}
        {!showCompactFooter && presenceLabel ? (
          <span className="chat-header__lobby" style={{ opacity: 0.85 }}>
            · {presenceLabel}
          </span>
        ) : null}
        {showCompactFooter && layoutVariant === 'trivia-lobby' ? (
          <button
            type="button"
            className="chat-header__join-voice"
            onClick={(e) => {
              e.stopPropagation();
              setVoiceEnabled((v) => !v);
              setFooterExpanded(true);
            }}
          >
            Join Voice
          </button>
        ) : null}
        {showCompactFooter && layoutVariant === 'math-rush-lobby' ? (
          <button
            type="button"
            className="chat-header__open"
            onClick={(e) => {
              e.stopPropagation();
              setFooterExpanded(true);
            }}
          >
            Open
          </button>
        ) : null}
        {showCompactFooter && layoutVariant === 'enigma-lobby' ? (
          <button
            type="button"
            className="chat-header__open"
            onClick={(e) => {
              e.stopPropagation();
              setFooterExpanded(true);
            }}
          >
            Open
          </button>
        ) : null}
        {showExpandedCollapse ? (
          <button
            type="button"
            className="chat-header__collapse"
            onClick={(e) => {
              e.stopPropagation();
              setFooterExpanded(false);
              setShowEmojis(false);
            }}
          >
            Close
          </button>
        ) : null}
      </div>

      {presenceUsers.length > 0 && (
        <div className="chat-presence-strip" style={{ padding: '6px 10px', fontSize: 12, opacity: 0.9 }}>
          <strong style={{ marginRight: 8 }}>Active:</strong>
          {presenceUsers.map((u) => (
            <span key={u.uid} style={{ marginRight: 8 }}>
              {u.displayName || u.uid.slice(0, 6)}
            </span>
          ))}
        </div>
      )}

      <div
        className="chat-messages"
        ref={containerRef}
        onScroll={onMessagesScroll}
      >
        {error && <div className="chat-error">{error}</div>}
        {relayWarning ? (
          <div className="chat-system-msg" style={{ paddingBottom: 4, opacity: 0.9 }}>
            {relayWarning}
          </div>
        ) : null}
        {othersTyping ? (
          <div className="chat-system-msg" style={{ paddingBottom: 4 }}>
            {othersTyping}
          </div>
        ) : null}

        {sortedMessages.map((m) => {
          const mine = isMe(m);

          return (
            <div key={m.id} className={`chat-row ${mine ? 'mine' : ''}`}>
              <div className="chat-bubble">
                <div className="meta">
                  {mine ? 'You' : m.displayName}
                  <span>{formatTime(m.createdAt)}</span>
                </div>

                {m.type === 'voice' ? (
                  <audio controls src={m.meta?.url} className="chat-audio" />
                ) : (
                  <div style={m.sending ? { opacity: 0.6 } : {}}>
                    {m.text}
                    {m.sending && ' …sending'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-input-row chat-input-toolbar">
        <div className="chat-emoji-picker" style={{ position: 'relative' }}>
          <button
            type="button"
            className="chat-emoji-toggle"
            aria-expanded={showEmojis}
            aria-label="Emoji picker"
            onClick={() => setShowEmojis((v) => !v)}
          >
            😊
          </button>
          {showEmojis && (
            <div className="EmojiPickerReactWrapper">
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  setText((t) => (t || '') + (emojiData.emoji || ''));
                }}
                width={280}
                height={360}
              />
            </div>
          )}
        </div>

        <input
          className="chat-input"
          value={text}
          onChange={handleInputChange}
          onBlur={() => flushTypingIndicator()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message…"
        />

        <button
          type="button"
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>

      <div className="chat-voice-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => setVoiceEnabled(e.target.checked)}
          />
          Voice chat (PeerJS)
        </label>
        {!socketReady && lobbyId && currentUser?.uid ? (
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Connect socket (sign in + API on :3000) for live presence.
          </span>
        ) : null}
      </div>

      <LobbyVoiceChat
        lobbyId={lobbyId}
        currentUser={currentUser}
        enabled={Boolean(voiceEnabled && lobbyId && currentUser?.uid && socketReady)}
      />

      <VoiceRecorder lobbyId={lobbyId} currentUser={currentUser} />
    </div>
  );
}
