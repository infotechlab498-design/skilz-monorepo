import React, { useState } from 'react';

const GAMES = [
  { id: 'trivia', name: 'Trivia' },
  { id: 'mathrush', name: 'Math Rush' },
  { id: 'ludo', name: 'Ludo' },
  { id: 'enigma_pulse', name: 'EnigmaPulse' },
  { id: 'neurochain', name: 'NeuroChain' },
];

export default function InviteModal({ open, friend, busy, onClose, onSubmit }) {
  const [selected, setSelected] = useState(GAMES[0].id);
  if (!open || !friend) return null;

  const picked = GAMES.find((g) => g.id === selected) || GAMES[0];

  return (
    <div className="frd-mdOv" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="frd-md" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <h3 id="invite-title" className="frd-mdT">Invite {friend.name || 'player'}</h3>
        <p className="frd-mdP">Select a game and send a real-time invite.</p>
        <div className="frd-gSel">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`frd-gBtn ${selected === g.id ? 'is-on' : ''}`}
              onClick={() => setSelected(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className="frd-mdFt">
          <button type="button" className="frd-mBtn frd-mBtnGh" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="frd-mBtn"
            disabled={busy}
            onClick={() => onSubmit({ gameId: picked.id, gameName: picked.name })}
          >
            {busy ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

