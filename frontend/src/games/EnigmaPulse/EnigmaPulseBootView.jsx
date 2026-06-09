import React from 'react';
import { ENIGMA_BOOT_MESSAGES, SEQUENCE_IQ_BOOT_MESSAGES } from './enigmaSessionPhases.js';
import './PatternRecognitionStartup.css';

/**
 * Unified EnigmaPulse boot / matchmaking shell.
 * @param {{
 *   variant?: 'sequence' | 'generic' | 'word_cipher';
 *   phase?: string;
 *   title?: string;
 *   headline?: string;
 *   message?: string;
 *   subtitle?: string;
 *   tip?: string;
 *   tipFade?: boolean;
 *   statusOverride?: string;
 *   room?: { players?: Array<{ uid?: string; displayName?: string; isBot?: boolean }> } | null;
 * }} props
 */
export default function EnigmaPulseBootView({
  variant = 'generic',
  phase = 'connecting',
  title = 'EnigmaPulse',
  headline = 'Loading',
  message,
  subtitle,
  tip,
  tipFade = false,
  statusOverride,
  room = null,
}) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const phaseMessages = variant === 'sequence' ? SEQUENCE_IQ_BOOT_MESSAGES : ENIGMA_BOOT_MESSAGES;
  const primary =
    statusOverride ||
    message ||
    phaseMessages[phase] ||
    phaseMessages.connecting;

  if (variant === 'word_cipher' || (variant === 'generic' && phase === 'preparing')) {
    return (
      <div className="ep-room-loading ep-room-loading--cipher" aria-busy="true" aria-live="polite">
        <p className="ep-room-loading__title">{headline || primary}</p>
        {subtitle ? <p className="ep-room-loading__sub">{subtitle}</p> : null}
        {!subtitle && primary !== headline ? <p className="ep-room-loading__sub">{primary}</p> : null}
        <div className="ep-room-loading__dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (variant === 'generic') {
    return (
      <div className="ep-room-loading" aria-busy="true" aria-live="polite">
        <p className="ep-room-loading__title">{headline}</p>
        <p className="ep-room-loading__sub">{primary}</p>
        {subtitle ? <p className="ep-room-loading__sub">{subtitle}</p> : null}
        <div className="ep-room-loading__dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className="pr-boot" aria-busy="true" aria-live="polite">
      <div className="pr-boot__bg" aria-hidden />
      <div className="pr-boot__grid" aria-hidden />
      <div className="pr-boot__content">
        <p className="pr-boot__title">{title}</p>
        <h1 className="pr-boot__headline">{headline}</h1>
        <p className={`pr-boot__msg ${tipFade ? 'pr-boot__msg--fade' : ''}`}>{primary}</p>
        <div className="pr-seq" aria-hidden>
          <div className="pr-seq__box">?</div>
          <div className="pr-seq__box">?</div>
          <div className="pr-seq__box">?</div>
        </div>
        {tip ? <p className="pr-boot__tip">{tip}</p> : null}
        {players.length > 0 ? (
          <div className="pr-boot__players">
            {players.map((p) => (
              <span key={p.uid} className="pr-boot__chip">
                {p.displayName || p.uid?.slice(0, 8) || 'Player'}
                {p.isBot ? ' · Bot' : ''}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Import EnigmaPulseBootView — kept for joining route compatibility. */
export function SequenceIqBootView(props) {
  return <EnigmaPulseBootView variant="sequence" title="Sequence IQ" {...props} />;
}
