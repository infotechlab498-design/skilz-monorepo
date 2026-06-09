import React from 'react';

const GAMES = [
  { id: 'all', label: 'All Games', dot: 'is-red' },
  { id: 'ludo', label: 'Ludo', dot: 'is-gray' },
  { id: 'mathQuiz', label: 'Math Quiz', dot: 'is-gray' },
  { id: 'trivia', label: 'Trivia', dot: 'is-gray' },
];

export default function GameSelector({ selectedGame, onChange }) {
  return (
    <div className="lbd-games">
      {GAMES.map((g) => (
        <button
          key={g.id}
          type="button"
          className={`lbd-gBtn ${selectedGame === g.id ? 'is-on' : ''}`}
          onClick={() => onChange(g.id)}
        >
          <span className={`lbd-gDot ${g.dot}`} aria-hidden="true" />
          {g.label}
        </button>
      ))}
    </div>
  );
}

