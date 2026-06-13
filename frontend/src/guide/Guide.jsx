import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ChevronRight,
  Rocket,
  Gamepad2,
  BookOpen,
  Trophy,
  UserPlus,
  Wallet,
  Joystick,
  Shield,
  Gift,
} from 'lucide-react';

import Layout from '../Components/Layout';
import Guideheader from './Guideheader';
import GuideOurGame from './GuideOurGame';
import GuideTipsSection from './GuideTipsSection';
import {
  navigateToCheckoutOrGate,
  useMergedPlayerProfile,
} from '../hooks/useBillingAccess.js';
import './guide.css';

const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const SectionHeader = ({ title, subtitle, accent = 'blue' }) => (
  <div className="guide-section__header">
    <div className={`guide-section__title-row guide-section__title-row--${accent}`}>
      <span className="guide-section__decor guide-section__decor--left" aria-hidden />
      <h2 className="guide-section__title">{title}</h2>
      <span className="guide-section__decor guide-section__decor--right" aria-hidden />
    </div>
    {subtitle && <p className="guide-section__subtitle">{subtitle}</p>}
  </div>
);

const quickNavItems = [
  {
    title: 'Getting Started',
    label: 'New to Skilz?',
    icon: Rocket,
    iconClass: 'guide-quick-nav__icon--purple',
    cardClass: 'guide-quick-nav__card--purple',
    target: 'getting-started',
  },
  {
    title: 'Our Games',
    label: 'Explore all games',
    icon: Gamepad2,
    iconClass: 'guide-quick-nav__icon--pink',
    cardClass: 'guide-quick-nav__card--pink',
    target: 'our-games',
  },
  {
    title: 'How to Play',
    label: 'Step-by-step guides',
    icon: BookOpen,
    iconClass: 'guide-quick-nav__icon--green',
    cardClass: 'guide-quick-nav__card--green',
    target: 'getting-started',
  },
  {
    title: 'Tips & Strategies',
    label: 'Win like a pro',
    icon: Trophy,
    iconClass: 'guide-quick-nav__icon--orange',
    cardClass: 'guide-quick-nav__card--orange',
    target: 'tips-strategies',
  },
];

const gettingStartedSteps = [
  {
    number: '01',
    title: 'Create Account',
    description:
      'Register your gaming identity with our secure signup process. Verify your email to unlock all features.',
    icon: UserPlus,
    colorClass: 'guide-step__icon-wrap--blue',
    stepClass: 'guide-step--blue',
    action: 'signup',
  },
  {
    number: '02',
    title: 'Add Coins',
    description:
      'Purchase coins to enter competitive matches. Choose a plan that fits your play style and budget.',
    icon: Wallet,
    colorClass: 'guide-step__icon-wrap--pink',
    stepClass: 'guide-step--pink',
    action: 'checkout',
  },
  {
    number: '03',
    title: 'Choose a Game',
    description:
      'Browse our collection of curated games including Trivia, Ludo, Math Rush, and Enigma Pulse.',
    icon: Joystick,
    colorClass: 'guide-step__icon-wrap--green',
    stepClass: 'guide-step--green',
    action: 'scroll-games',
  },
  {
    number: '04',
    title: 'Play & Win',
    description:
      'Join competitive matches, climb the leaderboard, earn XP, and unlock achievements along the way.',
    icon: Trophy,
    colorClass: 'guide-step__icon-wrap--orange',
    stepClass: 'guide-step--orange',
    action: 'dashboard',
  },
];

const commitmentCards = [
  {
    title: 'Fair Play Commitment',
    description:
      'We use advanced anti-cheat systems to ensure a fair and safe gaming environment for everyone.',
    icon: Shield,
    iconClass: 'guide-commitment-card__icon--shield',
    cardClass: 'guide-commitment-card--shield',
    tags: [
      { label: 'Anti-Cheat System', tagClass: 'guide-commitment-card__tag--blue' },
      { label: '100% Secure', tagClass: 'guide-commitment-card__tag--blue-light' },
      { label: 'Fair Matches', tagClass: 'guide-commitment-card__tag--purple' },
    ],
  },
  {
    title: 'Rewards & Achievements',
    description:
      'Win matches, complete challenges and earn badges, coins and exclusive rewards.',
    icon: Gift,
    iconClass: 'guide-commitment-card__icon--gift',
    cardClass: 'guide-commitment-card--gift',
    tags: [
      { label: 'Daily Bonuses', tagClass: 'guide-commitment-card__tag--orange' },
      { label: 'Achievements', tagClass: 'guide-commitment-card__tag--green' },
      { label: 'Leaderboards', tagClass: 'guide-commitment-card__tag--purple' },
    ],
  },
];

