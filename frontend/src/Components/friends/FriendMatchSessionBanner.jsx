import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config.js';

/**
 * Shows Firestore friend-challenge match session when `?matchId=` is present (read-only).
 */
export default function FriendMatchSessionBanner({ matchId }) {
  const mid = String(matchId || '').trim();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!mid) {
      setData(null);
      setMissing(false);
      return () => {};
    }
    const ref = doc(db, 'matches', mid);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setData(null);
          setMissing(true);
          return;
        }
        setMissing(false);
        setData(snap.data());
      },
      () => {
        setData(null);
        setMissing(true);
      }
    );
  }, [mid]);

  if (!mid) return null;

  const status = data?.status ?? (missing ? 'unknown' : '…');
  const gameLabel = data?.gameName || data?.gameId || 'Game';

  return (
    <div className="frd-matchBanner" role="status">
      <strong className="frd-matchBanner-title">Friend match</strong>
      <span className="frd-matchBanner-meta">
        Session <code className="frd-matchBanner-code">{mid}</code>
        {' · '}
        {gameLabel}
        {' · '}
        <span className="frd-matchBanner-st">{status}</span>
      </span>
      {missing ? (
        <span className="frd-matchBanner-warn"> Could not load session (check sign-in).</span>
      ) : null}
    </div>
  );
}
