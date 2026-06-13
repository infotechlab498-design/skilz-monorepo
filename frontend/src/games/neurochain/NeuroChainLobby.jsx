import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { toast, Toaster } from 'sonner';
import Layout from '../../Components/Layout';
import { ensureGameUserFromAuth } from '../../utils/gameAuthSync.js';
import { useGamePlayers } from '../../hooks/useGamePlayers.js';
import LobbySliders from '../../lobbyPages/components/LobbySliders.jsx';
import LobbyRightSidebar from '../../lobbyPages/components/LobbyRightSidebar.jsx';
import {
  callNeuroChainStartPractice,
  callNeuroChainEnqueue1v1,
  callNeuroChainLeaveQueue,
  callNeuroChainTryMatch,
  callNeuroChainStartInviteFromMatch,
} from '../../api/cloudFunctionsApi.js';
import { MATCH_WINDOW_MS } from '../../../../shared/neurochain/constants.js';
import { useGameConfig } from '../../hooks/useGameConfig.js';
import GameEntryFeeBadge, { canAffordEntryFee } from '../../Components/GameEntryFeeBadge.jsx';
import {
  promptInsufficientCoinsRecharge,
  useMergedPlayerProfile,
} from '../../hooks/useBillingAccess.js';
import './NeuroChainLobby.css';

