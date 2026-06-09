// src/hooks/useLobby.js
// React hook for subscribing to a lobby and performing actions (join/leave/ready/start)

import { useEffect, useState, useCallback } from 'react';
import {
  subscribeToLobby,
  joinLobby as fmJoinLobby,
  leaveLobby as fmLeaveLobby,
  setPlayerReady as fmSetPlayerReady,
  startMatch as fmStartMatch,
} from '../firebase/lobby';

export default function useLobby(lobbyId, _currentUid) {
  const [lobby, setLobby] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lobbyId) return undefined;
    setLoading(true);
    const unsub = subscribeToLobby(lobbyId, (data) => {
      setLobby(data);
      setLoading(false);
    });

    return () => {
      try {
        unsub();
      } catch (_e) {
        // ignore
      }
    };
  }, [lobbyId]);

  const join = useCallback(
    async (player) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fmJoinLobby(lobbyId, player);
        setLobby(res);
        setLoading(false);
        return res;
      } catch (e) {
        setError(e);
        setLoading(false);
        throw e;
      }
    },
    [lobbyId]
  );

  const leave = useCallback(
    async (uid) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fmLeaveLobby(lobbyId, uid);
        setLobby(res);
        setLoading(false);
        return res;
      } catch (e) {
        setError(e);
        setLoading(false);
        throw e;
      }
    },
    [lobbyId]
  );

  const setReady = useCallback(
    async (uid, ready = true) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fmSetPlayerReady(lobbyId, uid, ready);
        setLobby(res);
        setLoading(false);
        return res;
      } catch (e) {
        setError(e);
        setLoading(false);
        throw e;
      }
    },
    [lobbyId]
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fmStartMatch(lobbyId);
      setLobby(res);
      setLoading(false);
      return res;
    } catch (e) {
      setError(e);
      setLoading(false);
      throw e;
    }
  }, [lobbyId]);

  return { lobby, loading, error, join, leave, setReady, start };
}
