import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';

function deriveLevelFromXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return Math.max(1, 1 + Math.floor(x / 1000));
}

export default function EnigmaPulseMobileProfile({ gameUser }) {
  const authUser = useSelector((state) => state.auth?.user);
  const userSlice = useSelector((state) => state.user);

  const { level, xpPct, avatarSrc } = useMemo(() => {
    const profile = userSlice?.profile || {};
    const xp = Number(userSlice?.xp ?? profile.xp ?? gameUser?.xp ?? 0);
    const level = Number(userSlice?.level ?? profile.level ?? deriveLevelFromXp(xp));
    const xpInLevel = xp % 1000;
    const xpPct = Math.max(0, Math.min(100, Math.round((xpInLevel / 1000) * 100)));

    const avatarSrc =
      profile.avatar ||
      profile.photoURL ||
      gameUser?.photoURL ||
      authUser?.photoURL ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${gameUser?.uid || authUser?.uid || 'player'}`;

    return { level, xpPct, avatarSrc };
  }, [authUser, gameUser, userSlice]);

  if (!gameUser) return null;

  return (
    <div className="ep-mobile-profile-card">
      <div className="ep-mobile-profile-card__avatar-wrap">
        <img
          className="ep-mobile-profile-card__avatar"
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
        />
        <span className="ep-mobile-profile-card__status" aria-hidden />
      </div>
      <div className="ep-mobile-profile-card__body">
        <p className="ep-mobile-profile-card__name">YOU</p>
        <div className="ep-mobile-profile-card__level-row">
          <p className="ep-mobile-profile-card__level">Level {level}</p>
          <span className="ep-mobile-profile-card__pct">{xpPct}%</span>
        </div>
        <div className="ep-mobile-profile-card__bar" aria-hidden>
          <div className="ep-mobile-profile-card__bar-fill" style={{ width: `${xpPct}%` }} />
        </div>
      </div>
    </div>
  );
}
