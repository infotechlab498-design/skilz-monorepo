import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const FALLBACK_AVATAR = '/player1.png';

function useSliderPageSize() {
    const [pageSize, setPageSize] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 1024 ? 4 : 3
    );

    useEffect(() => {
        const onResize = () => {
            setPageSize(window.innerWidth < 1024 ? 4 : 3);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return pageSize;
}

/**
 * Auto-rotating slider. Renders avatars and forwards `onSelect(player)` to the parent.
 */
function ImageSlider({ players = [], onSelect, selectedUid }) {
    const itemsPerSlide = useSliderPageSize();
    const totalSlides = Math.ceil(players.length / itemsPerSlide) || 1;
    const [slideIndex, setSlideIndex] = useState(0);

    useEffect(() => {
        // Reset to the first slide whenever the underlying list changes size to avoid
        // landing on an out-of-range page after presence updates.
        setSlideIndex((prev) => (prev >= totalSlides ? 0 : prev));
    }, [totalSlides]);

    useEffect(() => {
        if (!players.length || totalSlides <= 1) return undefined;
        const interval = setInterval(() => {
            setSlideIndex((prev) => (prev + 1) % totalSlides);
        }, 2500);
        return () => clearInterval(interval);
    }, [players.length, totalSlides]);

    const start = slideIndex * itemsPerSlide;
    const visibleSlice = players.slice(start, start + itemsPerSlide);

    const goPrev = () => setSlideIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
    const goNext = () => setSlideIndex((prev) => (prev + 1) % totalSlides);

    return (
        <div className="slider slider--players">
            {totalSlides > 1 ? (
                <button type="button" className="slider__nav slider__nav--prev" onClick={goPrev} aria-label="Previous players">
                    <ChevronLeft size={18} />
                </button>
            ) : null}
            <div className={`slider__row${visibleSlice.length <= 2 ? ' slider__row--sparse' : ''}`}>
                {visibleSlice.map((p) => {
                    const isActive = selectedUid && p.uid === selectedUid;
                    const name = p.profile?.displayName || p.uid;
                    const xp = p.profile?.xp ?? 0;
                    return (
                        <div
                            key={p.uid}
                            className={`slider__item${isActive ? ' slider__item--active' : ''}`}
                            onClick={() => onSelect(p)}
                            title={name}
                        >
                            <img src={p.profile?.avatar || FALLBACK_AVATAR} alt={name} />
                            {p.isMe ? <span className="slider__badge">You</span> : null}
                            <span className="slider__name">{name}</span>
                            <span className="slider__xp">XP {xp}</span>
                        </div>
                    );
                })}
            </div>
            {totalSlides > 1 ? (
                <button type="button" className="slider__nav slider__nav--next" onClick={goNext} aria-label="Next players">
                    <ChevronRight size={18} />
                </button>
            ) : null}
            {totalSlides > 1 && (
                <div className="slider__dots">
                    {Array.from({ length: totalSlides }).map((_, i) => (
                        <span
                            key={i}
                            className={`dot ${i === slideIndex ? 'active' : ''}`}
                            onClick={() => setSlideIndex(i)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Pulls the current Firebase/Firestore user out of Redux and shapes it like
 * a presence row so the slider can render it next to friends.
 * Returns `null` when nobody is signed in.
 */
function useCurrentLobbyPlayer() {
    const authUser = useSelector((state) => state.auth?.user);
    const userState = useSelector((state) => state.user);

    return useMemo(() => {
        const uid = authUser?.uid;
        if (!uid) return null;

        const profile = userState?.profile || {};
        const displayName =
            profile.displayName ||
            profile.username ||
            authUser.username ||
            authUser.displayName ||
            authUser.name ||
            authUser.email?.split('@')[0] ||
            'You';
        const avatar =
            profile.avatar ||
            profile.photoURL ||
            authUser.photoURL ||
            authUser.avatar ||
            FALLBACK_AVATAR;

        return {
            uid,
            isMe: true,
            online: true,
            presence: { status: 'online', meta: { displayName } },
            profile: {
                displayName,
                avatar,
                level: userState?.level ?? profile.level ?? 1,
                xp: userState?.xp ?? profile.xp ?? 0,
            },
        };
    }, [authUser, userState]);
}

const LobbySliders = ({
    creating,
    authReady,
    availablePlayers = [],
    selectedPlayer,
    setSelectedUid,
    handleInvite,
    invitedPlayers = [],
    maxPlayers = 2,
}) => {
    const currentPlayer = useCurrentLobbyPlayer();

    /**
     * Combined list shown in the slider + featured panel:
     * - the signed-in user always appears first (so something real shows even when no friends are online)
     * - online friends from `/api/online-players` follow, deduped by uid
     */
    const combinedPlayers = useMemo(() => {
        const seen = new Set();
        const list = [];
        if (currentPlayer) {
            list.push(currentPlayer);
            seen.add(currentPlayer.uid);
        }
        for (const p of availablePlayers) {
            if (!p?.uid || seen.has(p.uid)) continue;
            seen.add(p.uid);
            list.push(p);
        }
        return list;
    }, [currentPlayer, availablePlayers]);

    /** Friends-only list for the Invite section — self can't invite self. */
    const inviteablePlayers = useMemo(
        () => combinedPlayers.filter((p) => !p.isMe),
        [combinedPlayers]
    );

    // Keep an internal selection so lobbies that don't manage `selectedPlayer`
    // (Ludo, MathRush) still get a working featured panel + click-to-focus.
    const [localSelectedUid, setLocalSelectedUid] = useState(null);

    useEffect(() => {
        if (!localSelectedUid && combinedPlayers.length) {
            setLocalSelectedUid(combinedPlayers[0].uid);
            return;
        }
        if (localSelectedUid && !combinedPlayers.some((p) => p.uid === localSelectedUid)) {
            setLocalSelectedUid(combinedPlayers[0]?.uid || null);
        }
    }, [combinedPlayers, localSelectedUid]);

    const effectiveSelected = useMemo(() => {
        if (selectedPlayer) return selectedPlayer;
        if (!combinedPlayers.length) return null;
        return (
            combinedPlayers.find((p) => p.uid === localSelectedUid) ||
            combinedPlayers[0]
        );
    }, [selectedPlayer, combinedPlayers, localSelectedUid]);

    const handleSelect = (player) => {
        if (!player?.uid) return;
        setLocalSelectedUid(player.uid);
        if (typeof setSelectedUid === 'function') setSelectedUid(player.uid);
    };

    const featuredName = effectiveSelected?.profile?.displayName || 'No players online';
    const featuredLevel = effectiveSelected?.profile?.level ?? '-';
    const featuredXp = effectiveSelected?.profile?.xp ?? '-';
    const featuredStatus = effectiveSelected?.presence?.status || (effectiveSelected ? 'online' : 'offline');

    return (
        <div className="leftSidebar">
            <div className="players-lobby__grid-container">
                <div className="card card--available-players">
                    <div className="card__title card__title--players">
                        <span>Available Players</span>
                        <span className="players-count players-count--badge">{combinedPlayers.length} Online</span>
                    </div>

                    {!authReady && (
                        <div className="muted">Connecting to Firebase…</div>
                    )}
                    {authReady && !currentPlayer && combinedPlayers.length === 0 && (
                        <div className="muted">Sign in to see who's online.</div>
                    )}
                    {authReady && currentPlayer && inviteablePlayers.length === 0 && (
                        <div className="muted">You're the only one online — invite a friend!</div>
                    )}

                    <div className="featured" style={{ marginTop: 10 }}>
                        <div className="featured__avatar">
                            <img
                                src={effectiveSelected?.profile?.avatar || FALLBACK_AVATAR}
                                alt={featuredName}
                            />
                        </div>
                        <div className="featured__meta">
                            <div className="featured__name">
                                {featuredName}
                                {effectiveSelected?.isMe && (
                                    <span className="featured__you-tag"> · You</span>
                                )}
                            </div>
                            <div className="featured__sub">
                                Lv {featuredLevel} · XP {featuredXp} · {featuredStatus}
                            </div>
                        </div>
                    </div>

                    <div className="featured__meta featured__meta--relative featured__meta--slider">
                        <ImageSlider
                            players={combinedPlayers}
                            selectedUid={effectiveSelected?.uid}
                            onSelect={handleSelect}
                        />
                    </div>
                </div>

                <div className="card card--invite-friends">
                    <div className="card__title">
                        <span>Invite Friends</span>
                        <span className="muted">{inviteablePlayers.length} online</span>
                    </div>
                    <div className="list">
                        {inviteablePlayers.length === 0 && (
                            <div className="muted" style={{ padding: 8 }}>
                                No friends online right now.
                            </div>
                        )}
                        {inviteablePlayers.map((p) => {
                            const alreadyInvited = invitedPlayers.some((ip) => ip.uid === p.uid);
                            const inviteFull = invitedPlayers.length >= (maxPlayers - 1);
                            return (
                                <div className="row" key={p.uid}>
                                    <div className="row__avatar">
                                        <img src={p.profile?.avatar || FALLBACK_AVATAR} alt="" />
                                    </div>
                                    <div className="row__main">
                                        <div className="row__name">{p.profile?.displayName || p.uid}</div>
                                        <div className="row__stat">
                                            Lv {p.profile?.level ?? 1} · XP {p.profile?.xp ?? 0}
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn--blue"
                                        disabled={
                                            creating ||
                                            !authReady ||
                                            alreadyInvited ||
                                            (inviteFull && !alreadyInvited)
                                        }
                                        onClick={() => void handleInvite?.(p)}
                                    >
                                        {alreadyInvited ? 'Invited' : 'Invite'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            
        </div>
    );
};

export default LobbySliders;