export default function NeuroChainLobby() {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
  const mergedProfile = useMergedPlayerProfile();
  const [searchParams] = useSearchParams();
  const matchIdFromUrl = searchParams.get('matchId') || '';

  const [gameUser, setGameUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitedPlayers, setInvitedPlayers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const pollRef = useRef(null);

  const availablePlayers = useGamePlayers('neurochain');
  const {
    entryFee,
    questionCount,
    questionSeconds,
    maintenanceMode,
    enabled: neurochainEnabled,
    matchmakingTimeoutMs,
  } = useGameConfig('neurochain');

  const ensureCanPlay = () => {
    if (maintenanceMode) {
      toast.error('Games are in maintenance mode. Please try again later.');
      return false;
    }
    if (!neurochainEnabled) {
      toast.error('NeuroChain is temporarily unavailable.');
      return false;
    }
    if (!canAffordEntryFee(gameUser?.coins, entryFee)) {
      promptInsufficientCoinsRecharge(navigate, isAuthenticated, mergedProfile, entryFee);
      return false;
    }
    return true;
  };

  const selectedPlayer = useMemo(
    () => availablePlayers.find((p) => p.uid === selectedUid) || availablePlayers[0] || null,
    [availablePlayers, selectedUid]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const u = await ensureGameUserFromAuth();
      if (!active) return;
      if (!u) {
        navigate('/signin', { replace: true });
        return;
      }
      setGameUser(u);
      setProfile({
        displayName: u.displayName,
        photoURL: u.photoURL,
        level: 1,
        xp: 0,
        stats: { totalMatches: 0, wins: 0, accuracy: 0, avgMoveSpeedMs: 0 },
      });
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearPoll();
      void callNeuroChainLeaveQueue({}).catch(() => {});
    },
    [clearPoll]
  );

  const startPractice = async () => {
    if (!gameUser) return;
    if (!ensureCanPlay()) return;
    try {
      const { gameId } = await callNeuroChainStartPractice({});
      if (!gameId) return;
      navigate(`/neurochain/game/${gameId}`);
    } catch (e) {
      toast.error(e?.message || 'Could not start practice');
    }
  };

  const startInviteGame = async () => {
    if (!matchIdFromUrl) {
      toast.error('No match id in link.');
      return;
    }
    try {
      const { gameId } = await callNeuroChainStartInviteFromMatch({ matchId: matchIdFromUrl });
      if (!gameId) return;
      navigate(`/neurochain/game/${gameId}`);
    } catch (e) {
      toast.error(e?.message || 'Could not start invite match');
    }
  };

  const joinOneVsOne = async () => {
    if (!gameUser) return;
    if (!ensureCanPlay()) return;
    setIsSearching(true);
    toast.info('Searching for an opponent…');
    try {
      await callNeuroChainEnqueue1v1({});
    } catch (e) {
      setIsSearching(false);
      toast.error(e?.message || 'Queue failed');
      return;
    }

    const started = Date.now();
    let failures = 0;
    clearPoll();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > (matchmakingTimeoutMs || MATCH_WINDOW_MS)) {
        clearPoll();
        setIsSearching(false);
        try {
          await callNeuroChainLeaveQueue({});
        } catch (_) {
          /* ignore */
        }
        toast.error('No player found');
        return;
      }
      try {
        const res = await callNeuroChainTryMatch({});
        failures = 0;
        if (res?.matched && res.gameId) {
          clearPoll();
          setIsSearching(false);
          toast.success('Match found');
          navigate(`/neurochain/game/${res.gameId}`);
        }
      } catch (err) {
        failures += 1;
        if (failures >= 4) {
          toast.error(err?.message || 'Matchmaking is unstable. Retrying...');
          failures = 0;
        }
      }
    }, 900);
  };

  return (
    <Layout>
      <div className="nc-lobby-shell">
        <LobbySliders
          creating={false}
          authReady={!!gameUser}
          availablePlayers={availablePlayers}
          selectedPlayer={selectedPlayer}
          setSelectedUid={setSelectedUid}
          handleInvite={(p) =>
            setInvitedPlayers((prev) =>
              prev.some((x) => x.uid === p.uid)
                ? prev
                : [
                    ...prev,
                    {
                      uid: p.uid,
                      name: p.profile?.displayName || p.uid,
                      avatar: p.profile?.avatar,
                      type: 'friend',
                    },
                  ]
            )
          }
          invitedPlayers={invitedPlayers}
          maxPlayers={2}
        />

        <section className="nc-center">
          <h1 className="nc-title">NeuroChain</h1>
          <p className="nc-lead">Decode the sequence. Ten nodes. Neon speed.</p>
          <GameEntryFeeBadge
            entryFee={entryFee}
            questionCount={questionCount}
            questionSeconds={questionSeconds}
            className="game-entry-fee-badge--block"
          />

          {matchIdFromUrl ? (
            <div className="nc-banner">
              <p>Friend match ready — both players here? Start the chain.</p>
              <button type="button" className="nc-btn nc-btn--primary" onClick={startInviteGame}>
                Start from invite
              </button>
            </div>
          ) : null}

          <div className="nc-actions">
            <button type="button" className="nc-btn nc-btn--primary" disabled={!gameUser} onClick={startPractice}>
              Practice vs bot
            </button>
            <button type="button" className="nc-btn nc-btn--secondary" disabled={!gameUser || isSearching} onClick={joinOneVsOne}>
              {isSearching ? 'Searching…' : '1v1 matchmaking'}
            </button>
            <button type="button" className="nc-btn nc-btn--ghost" disabled={!gameUser} onClick={() => setInviteModalOpen(true)}>
              Invite friend
            </button>
          </div>
          <p className="nc-hint">
            Invites use your friends list (Player dashboard). Pick NeuroChain when sending a challenge — accept opens this lobby
            with your match link.
          </p>
        </section>

        <aside className="nc-right">
          <LobbyRightSidebar
            user={profile}
            gameId="neurochain"
            showInviteSection
            invitedPlayers={invitedPlayers}
            setInvitedPlayers={setInvitedPlayers}
            onConfirmInvite={() => toast.info('Use Friends → invite and choose NeuroChain')}
            maxPlayers={2}
            themeColor="#22d3ee"
          />
        </aside>
      </div>

      {inviteModalOpen ? (
        <div className="nc-modal-overlay" onClick={() => setInviteModalOpen(false)} role="presentation">
          <div className="nc-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Invite friend</h3>
            <p>
              Open <strong>Player → Friends</strong>, invite your friend, and select <strong>NeuroChain</strong> as the game.
              When they accept, open this lobby from the notification link and tap <em>Start from invite</em>.
            </p>
            <button type="button" className="nc-btn nc-btn--primary" onClick={() => setInviteModalOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}

      <Toaster position="top-center" richColors />
    </Layout>
  );
}
