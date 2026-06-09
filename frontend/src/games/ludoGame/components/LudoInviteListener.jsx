import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../firebase/config.js';
import { socketService } from '../../../services/socketService.js';
import { toast } from 'sonner';

/**
 * Global Ludo friend-invite listener (works off /ludoLobby). Shows incoming modal + toasts for inviter outcomes.
 */
export default function LudoInviteListener() {
    const navigate = useNavigate();
    const [incoming, setIncoming] = useState(null);
    const [nowTick, setNowTick] = useState(() => Date.now());

    useEffect(() => {
        if (!incoming?.expiresAt) return undefined;
        const id = setInterval(() => setNowTick(Date.now()), 400);
        return () => clearInterval(id);
    }, [incoming?.expiresAt]);

    const detachRef = React.useRef(null);

    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (detachRef.current) {
                detachRef.current();
                detachRef.current = null;
            }
            if (!user) return;
            void (async () => {
                try {
                    const s = await socketService.ensureConnected({ forceRefresh: false });
                    const onInv = (p) => {
                        if (!p?.roomId || !p?.inviteId) return;
                        setIncoming({
                            inviteId: p.inviteId,
                            roomId: p.roomId,
                            expiresAt: Number(p.expiresAt) || Date.now() + 60000,
                            fromUid: p.fromUid,
                            fromDisplayName: p.fromDisplayName || p.fromUid,
                        });
                    };
                    const onRes = (p) => {
                        if (p?.accepted) {
                            toast.success('Friend accepted your invite');
                        } else {
                            toast.message('Invite declined');
                        }
                    };
                    const onEx = () => {
                        toast.message('Invite expired');
                    };
                    s.on('ludo:inviteReceived', onInv);
                    s.on('ludo:inviteResult', onRes);
                    s.on('ludo:inviteExpired', onEx);
                    detachRef.current = () => {
                        s.off('ludo:inviteReceived', onInv);
                        s.off('ludo:inviteResult', onRes);
                        s.off('ludo:inviteExpired', onEx);
                    };
                } catch {
                    /* not signed in or socket unavailable */
                }
            })();
        });
        return () => {
            unsubAuth();
            if (detachRef.current) detachRef.current();
        };
    }, []);

    const reject = useCallback(() => {
        if (!incoming) return;
        socketService.emit('ludo:rejectInvite', { inviteId: incoming.inviteId });
        setIncoming(null);
    }, [incoming]);

    const accept = useCallback(() => {
        if (!incoming) return;
        navigate(`/ludo/game/${incoming.roomId}`, {
            state: { inviteId: incoming.inviteId, isHost: false },
        });
        setIncoming(null);
    }, [incoming, navigate]);

    const secsLeft = incoming
        ? Math.max(0, Math.ceil((Number(incoming.expiresAt) - nowTick) / 1000))
        : 0;

    if (!incoming) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ludo-invite-title"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10050,
                background: 'rgba(15,23,42,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 400,
                    background: '#fff',
                    borderRadius: 14,
                    padding: 22,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                }}
            >
                <h2 id="ludo-invite-title" style={{ margin: '0 0 8px', fontSize: 18 }}>
                    Ludo invite
                </h2>
                <p style={{ margin: '0 0 8px', color: '#475569', fontSize: 14 }}>
                    <strong>{incoming.fromDisplayName}</strong> invited you to a private room.
                </p>
                <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13 }}>
                    Expires in <strong>{secsLeft}</strong>s
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={reject}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Reject
                    </button>
                    <button
                        type="button"
                        onClick={accept}
                        style={{
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#0f172a',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
