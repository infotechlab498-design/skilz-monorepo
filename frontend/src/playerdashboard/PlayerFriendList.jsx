import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import FriendsList from '../Components/friends/FriendsList.jsx';
import InviteModal from '../Components/friends/InviteModal.jsx';
import '../Components/friends/friends.css';
import {
  DEMO_FRIENDS,
  ensureFriendsDoc,
  fetchAvailablePlayers,
  getProfilesByIds,
  sendInvite,
  subscribeFriendIds,
  subscribePresenceForUserIds,
} from '../api/friendsDashboardApi.js';
import { startUserPresence } from '../services/presenceService.js';

export default function PlayerFriendList() {
  const authUser = useSelector((s) => s.auth.user);
  const uid = authUser?.uid || '';
  const firebaseReady = useSelector((s) => s.auth.firebaseReady);

  const [friendIds, setFriendIds] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [presence, setPresence] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [availableFriends, setAvailableFriends] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    startUserPresence(uid, 'lobby');
  }, [uid]);

  useEffect(() => {
    if (!firebaseReady || !uid) {
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    setError('');

    const unsubFriends = subscribeFriendIds(uid, async (ids) => {
      const nextIds = ids.length ? ids : DEMO_FRIENDS.map((f) => f.uid);
      setUsingDemo(ids.length === 0);
      setFriendIds(nextIds);
      if (ids.length === 0) {
        const demoMap = {};
        DEMO_FRIENDS.forEach((f) => {
          demoMap[f.uid] = {
            displayName: f.displayName,
            email: f.email,
            photoURL: f.photoURL,
            currentGame: f.currentGame,
            lastSeen: f.presence?.lastSeen || null,
            __demo: true,
          };
        });
        setProfiles(demoMap);
        setLoading(false);
        return;
      }
      try {
        const p = await getProfilesByIds(ids);
        setProfiles(p || {});
        await ensureFriendsDoc(uid, ids).catch(() => {});
      } catch (e) {
        setError(e?.message || 'Could not fetch friends.');
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubFriends && unsubFriends();
    };
  }, [firebaseReady, uid]);

  useEffect(() => {
    if (!firebaseReady || !uid) {
      setPresence({});
      return () => {};
    }
    const ids = usingDemo ? [] : friendIds;
    const unsub = subscribePresenceForUserIds(ids, (map) => setPresence(map || {}));
    return () => unsub && unsub();
  }, [firebaseReady, uid, usingDemo, friendIds]);

  useEffect(() => {
    if (!firebaseReady || !uid || usingDemo) {
      setAvailableFriends([]);
      setAvailableLoading(false);
      return () => {};
    }
    let cancelled = false;
    setAvailableLoading(true);
    fetchAvailablePlayers({ limit: 30 })
      .then((res) => {
        if (cancelled) return;
        setAvailableFriends(Array.isArray(res?.players) ? res.players : []);
      })
      .catch(() => {
        if (!cancelled) setAvailableFriends([]);
      })
      .finally(() => {
        if (!cancelled) setAvailableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, uid, usingDemo]);

  const availableRows = useMemo(
    () =>
      availableFriends.map((p) => ({
        uid: p.uid,
        name: p.displayName || 'Unknown Player',
        email: p.email || '',
        avatar: p.photoURL || '',
        lastSeen: p.presence?.lastSeen || null,
        currentGame: null,
        presence: {
          online: !!p.presence?.online,
          status: p.presence?.status || 'online',
          game: p.presence?.game || null,
          lastSeen: p.presence?.lastSeen || null,
        },
        inviteStatus: 'none',
        isDemo: false,
      })),
    [availableFriends]
  );

  const mergedFriends = useMemo(
    () =>
      friendIds.map((fid) => {
        const p = profiles[fid] || {};
        const demoPresence = DEMO_FRIENDS.find((x) => x.uid === fid)?.presence || {};
        const ps = p.__demo ? demoPresence : (presence[fid] || {});
        return {
          uid: fid,
          name: p.displayName || p.name || 'Unknown Player',
          email: p.email || '',
          avatar: p.photoURL || '',
          lastSeen: p.lastSeen || null,
          currentGame: p.currentGame || null,
          presence: {
            online: !!ps.online,
            status: ps.status || (ps.online ? 'online' : 'offline'),
            game: ps.game || null,
            lastSeen: ps.lastSeen || null,
          },
          inviteStatus: ps.online ? 'none' : 'none',
          isDemo: !!p.__demo,
        };
      }),
    [friendIds, profiles, presence]
  );

  async function handleInviteSubmit({ gameId, gameName }) {
    if (!uid || !inviteTarget?.uid) return;
    setInviteBusy(true);
    setError('');
    try {
      await sendInvite({
        fromUserId: uid,
        toUserId: inviteTarget.uid,
        gameId,
        gameName,
      });
      setInviteOpen(false);
      setInviteTarget(null);
    } catch (e) {
      setError(e?.message || 'Could not send invite.');
    } finally {
      setInviteBusy(false);
    }
  }

  if (!firebaseReady) {
    return (
      <section className="frd-wr">
        <div className="frd-top">
          <p className="frd-bc">Pages / <span>Friends List</span></p>
        </div>
        <section className="frd-crd"><div className="frd-empty">Loading session…</div></section>
      </section>
    );
  }

  if (!uid) {
    return (
      <section className="frd-wr">
        <div className="frd-top">
          <p className="frd-bc">Pages / <span>Friends List</span></p>
        </div>
        <section className="frd-crd"><div className="frd-empty">Sign in to view friends.</div></section>
      </section>
    );
  }

  return (
    <section className="frd-wr">
      <div className="frd-top">
        <p className="frd-bc">Pages / <span>Friends List</span></p>
      </div>

      {error ? <section className="frd-crd"><div className="frd-empty" role="status" aria-live="polite">{error}</div></section> : null}

      <FriendsList
        friends={mergedFriends}
        onInvite={(f) => {
          setInviteTarget(f);
          setInviteOpen(true);
        }}
      />

      {!usingDemo ? (
        <FriendsList
          title="Available to play"
          emptyMessage={
            availableLoading
              ? 'Checking who is available…'
              : 'No friends are available right now (online, not in a match, no pending invite).'
          }
          friends={availableRows}
          onInvite={(f) => {
            setInviteTarget(f);
            setInviteOpen(true);
          }}
        />
      ) : null}

      {usingDemo ? (
        <section className="frd-crd">
          <div className="frd-empty">
            Showing demo friends because no Firebase friends are linked yet. Real-time Firebase sync stays active and will replace demo rows automatically when friend data exists.
          </div>
        </section>
      ) : null}

      {loading ? <section className="frd-crd"><div className="frd-empty" role="status" aria-live="polite">Syncing friends…</div></section> : null}

      <InviteModal
        open={inviteOpen}
        friend={inviteTarget}
        busy={inviteBusy}
        onClose={() => {
          if (inviteBusy) return;
          setInviteOpen(false);
          setInviteTarget(null);
        }}
        onSubmit={handleInviteSubmit}
      />
    </section>
  );
}