import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGamePlayers } from '../hooks/useGamePlayers';
import Layout from '../Components/Layout';
import LobbyHeader from '../lobbyPages/components/LobbyHeader';
import LobbySliders from '../lobbyPages/components/LobbySliders';
import LobbyRightSidebar from '../lobbyPages/components/LobbyRightSidebar';
import { PlayerSelection } from './ludoGame/components/PlayerSelection';
import { socketService } from '../services/socketService';
import { auth } from '../firebase/config.js';
import { addFriendByUid } from '../services/friendsService.js';
import { startUserPresence } from '../services/presenceService.js';
// NOTE: deductCoins removed — wallet deduction is SERVER-ONLY (ludo:createRoom / ludo:joinRoom)
import '../lobbyPages/triviaGame.css';
import FriendMatchSessionBanner from '../Components/friends/FriendMatchSessionBanner.jsx';
import { Toaster, toast } from 'sonner';
import ChatBox from '../lobbyPages/components/ChatBox';
import { gameLobbyId } from '../firebase/gameLobbyPath.js';
import { useGameConfig } from '../hooks/useGameConfig.js';

/** Firestore `lobbies/{id}` for Ludo lobby chat — must match rules `game_*` public prefix. */
const LUDO_FIRESTORE_CHAT_LOBBY_ID = gameLobbyId('ludo');

const MotionDiv = motion.div;

