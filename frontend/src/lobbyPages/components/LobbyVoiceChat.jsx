import React, { useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { socketService } from '../../services/socketService';

/**
 * PeerJS + mic mesh for lobby voice (tie-break: lexicographically smaller peer id calls the larger).
 * Requires HTTPS or localhost for getUserMedia. Configure broker via VITE_PEERJS_* env vars.
 */
export default function LobbyVoiceChat({ lobbyId, currentUser, enabled }) {
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const callsRef = useRef(new Map());
  const uidToPeerIdRef = useRef(new Map());
  const audioByPeerIdRef = useRef(new Map());

  const cleanupAudio = useCallback(() => {
    for (const el of audioByPeerIdRef.current.values()) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
    }
    audioByPeerIdRef.current.clear();
  }, []);

  const teardownCalls = useCallback(() => {
    for (const call of callsRef.current.values()) {
      try {
        call.close();
      } catch {
        /* ignore */
      }
    }
    callsRef.current.clear();
  }, []);

  const destroyPeer = useCallback(() => {
    teardownCalls();
    cleanupAudio();
    uidToPeerIdRef.current.clear();
    try {
      peerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    peerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [cleanupAudio, teardownCalls]);

  useEffect(() => {
    if (!enabled || !lobbyId || !currentUser?.uid) {
      destroyPeer();
      return;
    }

    let cancelled = false;
    let removeSocketListeners = () => {};

    const attachRemoteAudio = (remotePeerId, remoteStream) => {
      const prev = audioByPeerIdRef.current.get(remotePeerId);
      if (prev) {
        prev.pause();
        prev.srcObject = null;
        prev.remove();
      }
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.controls = false;
      audio.setAttribute('data-peer-id', remotePeerId);
      audio.srcObject = remoteStream;
      audio.play().catch(() => {});
      audioByPeerIdRef.current.set(remotePeerId, audio);
      const host =
        typeof document !== 'undefined'
          ? document.getElementById('lobby-voice-audio-mount')
          : null;
      host?.appendChild(audio);
    };

    const wireCall = (call) => {
      const remotePeerId = call.peer;
      call.on('stream', (remoteStream) => {
        if (!cancelled) attachRemoteAudio(remotePeerId, remoteStream);
      });
      call.on('close', () => {
        callsRef.current.delete(remotePeerId);
        const el = audioByPeerIdRef.current.get(remotePeerId);
        if (el) {
          el.pause();
          el.srcObject = null;
          el.remove();
          audioByPeerIdRef.current.delete(remotePeerId);
        }
      });
      callsRef.current.set(remotePeerId, call);
    };

    const connectOutgoing = (peer, localStream, remotePeerId) => {
      const myId = peer.id;
      if (
        !myId ||
        !remotePeerId ||
        remotePeerId === myId ||
        callsRef.current.has(remotePeerId)
      ) {
        return;
      }
      if (myId >= remotePeerId) return;
      try {
        const call = peer.call(remotePeerId, localStream);
        wireCall(call);
      } catch (e) {
        console.warn('[LobbyVoiceChat] call failed:', e?.message || e);
      }
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const opts = {};
        const host = import.meta.env.VITE_PEERJS_HOST;
        if (host) {
          opts.host = host;
          opts.port = Number(import.meta.env.VITE_PEERJS_PORT || 443);
          opts.path = import.meta.env.VITE_PEERJS_PATH || '/peerjs';
          opts.secure = import.meta.env.VITE_PEERJS_SECURE !== '0';
        }

        const peer = new Peer(undefined, opts);
        peerRef.current = peer;

        peer.on('error', (err) => {
          console.warn('[LobbyVoiceChat]', err?.type || 'error', err?.message || err);
        });

        peer.on('call', (call) => {
          call.answer(stream);
          wireCall(call);
        });

        peer.on('open', (id) => {
          if (cancelled || !id) return;
          socketService.emit('lobby:voice:peer', { lobbyId, peerId: id });
        });

        const s = socketService.getSocket();
        const onPeers = (payload) => {
          if (payload?.lobbyId !== lobbyId || cancelled || !peer.id) return;
          const peers = Array.isArray(payload.peers) ? payload.peers : [];
          for (const row of peers) {
            if (!row?.peerId || row.uid === currentUser.uid) continue;
            uidToPeerIdRef.current.set(row.uid, row.peerId);
            connectOutgoing(peer, stream, row.peerId);
          }
        };

        const onPeerAnnounced = (payload) => {
          if (payload?.lobbyId !== lobbyId || cancelled || !peer.id) return;
          const remotePid = payload.peerId;
          const uid = payload.uid;
          if (!remotePid || uid === currentUser.uid || remotePid === peer.id) return;
          if (uid) uidToPeerIdRef.current.set(uid, remotePid);
          connectOutgoing(peer, stream, remotePid);
        };

        const onVoiceLeft = (payload) => {
          if (payload?.lobbyId !== lobbyId) return;
          const uid = payload.uid;
          const remotePid = uid ? uidToPeerIdRef.current.get(uid) : null;
          if (uid) uidToPeerIdRef.current.delete(uid);
          if (!remotePid) return;
          const call = callsRef.current.get(remotePid);
          try {
            call?.close();
          } catch {
            /* ignore */
          }
          callsRef.current.delete(remotePid);
          const el = audioByPeerIdRef.current.get(remotePid);
          if (el) {
            el.pause();
            el.srcObject = null;
            el.remove();
            audioByPeerIdRef.current.delete(remotePid);
          }
        };

        s?.on('lobby:voice:peers', onPeers);
        s?.on('lobby:voice:peer', onPeerAnnounced);
        s?.on('lobby:voice:left', onVoiceLeft);

        removeSocketListeners = () => {
          s?.off('lobby:voice:peers', onPeers);
          s?.off('lobby:voice:peer', onPeerAnnounced);
          s?.off('lobby:voice:left', onVoiceLeft);
        };
      } catch (e) {
        console.warn('[LobbyVoiceChat] microphone / PeerJS:', e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
      removeSocketListeners();
      destroyPeer();
    };
  }, [enabled, lobbyId, currentUser?.uid, destroyPeer]);

  return (
    <div
      id="lobby-voice-audio-mount"
      className="lobby-voice-audio-mount sr-only"
      aria-hidden
    />
  );
}
