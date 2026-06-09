import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Settings, Volume2 } from 'lucide-react';

export default function EnigmaPulseBottom({ onStartGame, isSearching, disabled }) {
  const navigate = useNavigate();

  return (
    <div className="ep-mobile-actions">
      <button
        type="button"
        className="ep-mobile-start-btn"
        onClick={onStartGame}
        disabled={disabled || isSearching}
      >
        <span className="ep-mobile-start-btn__icon" aria-hidden>
          <Play size={18} fill="currentColor" strokeWidth={0} />
        </span>
        <span className="ep-mobile-start-btn__text">
          {isSearching ? 'Searching…' : 'START GAME'}
        </span>
      </button>
      <div className="ep-mobile-actions__icons" aria-label="Sound and settings">
        <button type="button" className="ep-mobile-icon-btn" aria-label="Volume">
          <Volume2 size={20} />
        </button>
        <button
          type="button"
          className="ep-mobile-icon-btn"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