function ProgressBar({ progress, themeColor }) {
    return (
        <div className="progress-bar-container">
            <MotionDiv
                className="progress-bar-fill"
                style={{ backgroundColor: themeColor || '#10b981' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
            />
        </div>
    );
}

const LudoGameLobby = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const friendMatchId = searchParams.get('matchId') || '';
    const { user: authUser } = useSelector((state) => state.auth);
    // coins shown as UX pre-check only — NOT authoritative
    const { coins } = useSelector((state) => state.user);
    const { entryFee: ENTRY_FEE } = useGameConfig('ludo');

    const gameId = "ludo";
    const maxPlayers = 4;

    const [, setView] = useState('lobby');
    const availablePlayers = useGamePlayers(gameId);
    const [invitedPlayers, setInvitedPlayers] = useState([]);
    /** Shared private room for sequential friend invites from this lobby session. */
    const friendInviteRoomIdRef = useRef(null);
    const [inviteBusyUid, setInviteBusyUid] = useState(null);
    const [lobbyError, setLobbyError] = useState(null);
    const handleLobbyError = useCallback((message) => {
        setLobbyError(message);
    }, []);
    const handleLobbyClearError = useCallback(() => {
        setLobbyError(null);
    }, []);

    /* eslint-disable no-unused-vars -- online room block is commented in JSX below */
    const [joinRoomInput, setJoinRoomInput] = useState('');
    const [onlineBusy, setOnlineBusy] = useState(false);
    const [friendUidInput, setFriendUidInput] = useState('');
    const [friendMsg, setFriendMsg] = useState(null);

    const displayNameForOnline =
        authUser?.username || authUser?.displayName || authUser?.name || 'Player';

    const handleCreateOnlineRoom = async () => {
        setLobbyError(null);
        if (!authUser) {
            alert('Please sign in to play!');
            return;
        }
        if (coins < ENTRY_FEE) {
            alert(`Insufficient coins! Entry fee is ${ENTRY_FEE} coins.`);
            return;
        }
        setOnlineBusy(true);
        let socket;
        try {
            socket = await socketService.ensureConnected({ forceRefresh: false });
        } catch (e) {
            setOnlineBusy(false);
            setLobbyError(e?.message || 'Sign in required to connect');
            return;
        }

        const onCreated = (payload) => {
            socket.off('ludo:roomCreated', onCreated);
            socket.off('ludo:error', onErr);
            setOnlineBusy(false);
            const id = payload?.roomId;
            if (id) navigate(`/ludo/game/${id}`, { state: { isHost: true } });
            else setLobbyError('Room created but missing id');
        };
        const onErr = (e) => {
            socket.off('ludo:roomCreated', onCreated);
            socket.off('ludo:error', onErr);
            setOnlineBusy(false);
            setLobbyError(e?.message || 'Could not create room');
        };

        socket.once('ludo:roomCreated', onCreated);
        socket.once('ludo:error', onErr);

        socket.emit('ludo:createRoom', {
            displayName: displayNameForOnline,
            maxPlayers: 4,
            fillBots: false,
            entryFee: ENTRY_FEE,
            turnTimerSec: 30,
        });
    };

    const handleAddFriendFirestore = async () => {
        setFriendMsg(null);
        const u = auth.currentUser;
        if (!u) {
            setFriendMsg('Sign in with Firebase (email/Google) to manage friends.');
            return;
        }
        try {
            await addFriendByUid(u.uid, friendUidInput);
            setFriendMsg('Friend added. They appear in the list when their Firestore profile exists.');
            setFriendUidInput('');
        } catch (e) {
            setFriendMsg(e?.message || 'Could not add friend');
        }
    };

    const parseJoinRoomId = (raw) => {
        const t = String(raw || '').trim();
        if (!t) return '';
        try {
            if (t.startsWith('http')) {
                const u = new URL(t);
                const parts = u.pathname.split('/').filter(Boolean);
                const idx = parts.indexOf('game');
                if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
                return parts[parts.length - 1] || '';
            }
        } catch {
            /* fall through */
        }
        if (t.includes('/')) {
            const parts = t.split('/').filter(Boolean);
            const idx = parts.indexOf('game');
            if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
            return parts[parts.length - 1] || '';
        }
        return t;
    };

    const handleJoinOnlineRoom = () => {
        setLobbyError(null);
        if (!authUser) {
            alert('Please sign in to play!');
            return;
        }
        const id = parseJoinRoomId(joinRoomInput);
        if (!id) {
            setLobbyError('Paste a room link or room id');
            return;
        }
        navigate(`/ludo/game/${id}`);
    };

    /* eslint-enable no-unused-vars */

    const createFriendInviteRoomOnce = useCallback(async () => {
        if (friendInviteRoomIdRef.current) return friendInviteRoomIdRef.current;
        if (!authUser) throw new Error('Sign in to invite friends');
        if (coins < ENTRY_FEE) throw new Error(`Need at least ${ENTRY_FEE} coins to host a room`);
        const socket = await socketService.ensureConnected({ forceRefresh: false });
        const roomId = await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Timed out waiting for room')), 28000);
            const cleanup = () => {
                clearTimeout(t);
                socket.off('ludo:roomCreated', onOk);
                socket.off('ludo:error', onBad);
            };
            const onOk = (p) => {
                cleanup();
                const id = p?.roomId;
                if (id) resolve(id);
                else reject(new Error('Room created but missing id'));
            };
            const onBad = (e) => {
                cleanup();
                reject(new Error(e?.message || 'Could not create room'));
            };
            socket.once('ludo:roomCreated', onOk);
            socket.once('ludo:error', onBad);
            socket.emit('ludo:createRoom', {
                displayName: displayNameForOnline,
                maxPlayers: 4,
                fillBots: false,
                entryFee: ENTRY_FEE,
                turnTimerSec: 30,
                isPrivate: true,
                inviteOnly: true,
            });
        });
        friendInviteRoomIdRef.current = roomId;
        return roomId;
    }, [authUser, coins, displayNameForOnline, ENTRY_FEE]);

    const handleInvite = async (opponent) => {
        if (!opponent) return;
        if (!authUser) {
            alert('Please sign in to play!');
            return;
        }
        if (invitedPlayers.find((p) => p.uid === opponent.uid)) return;
        if (invitedPlayers.length >= maxPlayers - 1) {
            alert(`Maximum ${maxPlayers} players allowed for Ludo.`);
            return;
        }
        setLobbyError(null);
        setInviteBusyUid(opponent.uid);
        try {
            const roomId = await createFriendInviteRoomOnce();
            const socket = await socketService.ensureConnected({ forceRefresh: false });
            socket.emit('ludo:sendInvite', {
                toUserId: opponent.uid,
                roomId,
                fromDisplayName: displayNameForOnline,
                ttlMs: 60000,
            });
            setInvitedPlayers((prev) => [
                ...prev,
                {
                    uid: opponent.uid,
                    name: opponent.profile?.displayName || opponent.uid,
                    avatar: opponent.profile?.avatar,
                    type: 'friend',
                    roomId,
                },
            ]);
            toast.success(`Invite sent to ${opponent.profile?.displayName || opponent.uid}`);
        } catch (e) {
            setLobbyError(e?.message || 'Could not send invite');
            friendInviteRoomIdRef.current = null;
        } finally {
            setInviteBusyUid(null);
        }
    };

    const handleConfirmInvite = async () => {
        setLobbyError(null);
        if (!friendInviteRoomIdRef.current) {
            setLobbyError('Invite at least one friend from the list first.');
            return;
        }
        navigate(`/ludo/game/${friendInviteRoomIdRef.current}`, { state: { isHost: true } });
    };

    useEffect(() => {
        const id = authUser?.uid;
        if (!id) return undefined;
        startUserPresence(id, 'ludo-lobby');
        return () => {
            friendInviteRoomIdRef.current = null;
            startUserPresence(id, 'lobby');
        };
    }, [authUser?.uid]);

    return (
        <Layout>
            <div className="ludo-layout-shell ludo-lobby-shell">
                {/* <LobbyHeader
                    title="Ludo Master"
                    themeColor="#e91e63"
                    coins={coins}
                    setView={(v) => {
                        if (v === 'profile') navigate('/profile');
                        else setView(v);
                    }}
                    gameId={gameId}
                /> */}

                {lobbyError && (
                    <div className="ludo-alert-error">
                        {lobbyError}
                    </div>
                )}

                <FriendMatchSessionBanner matchId={friendMatchId} />

               

                <Toaster richColors position="top-center" />
            <div className="ludo-main-row ludo-lobby-main-row">
                    <div className="ludo-side ludo-side-left">
                        <div className="ludo-side-left-content">
                        <LobbySliders
                            creating={Boolean(inviteBusyUid)}
                            authReady={true}
                            availablePlayers={availablePlayers}
                            selectedPlayer={null}
                            setSelectedUid={() => { }}
                            handleInvite={handleInvite}
                            invitedPlayers={invitedPlayers}
                            maxPlayers={maxPlayers}
                        />
                      
                    </div> <div>
                            <ChatBox lobbyId={LUDO_FIRESTORE_CHAT_LOBBY_ID} currentUser={authUser} />
                        </div>
                        </div>
                    <div className="ludo-center-content ludo-lobby-center-content">
                       
                        <PlayerSelection
                            onLobbyError={handleLobbyError}
                            onLobbyClearError={handleLobbyClearError}
                        />

                    </div>

                    <div className="ludo-side ludo-side-right">
                        <LobbyRightSidebar
                            user={null}
                            gameId="ludo"
                            showInviteSection={true}
                            themeColor="#e91e63"
                            ProgressBar={ProgressBar}
                            invitedPlayers={invitedPlayers}
                            setInvitedPlayers={setInvitedPlayers}
                            onConfirmInvite={handleConfirmInvite}
                            maxPlayers={maxPlayers}
                        />
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default LudoGameLobby;
