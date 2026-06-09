import React from 'react';

export default function GameCTAButtons({ onNavigate }) {
  return (
    <div className="lbd-cta">
      <h3>Ready for Battle?</h3>
      <p>Challenge players in your favorite mode and climb the leaderboard.</p>
      <div className="lbd-ctaBtns">
        <button type="button" onClick={() => onNavigate('ludo')}>Play Ludo 1v1</button>
        <button type="button" onClick={() => onNavigate('mathQuiz')}>Math Quiz Duel</button>
        <button type="button" onClick={() => onNavigate('trivia')}>Trivia Challenge</button>
      </div>
    </div>
  );
}

