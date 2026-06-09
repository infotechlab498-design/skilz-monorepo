import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { socketService } from '../../../services/socketService';
import { useGameConfig } from '../../../hooks/useGameConfig.js';
import './PlayerSelection.css';

/** Must match server `LUDO_MATCH_VARIANT_CLASSIC_4P_ONLINE` in ludoRealtime.js */

const MATCH_VARIANT_CLASSIC_4P_ONLINE = 'CLASSIC_4P_ONLINE';

export const PlayerSelection = ({ onLobbyError, onLobbyClearError } = {}) => {
  const { entryFee } = useGameConfig('ludo');
  
  const { user: authUser } = useSelector((state) => state.auth);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [queueBusy, setQueueBusy] = useState(false);
  const [searchSecs, setSearchSecs] = useState(0);
  const queueActiveRef = useRef(false);
  const queueTimeoutRef = useRef(null);
  const queueJoinAtRef = useRef(null);

  const navigate = useNavigate();

  const clearQueueListeners = useCallback(() => {
    const s = socketService.getSocket();
    if (!s) return;
    s.off('ludo:matchFound');
    s.off('ludo:error');
  }, []);

  const cancelQueueIfActive = useCallback(() => {
    if (!queueActiveRef.current) return;
    queueActiveRef.current = false;
    socketService.emit('ludo:queueCancel', {});
    clearQueueListeners();
    if (queueTimeoutRef.current) {
      clearTimeout(queueTimeoutRef.current);
      queueTimeoutRef.current = null;
    }
    setQueueBusy(false);
    onLobbyClearError?.();
  }, [clearQueueListeners, onLobbyClearError]);

  useEffect(() => {
    return () => {
      cancelQueueIfActive();
    };
  }, [cancelQueueIfActive]);

  useEffect(() => {
    if (!queueBusy) {
      setSearchSecs(0);
      return undefined;
    }
    queueJoinAtRef.current = Date.now();
    const id = setInterval(() => {
      const t = queueJoinAtRef.current ? Math.floor((Date.now() - queueJoinAtRef.current) / 1000) : 0;
      setSearchSecs(t);
    }, 500);
    return () => clearInterval(id);
  }, [queueBusy]);

  const handleStart = () => {
    if (!authUser?.uid) {
      alert('Please sign in to find an online match.');
      return;
    }
    if (queueActiveRef.current) return;
    queueActiveRef.current = true;
    void (async () => {
      onLobbyClearError?.();
      setQueueBusy(true);
      try {
        const socket = await socketService.ensureConnected({ forceRefresh: false });
        const onFound = (payload) => {
          const id = payload?.roomId;
          if (!id) return;
          if (queueTimeoutRef.current) {
            clearTimeout(queueTimeoutRef.current);
            queueTimeoutRef.current = null;
          }
          clearQueueListeners();
          queueActiveRef.current = false;
          setQueueBusy(false);
          navigate(`/ludo/game/${id}`, { state: { isHost: Boolean(payload?.isHost) } });
        };
        const onErr = (e) => {
          if (queueTimeoutRef.current) {
            clearTimeout(queueTimeoutRef.current);
            queueTimeoutRef.current = null;
          }
          clearQueueListeners();
          queueActiveRef.current = false;
          setQueueBusy(false);
          const msg = e?.message || 'Matchmaking failed';
          onLobbyError?.(msg);
          alert(msg);
        };
        socket.once('ludo:matchFound', onFound);
        socket.once('ludo:error', onErr);

        const displayName =
          String(displayNameInput || '').trim() ||
          authUser?.username ||
          authUser?.displayName ||
          authUser?.name ||
          'Player';
        socket.emit('ludo:queueJoin', {
          displayName,
          maxPlayers: 4,
          fillBots: false,
          botFallbackMs: 0,
          waitWindowMs: 12000,
          matchVariant: MATCH_VARIANT_CLASSIC_4P_ONLINE,
          entryFee,
          turnTimerSec: 30,
          settings: { turnTimerSec: 30, exactRollToHome: true, safeStars: true },
        });
      } catch (e) {
        if (queueTimeoutRef.current) {
          clearTimeout(queueTimeoutRef.current);
          queueTimeoutRef.current = null;
        }
        queueActiveRef.current = false;
        setQueueBusy(false);
        const msg = e?.message || 'Could not connect';
        onLobbyError?.(msg);
        alert(msg);
      }
    })();
  };

  return (
    <div className="ludo-match-hero">
      <div className="ludo-match-overlay" />
      <div className="ludo-match-content">
        <p className="ludo-brand-label">SKILZ</p>
        <h2 className="ludo-match-title">CLASSIC 4P MATCH</h2>
        <p className="ludo-match-subtitle">Queue for a four-player online Ludo match.</p>

        <div className="ludo-match-input-wrap">
          <span className="ludo-input-icon" aria-hidden="true">👤</span>
          <input
            type="text"
            className="ludo-match-input"
            placeholder="Display name for this match"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
          />
        </div>

        <div className="ludo-entry-fee-pill" aria-label={`Entry fee is ${entryFee} coins`}>
          <span role="img" aria-label="coins">🪙</span>
          <span>ENTRY FEE: {entryFee} COINS</span>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="ludo-match-start-btn"
          disabled={queueBusy}
        >
          {queueBusy ? `SEARCHING... ${searchSecs}s` : 'START MATCH'}
        </button>

        {queueBusy && (
          <button
            type="button"
            onClick={cancelQueueIfActive}
            className="ludo-match-cancel-btn"
          >
            CANCEL SEARCH
          </button>
        )}

        <div className="ludo-trust-row">
          <div className="ludo-trust-item">
            <span className="ludo-trust-icon" aria-hidden="true">🛡️</span>
            <p>FAIR PLAY GUARANTEED</p>
          </div>
          <div className="ludo-trust-item">
            <span className="ludo-trust-icon" aria-hidden="true">🏆</span>
            <p>REAL PLAYERS COMPETE</p>
          </div>
          <div className="ludo-trust-item">
            <span className="ludo-trust-icon" aria-hidden="true">🔒</span>
            <p>SECURE &amp; TRUSTED</p>
          </div>
        </div>
      </div>
    </div>
  );
};