const GuideQuickNav = () => (
  <section className="guide-quick-nav">
    <div className="guide-container">
      <h2 className="guide-quick-nav__title">Quick Navigation</h2>
      <div className="guide-quick-nav__grid">
        {quickNavItems.map(({ title, label, icon: Icon, iconClass, cardClass, target }) => (
          <button
            key={title}
            type="button"
            className={`guide-quick-nav__card ${cardClass}`}
            onClick={() => scrollToSection(target)}
          >
            <div className={`guide-quick-nav__icon ${iconClass}`}>
              <Icon size={22} strokeWidth={2} />
            </div>
            <div className="guide-quick-nav__card-text">
              <span className="guide-quick-nav__card-title">{title}</span>
              <span className="guide-quick-nav__card-label">{label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  </section>
);

const GuideGettingStarted = ({ onStepAction }) => (
  <section className="guide-section" id="getting-started">
    <div className="guide-container">
      <SectionHeader
        title="Getting Started"
        subtitle="Follow these simple steps to begin your journey"
        accent="blue"
      />

      <div className="guide-steps">
        {gettingStartedSteps.map((step, index) => (
          <React.Fragment key={step.number}>
            <div
              className={`guide-step guide-step--clickable ${step.stepClass}`}
              role="button"
              tabIndex={0}
              onClick={() => onStepAction(step.action)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onStepAction(step.action);
                }
              }}
            >
              <div className="guide-step__number">{step.number}</div>
              <div className={`guide-step__icon-wrap ${step.colorClass}`}>
                <step.icon size={28} />
              </div>
              <h3 className="guide-step__title">{step.title}</h3>
              <p className="guide-step__desc">{step.description}</p>
            </div>
            {index < gettingStartedSteps.length - 1 && (
              <div className="guide-step__arrow" aria-hidden="true">
                <ChevronRight size={20} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  </section>
);

const GuideCommitment = () => (
  <section className="guide-section">
    <div className="guide-container">
      <div className="guide-commitment__grid">
        {commitmentCards.map(({ title, description, icon: Icon, iconClass, cardClass, tags }) => (
          <article key={title} className={`guide-commitment-card ${cardClass}`}>
            <div className={`guide-commitment-card__icon ${iconClass}`}>
              <Icon size={32} strokeWidth={1.75} />
            </div>
            <div className="guide-commitment-card__body">
              <h3 className="guide-commitment-card__title">{title}</h3>
              <p className="guide-commitment-card__desc">{description}</p>
              <div className="guide-commitment-card__tags">
                {tags.map(({ label, tagClass }) => (
                  <span key={label} className={`guide-commitment-card__tag ${tagClass}`}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);

const GuideCTA = ({ onPlayNow }) => (
  <section className="guide-cta">
    <div className="guide-container">
      <div className="guide-cta__banner">
        <div className="guide-cta__visual">
          <div className="guide-cta__visual-icon">
            <Trophy size={26} color="#fff" />
          </div>
          <img src="/dollar.png" alt="" className="guide-cta__visual-img" />
        </div>
        <div className="guide-cta__content">
          <h2 className="guide-cta__title">Ready to Start Your Journey?</h2>
          <p className="guide-cta__subtitle">
            Join thousands of players and become the next champion!
          </p>
        </div>
        <button type="button" className="guide-cta__btn" onClick={onPlayNow}>
          Play Now &rarr;
        </button>
      </div>
    </div>
  </section>
);

const Guide = () => {
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const mergedProfile = useMergedPlayerProfile();

  const handleStepAction = (action) => {
    switch (action) {
      case 'signup':
        navigate('/signup');
        break;
      case 'checkout':
        navigateToCheckoutOrGate(navigate, isAuthenticated, mergedProfile);
        break;
      case 'scroll-games':
        scrollToSection('our-games');
        break;
      case 'dashboard':
        if (isAuthenticated) {
          navigate('/player/dashboard');
        } else {
          navigate('/signin', { state: { redirectTo: '/player/dashboard' } });
        }
        break;
      default:
        break;
    }
  };

  const handlePlayNow = () => {
    if (isAuthenticated) {
      navigate('/player/dashboard');
    } else {
      navigate('/signin', { state: { redirectTo: '/player/dashboard' } });
    }
  };

  return (
    <Layout>
      <main className="guide-page">
        <Guideheader />
        <GuideQuickNav />
        <GuideGettingStarted onStepAction={handleStepAction} />
        <GuideOurGame />
        <GuideTipsSection />
        <GuideCommitment />
        <GuideCTA onPlayNow={handlePlayNow} />
      </main>
    </Layout>
  );
};

export default Guide;
