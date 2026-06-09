import React from 'react';
import StatusBadge from './StatusBadge.jsx';

function formatDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export default function FriendRow({ friend, onInvite }) {
  const online = !!friend?.presence?.online;
  const activity = online
    ? friend?.presence?.status === 'in-game'
      ? 'In game'
      : 'Free'
    : 'Offline';

  const gameName = friend?.presence?.game && friend?.presence?.game !== 'lobby'
    ? friend.presence.game
    : 'none';

  return (
    <tr>
      <td>
        <div className="frd-ply">
          <div className="frd-av">
            {friend.avatar ? <img src={friend.avatar} alt="" /> : null}
          </div>
          <div>
            <h3 className="frd-nm">{friend.name || 'Unknown Player'}</h3>
            <p className="frd-em">{friend.email || '—'}</p>
          </div>
        </div>
      </td>
      <td>
        <p className="frd-act">{activity}</p>
        <p className="frd-gm">{gameName}</p>
      </td>
      <td>
        <StatusBadge online={online} />
      </td>
      <td>{formatDate(friend?.presence?.lastSeen || friend?.lastSeen)}</td>
      <td>{friend?.inviteStatus || 'none'}</td>
      <td>
        <button
          type="button"
          className="frd-actBtn"
          onClick={() => onInvite(friend)}
          disabled={!friend?.uid}
        >
          Join
        </button>
      </td>
    </tr>
  );
}

