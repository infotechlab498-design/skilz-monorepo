import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gamepad2, Trophy, BookOpen, Users, ShieldCheck } from 'lucide-react';

const stats = [
  { label: '4+ Exciting Games', icon: Gamepad2, colorClass: 'guide-hero__stat-icon--blue' },
  { label: '100K+ Active Players', icon: Users, colorClass: 'guide-hero__stat-icon--pink' },
  { label: '24/7 Fair Play', icon: ShieldCheck, colorClass: 'guide-hero__stat-icon--green' },
];

const Guideheader = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);

  return (
    <header className="guide-hero">
      <div className="guide-container">
        <nav className="guide-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          {pathSegments.map((segment, index) => (
            <React.Fragment key={segment}>
              <span>/</span>
              <span>
                {index === pathSegments.length - 1
                  ? segment.charAt(0).toUpperCase() + segment.slice(1)
                  : segment}
              </span>
            </React.Fragment>
          ))}
        </nav>

        <div className="guide-hero__grid">
          <div className="guide-hero__content">
            <span className="guide-hero__eyebrow">Guide Center</span>
            <h1 className="guide-hero__title">
              Your Ultimate{' '}
              <span className="guide-hero__title-accent">Gaming Guide</span>
            </h1>
            <p className="guide-hero__subtitle">
              Everything you need to know to get started, master our games, and
              dominate the leaderboard.
            </p>

            <div className="guide-hero__stats">
              {stats.map(({ label, icon: Icon, colorClass }) => (
                <div key={label} className="guide-hero__stat">
                  <div className={`guide-hero__stat-icon ${colorClass}`}>
                    <Icon size={18} />
                  </div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="guide-hero__visual" aria-hidden="true">
            <div className="guide-hero__glow" />
            <img
              src="/triviaGame.png"
              alt=""
              className="guide-hero__asset guide-hero__asset--main guide-hero__asset--pos3"
            />
            <img
              src="/ludogame.png"
              alt=""
              className="guide-hero__asset guide-hero__asset--secondary guide-hero__asset--pos1"
            />
            <img
              src="/enigmaPulse.png"
              alt=""
              className="guide-hero__asset guide-hero__asset--tertiary guide-hero__asset--pos2"
            />
            <div className="guide-hero__icon-float guide-hero__icon-float--trophy">
              <Trophy size={26} />
            </div>
            <div className="guide-hero__icon-float guide-hero__icon-float--book">
              <BookOpen size={22} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Guideheader;
