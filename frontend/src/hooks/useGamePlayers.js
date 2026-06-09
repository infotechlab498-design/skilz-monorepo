import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config.js';
import { authHeadersAsync } from '../utils/authToken.js';
import { DUMMY_AVAILABLE_PLAYERS } from '../lobbyPages/dummyAvailablePlayers';
import { socketService } from '../services/socketService';

const POLL_MS = 14000;

/**
 * Friends available for invites / lobby UI.
 * Uses GET /api/online-players (Firestore friends + RTDB presence + server userState) when signed in.
 */
export const useGamePlayers = (gameId) => {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    if (!gameId) {
      const id = requestAnimationFrame(() => setPlayers([]));
      return () => cancelAnimationFrame(id);
    }

    let cancelled = false;
    let pollTimer = null;
    let socketOff = null;

    const mapPlayer = (p) => {
      const uid = p.userId || p.uid;
      const name = p.username ?? p.displayName ?? uid;
      const avatar = p.avatar ?? p.photoURL;
      return {
        uid,
        profile: {
          displayName: name,
          avatar,
          gameType: gameId,
        },
        online: true,
      };
    };

    const fetchAvailable = async () => {
      try {
        const headers = await authHeadersAsync();
        const res = await fetch('/api/online-players', { headers });
        if (!res.ok) {
          if (!cancelled) setPlayers([]);
          return;
        }
        const data = await res.json();
        const list = (data.players || []).map(mapPlayer);
        if (!cancelled) setPlayers(list);
      } catch {
        if (!cancelled) setPlayers([]);
      }
    };

    const attachSocketRefresh = () => {
      if (socketOff) {
        socketOff();
        socketOff = null;
      }
      void (async () => {
        try {
          const s = await socketService.ensureConnected({ forceRefresh: false });
          if (cancelled) return;
          const onUp = () => void fetchAvailable();
          s.on('onlinePlayers:update', onUp);
          socketOff = () => s.off('onlinePlayers:update', onUp);
        } catch {
          /* not signed in or socket unavailable */
        }
      })();
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (socketOff) {
        socketOff();
        socketOff = null;
      }
      if (!user) {
        if (!cancelled) {
          setPlayers(DUMMY_AVAILABLE_PLAYERS.filter((p) => p.gameType === gameId));
        }
        return;
      }
      void fetchAvailable();
      attachSocketRefresh();
      pollTimer = setInterval(() => void fetchAvailable(), POLL_MS);
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (socketOff) socketOff();
      unsub();
    };
  }, [gameId]);

  return players;
};
