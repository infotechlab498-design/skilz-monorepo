import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { GAME_KEYS } from '../../../shared/gameConfig/constants.js';
import { useGameConfig } from '../hooks/useGameConfig.js';

const GAME_KEY_BY_ID = {
  ludo: GAME_KEYS.LUDO,
  trivia: GAME_KEYS.TRIVIA,
  math: GAME_KEYS.MATH_RUSH,
  enigmaPulse: GAME_KEYS.ENIGMA_PULSE,
};

const games = [
  {
    id: 'ludo',
    title: 'LUDO',
    description:
      'Classic board game reimagined for competitive online play. Roll the dice, strategize your moves, and race to victory.',
    image: '/ludogame.png',
    features: ['2-4 Players', 'Classic Rules', 'Real-time Multiplayer'],
    btnClass: 'guide-game-card__btn--blue',
    themeClass: 'guide-game-card--blue',
    lobbyRoute: '/ludoLobby',
  },
  {
    id: 'trivia',
    title: 'TRIVIA',
    description:
      'Test your knowledge across categories and compete against players worldwide in fast-paced trivia battles.',
    image: '/triviaGame.png',
    features: ['Multiplayer', 'Multiple Categories', 'Timed Rounds'],
    btnClass: 'guide-game-card__btn--pink',
    themeClass: 'guide-game-card--pink',
    lobbyRoute: '/triviaLobby/trivia',
  },
  {
    id: 'math',
    title: 'MATHRUSH',
    description:
      'Speed through math challenges and prove your numerical prowess. The faster you solve, the more you earn.',
    image: '/mathRush.png',
    features: ['Speed Math', 'Difficulty Levels', 'XP Rewards'],
    btnClass: 'guide-game-card__btn--green',
    themeClass: 'guide-game-card--green',
    lobbyRoute: '/mathRushLobby',
  },
  {
    id: 'enigmaPulse',
    title: 'ENIGMAPULSE',
    description:
      'Challenge your brain with logic puzzles, pattern recognition, and syllogism challenges in this cognitive arena.',
    image: '/enigmaPulse.png',
    features: ['Logic Puzzles', 'Pattern IQ', 'Brain Training'],
    btnClass: 'guide-game-card__btn--purple',
    themeClass: 'guide-game-card--purple',
    lobbyRoute: '/enigmaPulseLobby',
  },
];

const GuideOurGame = () => {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const { getEntryFeeForGame, loading } = useGameConfig();

  const gamesWithFees = useMemo(
    () =>
      games.map((game) => {
        const configKey = GAME_KEY_BY_ID[game.id];
        const fee = configKey ? getEntryFeeForGame(configKey) : null;
        const features =
          fee != null && !loading
            ? [...game.features, `${fee} coins to play`]
            : game.features;
        return { ...game, features };
      }),
    [getEntryFeeForGame, loading]
  );

  const handlePlay = (game) => {
    if (isAuthenticated) {
      navigate(game.lobbyRoute);
      return;
    }
    alert('Please login to play!');
    navigate('/signin', { state: { redirectTo: game.lobbyRoute } });
  };

  return (
    <section className="guide-section" id="our-games">
      <div className="guide-container">
        <div className="guide-section__header">
          <div className="guide-section__title-row guide-section__title-row--pink">
            <span className="guide-section__decor guide-section__decor--left" aria-hidden />
            <h2 className="guide-section__title">Our Games</h2>
            <span className="guide-section__decor guide-section__decor--right" aria-hidden />
          </div>
          <p className="guide-section__subtitle">
            Four unique games. Endless fun.
          </p>
        </div>

        <div className="guide-games__grid">
          {gamesWithFees.map((game) => (
            <article key={game.id} className={`guide-game-card ${game.themeClass}`}>
              <div className="guide-game-card__image">
                <img src={game.image} alt={game.title} />
              </div>
              <div className="guide-game-card__body">
                <h3 className="guide-game-card__title">{game.title}</h3>
                <p className="guide-game-card__desc">{game.description}</p>
                <ul className="guide-game-card__features">
                  {game.features.map((feature) => (
                    <li key={feature}>
                      <span>+</span> {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`guide-game-card__btn ${game.btnClass}`}
                  onClick={() => handlePlay(game)}
                >
                  How to Play
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GuideOurGame;
