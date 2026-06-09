import React from 'react';
import { Gamepad2, BookOpen, Target, Coins } from 'lucide-react';

const tips = [
  {
    title: 'Practice Regularly',
    description:
      'Consistency is key. Play daily matches to sharpen your skills and climb the leaderboards faster.',
    icon: Gamepad2,
    iconClass: 'guide-tip-card__icon--controller',
  },
  {
    title: 'Learn the Rules',
    description:
      'Each game has unique mechanics. Understand the rules before jumping into ranked matches.',
    icon: BookOpen,
    iconClass: 'guide-tip-card__icon--book',
  },
  {
    title: 'Stay Focused',
    description:
      'Competitive gaming demands concentration. Minimize distractions — every second counts.',
    icon: Target,
    iconClass: 'guide-tip-card__icon--target',
  },
  {
    title: 'Manage Coins Wisely',
    description:
      'Plan your coin spending strategically. Take advantage of daily bonuses and avoid unnecessary risks.',
    icon: Coins,
    iconClass: 'guide-tip-card__icon--coins',
  },
];

const GuideTipsSection = () => {
  return (
    <section className="guide-section" id="tips-strategies">
      <div className="guide-container">
        <div className="guide-section__header">
          <div className="guide-section__title-row guide-section__title-row--purple">
            <span className="guide-section__decor guide-section__decor--left" aria-hidden />
            <h2 className="guide-section__title">Tips &amp; Strategies</h2>
            <span className="guide-section__decor guide-section__decor--right" aria-hidden />
          </div>
          <p className="guide-section__subtitle">
            Become a champion with these expert tips
          </p>
        </div>

        <div className="guide-tips__grid">
          {tips.map(({ title, description, icon: Icon, iconClass }) => (
            <article key={title} className="guide-tip-card">
              <div className={`guide-tip-card__icon ${iconClass}`}>
                <Icon size={22} />
              </div>
              <div>
                <h3 className="guide-tip-card__title">{title}</h3>
                <p className="guide-tip-card__desc">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GuideTipsSection;
