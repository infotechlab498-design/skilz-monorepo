import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Send, Smile, X } from 'lucide-react';
import {
  getOrCreateThread,
  sendTextMessage,
  sendVoiceMessage,
  subscribeThreadMessages,
} from '../../api/dmApi.js';

const EMOJI_SET = ['😀', '😂', '🔥', '🎮', '👏', '❤️', '😎', '🙌', '😅', '✅'];

function formatTime(ms) {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
      new Date(ms)
    );
  } catch {
    return '';
  }
}

/**
 * @param {{
 *  open: boolean,
 *  onClose: () => void,
 *  currentUid: string | null,
 *  currentName: string,
 *  target: { uid: string, name: string, avatar?: string } | null
 * }} props
 */
export default function DirectMessageModal({ open, onClose, currentUid, currentName, target }) {
  const [threadId, setThreadId] = useState('');
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open || !currentUid || !target?.uid) return undefined;
    let active = true;
    let unsub = () => {};
    (async () => {
      try {
        const id = await getOrCreateThread(currentUid, target.uid);
        if (!active) return;
        setThreadId(id);
        unsub = subscribeThreadMessages(id, (rows) => {
          setItems(rows);
        });
      } catch {
        setItems([]);
      }
    })();
    return () => {
      active = false;
      unsub();
    };
  }, [open, currentUid, target]);

  useEffect(() => {
    if (!open) {
      setText('');
      setShowEmoji(false);
      setRecording(false);
      chunksRef.current = [];
      setThreadId('');
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    try {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    } catch {
      /* ignore */
    }
  }, [items.length]);

  const canSend = useMemo(() => !!String(text).trim() && !busy && !!threadId, [text, busy, threadId]);

  async function onSend() {
    if (!canSend || !currentUid) return;
    setBusy(true);
    try {
      await sendTextMessage(threadId, currentUid, text, currentName);
      setText('');
      setShowEmoji(false);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || recording || busy || !threadId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data?.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        if (!blob.size || !currentUid) return;
        setBusy(true);
        try {
          await sendVoiceMessage(threadId, currentUid, blob, currentName);
        } finally {
          setBusy(false);
        }
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    mediaRecorderRef.current.stop();
    setRecording(false);
  }

  if (!open) return null;

  return (
    <div className="dmx-ov" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dmx-md" role="dialog" aria-modal="true" aria-labelledby="dmx-title">
        <div className="dmx-hd">
          <div className="dmx-id">
            <div className="dmx-av">{target?.avatar ? <img src={target.avatar} alt="" /> : null}</div>
            <div>
              <h3 id="dmx-title" className="dmx-ttl">
                Reply to {target?.name || 'Player'}
              </h3>
              <p className="dmx-sub">Direct message</p>
            </div>
          </div>
          <button type="button" className="dmx-x" onClick={onClose} aria-label="Close chat">
            <X size={18} className="dmx-svg" />
          </button>
        </div>

        <div className="dmx-ls" ref={listRef}>
          {items.length === 0 ? (
            <div className="dmx-empty">Start the conversation.</div>
          ) : (
            items.map((m) => {
              const mine = m.senderUid === currentUid;
              return (
                <div key={m.id} className={`dmx-it ${mine ? 'is-me' : ''}`}>
                  <div className="dmx-bub">
                    {m.type === 'voice' ? (
                      <audio controls src={m.meta?.url || ''} className="dmx-au" />
                    ) : (
                      <span>{m.text}</span>
                    )}
                  </div>
                  <div className="dmx-tm">{formatTime(m.createdAt)}</div>
                </div>
              );
            })
          )}
        </div>

        {showEmoji ? (
          <div className="dmx-emo">
            {EMOJI_SET.map((e) => (
              <button key={e} type="button" className="dmx-emoBtn" onClick={() => setText((t) => `${t}${e}`)}>
                {e}
              </button>
            ))}
          </div>
        ) : null}

        <div className="dmx-cp">
          <button
            type="button"
            className={`dmx-icon dmx-icon--emoji ${showEmoji ? 'is-active' : ''}`}
            onClick={() => setShowEmoji((s) => !s)}
            disabled={busy}
            aria-label="Toggle emoji picker"
          >
            <Smile size={18} className="dmx-svg" />
          </button>
          <input
            className="dmx-inp"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            type="button"
            className={`dmx-icon ${recording ? 'is-rec' : ''}`}
            onClick={() => (recording ? stopRecording() : startRecording())}
            disabled={busy || !threadId}
            title={recording ? 'Stop voice recording' : 'Record voice message'}
          >
            <Mic size={18} className="dmx-svg" />
          </button>
          <button type="button" className="dmx-send" onClick={onSend} disabled={!canSend}>
            <Send size={17} className="dmx-svg" />
          </button>
        </div>
      </div>
    </div>
  );
}

