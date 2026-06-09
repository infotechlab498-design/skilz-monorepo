import React from 'react';

// Simple player card used in the Available players slider.
// Props:
// - player: { uid, profile, presence }
// - onInvite(player): callback when user clicks Play/Invite
export default function PlayerCard({ player, onInvite }) {
  const profile = player.profile || {};
  const meta = (player.presence && player.presence.meta) || {};
  const status = (player.presence && player.presence.status) || 'offline';

  const avatar = profile.avatar || meta.avatar || '/vite.svg';
  const displayName = profile.displayName || meta.displayName || player.uid;
  const xp = profile.xp ?? meta.xp ?? 0;
  const level = profile.level ?? meta.level ?? 1;

  return (
    <div className={`player-card ${status}`} style={{display: 'flex',alignItems:'center',gap:12,padding:12,background:'#16202a',borderRadius:8}}>
      <img src={avatar} alt={displayName} style={{width:48,height:48,borderRadius:999}} />
      <div style={{flex:1}}>
        <div style={{fontWeight:600}}>{displayName}</div>
        <div style={{fontSize:12,opacity:0.8}}>XP: {xp} · Lv {level}</div>
      </div>
      <div>
        <button onClick={() => onInvite && onInvite(player)} style={{padding:'8px 12px',borderRadius:6,background:'#1da1f2',color:'#fff',border:'none'}}>Play</button>
      </div>
    </div>
  );
}
