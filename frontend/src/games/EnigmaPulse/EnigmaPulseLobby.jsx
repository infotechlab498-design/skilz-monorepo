import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import {
  faArrowRight,
  faChartBar,
  faCrown,
  faEnvelope,
  faFire,
  faHeartPulse,
  faLeaf,
  faLink,
  faMessage,
  faStar,
  faUser,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { toast, Toaster } from 'sonner';
import Layout from '../../Components/Layout';
import { ensureGameUserFromAuth } from '../../utils/gameAuthSync.js';
import { useGamePlayers } from '../../hooks/useGamePlayers.js';
import LobbySliders from '../../lobbyPages/components/LobbySliders.jsx';
import LobbyRightSidebar from '../../lobbyPages/components/LobbyRightSidebar.jsx';
import { connectSocket, ensureSocketConnected, socket } from '../mathRush/lib/socket.js';
import { EnigmaPulseEvents } from '../../../../shared/enigmaPulse/constants.js';
import { buildInvitePayload } from './modes/inviteMode.js';
import { buildOneVsOneQueuePayload } from './modes/oneVsOneMode.js';
import { buildPracticeQueuePayload } from './modes/practiceMode.js';
import { ENIGMA_GAME_OPTIONS, ENIGMA_PLAY_MODES } from './modes/modeRegistry.js';
import { ENIGMA_PULSE_LOBBY_CATEGORIES, WORD_CIPHER_CATEGORY } from '../../../../shared/enigmaPulse/categories.js';
import { isPatternRecognitionGameKey, isWordCipherGameKey } from '../../../../shared/enigmaPulse/gameKeys.js';
import { resolveEnigmaPulseErrorToast } from './enigmaPulseClientErrors.js';
import './EnigmaPulseLobby.css';
import './enigmaPulseLobbyMobile.css';
import ChatBox from '../../lobbyPages/components/ChatBox.jsx';
import { gameLobbyId } from '../../firebase/gameLobbyPath.js';
import EnigmaPulseMobileProfile from './EnigmaPulseMobileProfile.jsx';
import EnigmaPulseBottom from './EnigmaPulseBottom.jsx';
import { useGameConfig } from '../../hooks/useGameConfig.js';
import GameEntryFeeBadge, { canAffordEntryFee } from '../../Components/GameEntryFeeBadge.jsx';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const CATEGORIES = ENIGMA_PULSE_LOBBY_CATEGORIES;

const ENIGMA_PULSE_TIPS = [
  'Read all options carefully before answering.',
  'Start on Easy to learn each puzzle type.',
  'In 1v1, speed matters when scores are tied.',
  'Invite mode is best for private practice with friends.',
];

/** Navigating to EnigmaPulse joining routes — lobby teardown must not emit `leave_queue` or matchmaking aborts. */
const EP_ENIGMA_NAV_SKIP_LEAVE_QUEUE_KEY = 'ep_skip_leave_queue_once';
function enigmaRouteForGame(gameKey, roomId) {
  if (isPatternRecognitionGameKey(gameKey)) return `/enigmaPulse/sequence/${roomId}`;
  if (isWordCipherGameKey(gameKey)) return `/enigmaPulse/cipher/${roomId}`;
  return `/enigmaPulse/game/${roomId}`;
}

/** Figma-style card illustrations (SVG); UI chrome uses Font Awesome — https://fontawesome.com/search */

function EpCardArtPattern() {
  const uid = React.useId().replace(/:/g, '');
  const g = `ep-pat-${uid}`;
  return (
    <svg className="ep-card-art-svg ep-card-art-svg--pattern" viewBox="0 0 220 248" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="45%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <circle cx="42" cy="58" r="3" fill={`url(#${g})`} opacity="0.55" />
      <circle cx="182" cy="72" r="2.5" fill={`url(#${g})`} opacity="0.5" />
      <circle cx="176" cy="188" r="2.5" fill={`url(#${g})`} opacity="0.45" />
      <circle cx="48" cy="192" r="3" fill={`url(#${g})`} opacity="0.5" />
      <circle cx="188" cy="132" r="2" fill={`url(#${g})`} opacity="0.4" />
      <line x1="36" y1="118" x2="52" y2="108" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.35" />
      <line x1="168" y1="98" x2="188" y2="88" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.35" />
      <circle cx="110" cy="128" r="92" fill="none" stroke={`url(#${g})`} strokeWidth="1.4" opacity="0.35" />
      <circle cx="110" cy="128" r="76" fill="none" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.28" />
      <polygon points="110,44 188,198 32,198" fill="none" stroke={`url(#${g})`} strokeWidth="2.6" strokeLinejoin="round" opacity="0.95" />
      <circle cx="110" cy="158" r="34" fill="none" stroke={`url(#${g})`} strokeWidth="2.2" opacity="0.9" />
      <text x="110" y="172" textAnchor="middle" fill={`url(#${g})`} fontSize="38" fontWeight="800" fontFamily="Inter, system-ui, sans-serif">
        ?
      </text>
    </svg>
  );
}

function EpCardArtCipher() {
  const uid = React.useId().replace(/:/g, '');
  const g = `ep-ciph-${uid}`;
  const letters = ['Z', 'B', 'A', 'Σ', 'D', 'E', 'X', 'K'];
  const cx = 110;
  const cy = 128;
  const r = 78;
  return (
    <svg className="ep-card-art-svg ep-card-art-svg--cipher" viewBox="0 0 220 248" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r="100" fill="none" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.28" />
      <circle cx={cx} cy={cy} r="86" fill="none" stroke={`url(#${g})`} strokeWidth="1.4" opacity="0.42" />
      <circle cx={cx} cy={cy} r="70" fill="none" stroke={`url(#${g})`} strokeWidth="1.6" opacity="0.55" />
      {letters.map((ch, i) => {
        const angle = (-90 + (i * 360) / letters.length) * (Math.PI / 180);
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return (
          <text
            key={ch + i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={`url(#${g})`}
            fontSize="13"
            fontWeight="800"
            fontFamily="Inter, system-ui, sans-serif"
            opacity="0.92"
          >
            {ch}
          </text>
        );
      })}
      <path
        d="M 82 118 V 96 Q110 68 138 96 V 118"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <rect x="76" y="122" width="68" height="58" rx="9" fill="rgba(15,23,42,0.35)" stroke={`url(#${g})`} strokeWidth="3.2" />
      <circle cx={cx} cy="152" r="7" fill={`url(#${g})`} />
    </svg>
  );
}

function EpCardArtSyllogism() {
  const uid = React.useId().replace(/:/g, '');
  const g = `ep-syl-${uid}`;
  const orb = `ep-syl-orb-${uid}`;
  return (
    <svg className="ep-card-art-svg ep-card-art-svg--syll" viewBox="0 0 220 248" aria-hidden>
      <defs>
        <linearGradient id={g} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="40%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <radialGradient id={orb} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbeb" stopOpacity="1" />
          <stop offset="40%" stopColor="#fcd34d" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="110" cy="210" rx="92" ry="18" fill="none" stroke={`url(#${g})`} strokeWidth="1" opacity="0.22" />
      <ellipse cx="110" cy="200" rx="78" ry="14" fill="none" stroke={`url(#${g})`} strokeWidth="1" opacity="0.28" />
      <ellipse cx="110" cy="190" rx="64" ry="11" fill="none" stroke={`url(#${g})`} strokeWidth="1" opacity="0.35" />
      <path d="M 52 188 L52 118 L68 108 L68 188 Z" fill="rgba(251,191,36,0.06)" stroke={`url(#${g})`} strokeWidth="2.2" />
      <path d="M 152 188 L152 118 L168 108 L168 188 Z" fill="rgba(251,191,36,0.06)" stroke={`url(#${g})`} strokeWidth="2.2" />
      <rect x="68" y="128" width="12" height="60" rx="1" fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <rect x="88" y="120" width="12" height="68" rx="1" fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <rect x="108" y="112" width="12" height="76" rx="1" fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <rect x="128" y="120" width="12" height="68" rx="1" fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <rect x="148" y="128" width="12" height="60" rx="1" fill="none" stroke={`url(#${g})`} strokeWidth="2" />
      <path d="M 48 118 L110 86 L172 118" fill="rgba(251,191,36,0.12)" stroke={`url(#${g})`} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="110" cy="72" r="22" fill={`url(#${orb})`} />
      <circle cx="110" cy="72" r="12" fill="#fffbeb" opacity="0.55" />
    </svg>
  );
}

function EpGameCardArt({ gameKey }) {
  if (gameKey === 'pattern_recognition') return <EpCardArtPattern />;
  if (gameKey === 'word_cipher') return <EpCardArtCipher />;
  return <EpCardArtSyllogism />;
}

function EpLobbyCenterPanel({
  selectedGameKey,
  difficulty,
  setDifficulty,
  category,
  setCategory,
  isSearching,
  isPreparingMatch,
  onGameCardClick,
  extraClassName = '',
}) {
  return (
    <section
      className={`ep-center-panel ep-center-panel--bg ep-center-panel--figma ${extraClassName}`.trim()}
    >
      <div className="ep-cosmic-fx" aria-hidden="true">
        <div className="ep-cosmic-fx__nebula" />
        <div className="ep-cosmic-fx__stars" />
        <div className="ep-cosmic-fx__horizon" />
        <div className="ep-cosmic-fx__shoot" />
      </div>
      <div className="ep-cosmic-content">
        <header className="ep-figma-hero">
          <div className="ep-figma-title-row">
            <h1 className="ep-figma-h1">
              <span className="ep-figma-h1__gradient">EnigmaPulse Lobby</span>
            </h1>
            <span className="ep-figma-pulse-wrap" aria-hidden>
              <FontAwesomeIcon icon={faHeartPulse} className="ep-figma-pulse-icon" />
            </span>
          </div>
          <p className="ep-figma-lead">Choose your puzzle game, then select how you want to play.</p>
          {isPreparingMatch ? (
            <p className="ep-search-status ep-search-status--figma">Building your question deck…</p>
          ) : isSearching ? (
            <p className="ep-search-status ep-search-status--figma">Searching for a real-time opponent...</p>
          ) : null}
        </header>

        <div className="ep-figma-cards">
          {ENIGMA_GAME_OPTIONS.map((game) => (
            <button
              key={game.key}
              type="button"
              className={`ep-figma-card ep-figma-card--${game.accent} ${selectedGameKey === game.key ? 'is-selected' : ''}`}
              aria-pressed={selectedGameKey === game.key}
              aria-label={`${game.title}. ${game.subtitle}. Choose play mode.`}
              onClick={() => onGameCardClick(game)}
            >
              <div className="ep-figma-card__inner">
                <div className="ep-figma-card__art-wrap">
                  <div className="ep-figma-card__art-panel">
                    <EpGameCardArt gameKey={game.key} />
                  </div>
                </div>
                <span className="ep-figma-card__title">{game.title}</span>
                <span className="ep-figma-card__desc">{game.subtitle}</span>
                <span className="ep-figma-card__go" aria-hidden>
                  <FontAwesomeIcon icon={faArrowRight} className="ep-figma-card__go-icon" />
                </span>
              </div>
            </button>
          ))}
        </div>

        <span className="ep-visually-hidden">Category</span>
        <div className="ep-chip-ro ep-visually-hidden" aria-hidden="true">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={category === c ? 'ep-chip active' : 'ep-chip'} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="ep-figma-difficulty">
          <div className="ep-figma-difficulty__label">
            <FontAwesomeIcon icon={faStar} className="ep-figma-difficulty__deco" aria-hidden />
            <FontAwesomeIcon icon={faChartBar} className="ep-figma-difficulty__icon" aria-hidden />
            <span>Select Difficulty</span>
            <FontAwesomeIcon icon={faStar} className="ep-figma-difficulty__deco" aria-hidden />
          </div>
          <div className="ep-figma-diff-pills" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`ep-figma-pill ep-figma-pill--${d} ${difficulty === d ? 'is-active' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {d === 'easy' ? <FontAwesomeIcon icon={faLeaf} className="ep-figma-pill__icon" aria-hidden /> : null}
                {d === 'medium' ? <FontAwesomeIcon icon={faCrown} className="ep-figma-pill__icon" aria-hidden /> : null}
                {d === 'hard' ? <FontAwesomeIcon icon={faFire} className="ep-figma-pill__icon" aria-hidden /> : null}
                <span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="ep-figma-tagline">
          <div className="ep-figma-tagline__rule" aria-hidden>
            <span className="ep-figma-tagline__line" />
            <FontAwesomeIcon icon={faStar} className="ep-figma-tagline__star" aria-hidden />
          </div>
          <p className="ep-figma-tagline__text">Sharpen your mind. Solve the unknown.</p>
          <div className="ep-figma-tagline__rule ep-figma-tagline__rule--flip" aria-hidden>
            <FontAwesomeIcon icon={faStar} className="ep-figma-tagline__star" aria-hidden />
            <span className="ep-figma-tagline__line" />
          </div>
        </footer>
      </div>
    </section>
  );
}

export default function EnigmaPulseLobby() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [gameUser, setGameUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');
  const [category, setCategory] = useState('General Knowledge');
  const [isSearching, setIsSearching] = useState(false);
  const [isPreparingMatch, setIsPreparingMatch] = useState(false);
  const [selectedGameKey, setSelectedGameKey] = useState(ENIGMA_GAME_OPTIONS[0].key);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [inviteSaved, setInviteSaved] = useState(false);
  const [invitedPlayers, setInvitedPlayers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [isMobileLobby, setIsMobileLobby] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );
  const availablePlayers = useGamePlayers('enigma');
  const selectedPlayer = useMemo(
    () => availablePlayers.find((p) => p.uid === selectedUid) || availablePlayers[0] || null,
    [availablePlayers, selectedUid]
  );

  const queueCategory = useMemo(() => {
    if (selectedGameKey === 'word_cipher') return WORD_CIPHER_CATEGORY;
    return category;
  }, [selectedGameKey, category]);

  const inviteIdFromUrl = searchParams.get('inviteId') || '';
  const matchIdFromUrl = searchParams.get('matchId') || '';

  const {
    entryFee,
    questionCount,
    questionSeconds,
    maintenanceMode,
    enabled: enigmaEnabled,
  } = useGameConfig('enigma_pulse', { variantKey: selectedGameKey });

  const ensureCanPlay = () => {
    if (maintenanceMode) {
      toast.error('Games are in maintenance mode. Please try again later.');
      return false;
    }
    if (!enigmaEnabled) {
      toast.error('EnigmaPulse is temporarily unavailable.');
      return false;
    }
    if (!canAffordEntryFee(gameUser?.coins, entryFee)) {
      toast.error(`Insufficient coins! You need ${entryFee} coins to play.`, { icon: '💰' });
      return false;
    }
    return true;
  };

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setIsMobileLobby(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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
        xp: Number(u.xp || 0),
        stats: { totalMatches: 0, wins: 0, accuracy: 0, avgMoveSpeedMs: 0 },
      });
      connectSocket();
      await ensureSocketConnected();
      if (inviteIdFromUrl) {
        socket.emit('ep_accept_invite_link', {
          inviteId: inviteIdFromUrl,
          displayName: u.displayName,
          photoURL: u.photoURL,
        });
      } else if (matchIdFromUrl) {
        navigate(`/enigmaPulse/game/${matchIdFromUrl}`, { replace: true });
      }
    })();
    return () => {
      active = false;
    };
  }, [inviteIdFromUrl, matchIdFromUrl, navigate]);

  useEffect(() => {
    const inv = location.state?.openPatternInvite;
    if (inv) {
      setSelectedGameKey('pattern_recognition');
      setInviteModalOpen(true);
      if (typeof location.state?.category === 'string') setCategory(location.state.category);
      if (typeof location.state?.difficulty === 'string') setDifficulty(location.state.difficulty);
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    const onPreparing = () => {
      setIsSearching(false);
      setIsPreparingMatch(true);
    };
    const onWaiting = () => {
      setIsSearching(true);
      setIsPreparingMatch(false);
      toast.info('Searching for an opponent...');
    };
    const onFound = (payload) => {
      setIsSearching(false);
      setIsPreparingMatch(false);
      if (!payload?.roomId) return;
      navigate(enigmaRouteForGame(payload?.gameKey || selectedGameKey, payload.roomId), { state: { match: payload } });
    };
    const onCreated = ({ roomId }) => {
      if (!roomId) return;
      navigate(enigmaRouteForGame(selectedGameKey, roomId));
    };
    const onErr = (p) => {
      socket.emit('ep_leave_queue');
      setIsSearching(false);
      setIsPreparingMatch(false);
      toast.error(resolveEnigmaPulseErrorToast(p));
    };
    const onInviteCreated = (payload) => {
      setInviteLink(payload?.inviteLink || '');
      toast.success('Invite link generated');
    };
    const onInviteAccepted = (payload) => {
      if (!payload?.roomId) return;
      if (inviteIdFromUrl) {
        setSearchParams({});
      }
      navigate(enigmaRouteForGame(payload?.gameKey || selectedGameKey, payload.roomId), { state: { match: payload } });
    };
    const onNotification = (payload) => {
      if (payload?.type === 'invite') {
        toast.info(payload.message || 'New invite received');
      }
    };
    socket.on('ep_waiting', onWaiting);
    socket.on(EnigmaPulseEvents.MATCH_PREPARING, onPreparing);
    socket.on(EnigmaPulseEvents.MATCH_FOUND, onFound);
    socket.on('ep_private_created', onCreated);
    socket.on('ep_error', onErr);
    socket.on('ep_invite_created', onInviteCreated);
    socket.on('ep_invite_accepted', onInviteAccepted);
    socket.on('ep_notification', onNotification);
    return () => {
      socket.off('ep_waiting', onWaiting);
      socket.off(EnigmaPulseEvents.MATCH_PREPARING, onPreparing);
      socket.off(EnigmaPulseEvents.MATCH_FOUND, onFound);
      socket.off('ep_private_created', onCreated);
      socket.off('ep_error', onErr);
      socket.off('ep_invite_created', onInviteCreated);
      socket.off('ep_invite_accepted', onInviteAccepted);
      socket.off('ep_notification', onNotification);
      if (sessionStorage.getItem(EP_ENIGMA_NAV_SKIP_LEAVE_QUEUE_KEY) === '1') {
        sessionStorage.removeItem(EP_ENIGMA_NAV_SKIP_LEAVE_QUEUE_KEY);
        return;
      }
      socket.emit('ep_leave_queue');
    };
  }, [inviteIdFromUrl, navigate, selectedGameKey, setSearchParams]);

  const joinPractice = async () => {
    if (!gameUser) return;
    if (!ensureCanPlay()) return;
    await ensureSocketConnected();
    socket.emit(
      'ep_join_queue',
      buildPracticeQueuePayload({
        user: { ...gameUser, xp: profile?.xp || 0 },
        category: queueCategory,
        difficulty,
        gameKey: selectedGameKey,
      })
    );
  };

  const joinOneVsOne = async () => {
    if (!gameUser) return;
    if (!ensureCanPlay()) return;
    await ensureSocketConnected();
    socket.emit(
      'ep_join_queue',
      buildOneVsOneQueuePayload({
        user: { ...gameUser, xp: profile?.xp || 0 },
        category: queueCategory,
        difficulty,
        gameKey: selectedGameKey,
      })
    );
  };

  const createPrivate = async () => {
    if (!gameUser) return;
    if (!ensureCanPlay()) return;
    await ensureSocketConnected();
    socket.emit('ep_create_private', {
      displayName: gameUser.displayName,
      photoURL: gameUser.photoURL,
      difficulty,
      category: queueCategory,
      gameKey: selectedGameKey,
    });
  };

  const createInvite = async () => {
    setInviteSaved(false);
    await ensureSocketConnected();
    socket.emit(
      'ep_create_invite',
      buildInvitePayload({
        targetUserId: targetUserId || invitedPlayers[0]?.uid,
        targetEmail,
        category: queueCategory,
        difficulty,
        gameKey: selectedGameKey,
      })
    );
  };

  const sendEmailInvite = async () => {
    if (!targetEmail?.trim()) {
      toast.error('Enter an email address first');
      return;
    }
    await createInvite();
    setInviteSaved(true);
    toast.success('Invite prepared for email');
  };

  const saveInvite = async () => {
    await createInvite();
    setInviteSaved(true);
    toast.success('Invite saved');
  };

  const shareWhatsApp = () => {
    if (!inviteLink) return;
    const url = `https://wa.me/?text=${encodeURIComponent(`Join my EnigmaPulse invite: ${inviteLink}`)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDesktopGameCardClick = (game) => {
    setSelectedGameKey(game.key);
    setModeModalOpen(true);
  };

  const handleMobileGameCardClick = (game) => {
    setSelectedGameKey(game.key);
  };

  const handleStartGame = () => {
    if (!selectedGameKey) {
      toast.error('Select a game first');
      return;
    }
    setModeModalOpen(true);
  };

  const chatUser = gameUser
    ? {
        uid: gameUser.uid,
        displayName: gameUser.displayName || profile?.displayName || 'Player',
        avatar: gameUser.photoURL || profile?.photoURL || '',
      }
    : null;

  const modeModal = modeModalOpen ? (
    <div className="epx-popup-overlay" onClick={() => setModeModalOpen(false)}>
      <div className="epx-popup-card epx-popup-card--mode" onClick={(e) => e.stopPropagation()}>
        <h3 className="epx-popup-title">Select Mode</h3>
        <p className="epx-popup-subtitle">Choose how you want to start this Enigma challenge.</p>
        <GameEntryFeeBadge
          entryFee={entryFee}
          questionCount={questionCount}
          questionSeconds={questionSeconds}
          className="game-entry-fee-badge--block"
        />
        <div className="epx-mode-grid">
          {ENIGMA_PLAY_MODES.map((m) => (
            <button
              key={m.key}
              className="epx-mode-pill"
              onClick={async () => {
                if (selectedGameKey === 'syllogism') {
                  if (m.key === 'invite') {
                    navigate('/enigmaPulse/syllogism', {
                      state: {
                        mode: 'invite',
                        category,
                        difficulty,
                      },
                    });
                    setModeModalOpen(false);
                    return;
                  }
                  if (m.key === 'practice' || m.key === 'one_vs_one') {
                    sessionStorage.setItem(EP_ENIGMA_NAV_SKIP_LEAVE_QUEUE_KEY, '1');
                    navigate('/enigmaPulse/syllogism/joining', {
                      state: {
                        category,
                        difficulty,
                        syllogismMode: m.key,
                      },
                    });
                    setModeModalOpen(false);
                    return;
                  }
                }
                if (isPatternRecognitionGameKey(selectedGameKey)) {
                  if (m.key === 'practice' || m.key === 'one_vs_one') {
                    sessionStorage.setItem(EP_ENIGMA_NAV_SKIP_LEAVE_QUEUE_KEY, '1');
                    navigate('/enigmaPulse/sequence/joining', {
                      state: {
                        category,
                        difficulty,
                        gameKey: selectedGameKey,
                        queueMode: m.key,
                      },
                    });
                    setModeModalOpen(false);
                    return;
                  }
                  if (m.key === 'invite') {
                    setInviteModalOpen(true);
                    setModeModalOpen(false);
                    return;
                  }
                }
                if (m.key === 'practice') await joinPractice();
                if (m.key === 'one_vs_one') await joinOneVsOne();
                if (m.key === 'invite') setInviteModalOpen(true);
                setModeModalOpen(false);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  const inviteModal = inviteModalOpen ? (
    <div className="epx-popup-overlay" onClick={() => setInviteModalOpen(false)}>
      <div className="epx-popup-card epx-popup-card--invite" onClick={(e) => e.stopPropagation()}>
        <div className="epx-invite-header">
          <div>
            <h3 className="epx-popup-title epxInviteTitle">Invite Players</h3>
            <p className="epx-popup-subtitle epxInviteSubtitle">Invite Friend</p>
          </div>
          <button
            type="button"
            className="epxInviteCloseBtn"
            onClick={() => setInviteModalOpen(false)}
            aria-label="Close invite"
          >
            <FontAwesomeIcon icon={faXmark} className="epxInviteCloseFa" />
          </button>
        </div>
        <div className="epxInviteForm">
          <label className="epx-input-group epxInviteInputGroup">
            <FontAwesomeIcon icon={faEnvelope} className="epxInviteLabelFa" fixedWidth /> Email
            <input
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="Enter email address"
            />
          </label>
          <label className="epx-input-group epxInviteInputGroup">
            <FontAwesomeIcon icon={faUser} className="epxInviteLabelFa" fixedWidth /> Player ID
            <input
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="Enter player ID"
            />
          </label>
        </div>
        <div className="epxInviteActionRow">
          <button className="epxInviteActionBtn epxInviteActionBtn--whatsapp" onClick={shareWhatsApp} type="button" disabled={!inviteLink}>
            <FontAwesomeIcon icon={faMessage} className="epxInviteBtnFa" /> WhatsApp
          </button>
          <button className="epxInviteActionBtn epxInviteActionBtn--email" onClick={sendEmailInvite} type="button">
            <FontAwesomeIcon icon={faEnvelope} className="epxInviteBtnFa" /> Email
          </button>
        </div>
        <button className="epxInviteMainBtn epxInviteMainBtn--save" onClick={saveInvite} type="button">
          Save Invite
        </button>
        <button className="epxInviteMainBtn epxInviteMainBtn--start" onClick={createPrivate} type="button">
          Start Invite Match
        </button>
        {inviteLink ? (
          <div className="epx-link-panel epxInviteLinkPanel">
            <p className="epx-link-title"><FontAwesomeIcon icon={faLink} className="epxInviteLabelFa" fixedWidth /> Invite Link</p>
            <input readOnly value={inviteLink} />
            <div className="epx-link-actions">
              <button className="ep-action-btn alt" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                Copy Link
              </button>
            </div>
          </div>
        ) : null}
        {inviteSaved ? <p className="epxInviteSavedNote">Invite saved. You can now share link or start match.</p> : null}
      </div>
    </div>
  ) : null;

  const centerPanelProps = {
    selectedGameKey,
    difficulty,
    setDifficulty,
    category,
    setCategory,
    isSearching,
    isPreparingMatch,
  };

  return (
    <Layout>
      {!isMobileLobby ? (
        <div className="ep-lobby-shell ep-lobby-shell--desktop">
          <div className="ep-left-column">
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
                    : [...prev, { uid: p.uid, name: p.profile?.displayName || p.uid, avatar: p.profile?.avatar, type: 'friend' }]
                )
              }
              invitedPlayers={invitedPlayers}
              maxPlayers={2}
            />
            <ChatBox lobbyId={gameLobbyId('enigma')} currentUser={gameUser} />
          </div>

          <EpLobbyCenterPanel
            {...centerPanelProps}
            onGameCardClick={handleDesktopGameCardClick}
          />

          <aside className="ep-right-panel">
            <LobbyRightSidebar
              user={profile}
              gameId="enigma"
              invitedPlayers={invitedPlayers}
              setInvitedPlayers={setInvitedPlayers}
              onConfirmInvite={createPrivate}
              maxPlayers={2}
              themeColor="#8b5cf6"
            />
          </aside>
        </div>
      ) : (
        <div className="ep-lobby-root ep-lobby-root--mobile">
          <aside className="ep-mobile-stats" aria-label="Your stats">
            <LobbyRightSidebar
              user={profile}
              gameId="enigma"
              invitedPlayers={invitedPlayers}
              setInvitedPlayers={setInvitedPlayers}
              onConfirmInvite={createPrivate}
              maxPlayers={2}
              themeColor="#8b5cf6"
              tips={ENIGMA_PULSE_TIPS}
              showGuideSection={false}
            />
          </aside>

          <EnigmaPulseMobileProfile gameUser={gameUser} />

          <EpLobbyCenterPanel
            {...centerPanelProps}
            onGameCardClick={handleMobileGameCardClick}
            extraClassName="ep-center-panel--mobile"
          />

          <EnigmaPulseBottom
            onStartGame={handleStartGame}
            isSearching={isSearching}
            disabled={!gameUser}
          />

          <div className="ep-mobile-chat">
            <ChatBox
              lobbyId={gameLobbyId('enigma')}
              layoutVariant="enigma-lobby"
              currentUser={chatUser}
            />
          </div>

          <aside className="ep-mobile-guide" aria-label="Game guide">
            <LobbyRightSidebar
              user={profile}
              gameId="enigma"
              themeColor="#8b5cf6"
              tips={ENIGMA_PULSE_TIPS}
              showStatsSection={false}
            />
          </aside>
        </div>
      )}

      {modeModal}
      {inviteModal}
      <Toaster position="top-center" richColors />
    </Layout>
  );
}