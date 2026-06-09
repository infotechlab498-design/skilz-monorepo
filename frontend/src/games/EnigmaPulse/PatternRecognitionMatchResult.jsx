import React, { useMemo } from 'react';

import sequenceIqResultBg from '../../assets/sequenceIqResultBg.png';
import { formatMatchCoins, formatMatchXp, mapProgressionFields } from './enigmaRewardDisplay.js';
import './PatternRecognitionMatchResult.css';

const SEQUENCE_IQ_SUBLINE_DRAW = 'Evenly matched. Well played.';
const SEQUENCE_IQ_SUBLINE_WIN = 'Sharp pattern sense!';
const SEQUENCE_IQ_SUBLINE_LOSS = 'Keep cracking sequences.';

const END_REASON_COPY = {
  completed: '',
  disconnect_forfeit: 'Match ended by disconnect.',
  returned_lobby_prestart: 'Returned to lobby before the match started. No rewards applied.',
  leave_forfeit: 'Match ended by forfeit.',
};

function shortUid(uid) {
  const s = String(uid || '');
  if (!s) return 'Player';
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…`;
}

function buildRows({ result, roomSnapshot, gameUser }) {
  const myUid = String(gameUser?.uid || '');
  const players = Array.isArray(result?.players) ? result.players : [];
  const roomPlayers = Array.isArray(roomSnapshot?.players) ? roomSnapshot.players : [];
  const progression = Array.isArray(result?.progression) ? result.progression : [];

  return players.map((p) => {
    const uid = String(p?.uid || '');
    const roomP = roomPlayers.find((rp) => String(rp?.uid || '') === uid) || {};
    const prog = mapProgressionFields(progression.find((x) => String(x?.uid || '') === uid));
    const isMe = uid && uid === myUid;
    const isBot = Boolean(roomP.isBot);
    let label = isMe ? 'You' : isBot ? 'Bot' : String(roomP.displayName || '').trim() || shortUid(uid);
    return {
      uid,
      label,
      isMe,
      isBot,
      photoURL: String(roomP.photoURL || '').trim(),
      score: Number(p?.score || 0),
      coinsEarned: Number(p?.coinsEarned || 0),
      ...prog,
    };
  });
}

function CrownIcon() {
  return (
    <svg className="sq-crown" width="22" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M5 16h14v2H5v-2zm1.5-7.5L12 4l5.5 4.5L22 8l-2 7H4l-2-7 4.5-.5zM12 6.5L9.5 11h5L12 6.5z"
      />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg className="sq-stat-icon sq-stat-icon--coin" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text
        x="12"
        y="13.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="currentColor"
        dominantBaseline="middle"
      >
        $
      </text>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="sq-stat-icon sq-stat-icon--xp" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 1.5l2.8 6.9 7.4.6-5.6 4.7 1.8 7.3L12 17.9l-6.4 4.1 1.8-7.3-5.6-4.7 7.4-.6L12 1.5z"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="sq-stat-icon sq-stat-icon--rank" width="18" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 4h10v2h3v3c0 2.2-1.6 4-3.7 4.3-.6 2.4-2.5 4.3-4.8 4.8V18h3v2H8v-2h3v-2c-2.4-.5-4.3-2.4-4.8-4.8C4 13 2 11 2 9V6h3V4zm2 2v2h6V6H9zM4 8v1c0 1.1.9 2 2 2h.2C5.7 9.7 5 8.4 5 8H4zm16 0h-1c0 .4-.7 1.7-1.2 3H19c1.1 0 2-.9 2-2V8z"
      />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg className="sq-bot-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a2 2 0 012 2v1h4a2 2 0 012 2v3h2v8h-4v3a2 2 0 01-2 2H8a2 2 0 01-2-2v-3H2V10h2V7a2 2 0 012-2h4V4a2 2 0 012-2zm-6 9v6h12v-6H6zm3 2h2v2H9v-2zm4 0h2v2h-2v-2z"
      />
    </svg>
  );
}

/**
 * Sequence IQ (Pattern Recognition) match end — themed result screen.
 *
 * @param {{ uid: string, displayName?: string, photoURL?: string }} gameUser
 * @param {object} result — MATCH_END payload
 * @param {object} [roomSnapshot]
 * @param {Array} [recentResults]
 * @param {() => void} onBackToLobby
 */
export default function PatternRecognitionMatchResult({ gameUser, result, roomSnapshot = null, recentResults = [], onBackToLobby }) {
  const myUid = String(gameUser?.uid || '');
  const winnerUid = String(result?.winnerUid || '');
  const isDraw = winnerUid === 'draw';
  const iWon = !isDraw && winnerUid === myUid;

  const rows = useMemo(() => buildRows({ result, roomSnapshot, gameUser }), [result, roomSnapshot, gameUser]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (a.isMe) return -1;
      if (b.isMe) return 1;
      return 0;
    });
    return copy;
  }, [rows]);

  const endReason = String(result?.endReason || 'completed');
  const endNote = END_REASON_COPY[endReason] ?? (endReason !== 'completed' ? `End: ${endReason}` : '');

  const headline = isDraw ? 'Draw' : iWon ? 'You won' : 'You lost';
  const subline = isDraw ? SEQUENCE_IQ_SUBLINE_DRAW : iWon ? SEQUENCE_IQ_SUBLINE_WIN : SEQUENCE_IQ_SUBLINE_LOSS;

  const headlineMod = isDraw ? 'draw' : iWon ? 'win' : 'loss';

  return (
    <div className="sq-result">
      <div
        className="sq-result-panel"
        style={{
          '--sq-bg-url': `url(${sequenceIqResultBg})`,
        }}
      >
        <div className="sq-result-decor sq-result-decor--stars" aria-hidden />
        <div className="sq-result-decor sq-result-decor--confetti" aria-hidden />

        <div className="sq-result-scroll">
          <div className="sq-result-inner">
            <header className="sq-hero">
              <div className="sq-hero-ribbons" aria-hidden />
              <div className="sq-hero-sparkles" aria-hidden />

              <div className="sq-brand">
                <CrownIcon />
                <span className="sq-brand-text">SEQUENCE IQ</span>
              </div>

              <h1 className={`sq-headline sq-headline--${headlineMod}`}>{headline}</h1>

              <div className="sq-subline-row">
                <span className="sq-subline-line sq-subline-line--l" aria-hidden />
                <span className="sq-subline-ornament" aria-hidden>
                  ✦
                </span>
                <p className="sq-subline-text">{subline}</p>
                <span className="sq-subline-ornament" aria-hidden>
                  ✦
                </span>
                <span className="sq-subline-line sq-subline-line--r" aria-hidden />
              </div>

              <div className="sq-gold-rule" role="presentation" />

              {endNote ? (
                <p className="sq-end-note" role="status">
                  {endNote}
                </p>
              ) : null}
            </header>

            <section className="sq-cards" aria-label="Match results">
            {sortedRows.map((row) => {
              const isWinner = !isDraw && winnerUid === row.uid;
              const cardTone = row.isMe ? 'me' : row.isBot ? 'bot' : 'opp';

              return (
                <article
                  key={row.uid || row.label}
                  className={`sq-card sq-card--${cardTone} ${isWinner ? 'sq-card--winner' : ''}`}
                >
                  <div className="sq-card-top">
                    <div className="sq-card-identity">
                      <div className={`sq-avatar-ring sq-avatar-ring--${cardTone}`}>
                        {row.photoURL && !row.isBot ? (
                          <img className="sq-avatar-img" src={row.photoURL} alt="" width={48} height={48} />
                        ) : row.isBot ? (
                          <span className="sq-avatar-fallback sq-avatar-fallback--bot">
                            <BotIcon />
                          </span>
                        ) : (
                          <span className="sq-avatar-fallback">{row.label.slice(0, 1).toUpperCase()}</span>
                        )}
                        {row.isMe ? (
                          <span className="sq-mini-crown" aria-hidden>
                            <CrownIcon />
                          </span>
                        ) : null}
                      </div>
                      <div className="sq-card-names">
                        <span className="sq-player-name">{row.label}</span>
                        <span className="sq-player-score">Score {row.score}</span>
                      </div>
                    </div>

                    <div className={`sq-medal ${row.isBot ? 'sq-medal--muted' : ''}`} aria-hidden>
                      <div className="sq-medal-disc">
                        <span className="sq-medal-star">★</span>
                      </div>
                      <span className="sq-medal-ribbon">{row.isBot ? '—' : row.rank !== '—' ? row.rank : '—'}</span>
                    </div>
                  </div>

                  <div className={`sq-stats ${row.isBot ? 'sq-stats--muted' : ''}`}>
                    <div className="sq-stat">
                      <CoinIcon />
                      <span className="sq-stat-label">Match coins</span>
                      <span className="sq-stat-value sq-stat-value--coins">{formatMatchCoins(row)}</span>
                    </div>
                    <div className="sq-stat">
                      <StarIcon />
                      <span className="sq-stat-label">XP</span>
                      <span className="sq-stat-value sq-stat-value--xp">{formatMatchXp(row)}</span>
                    </div>
                    <div className="sq-stat">
                      <TrophyIcon />
                      <span className="sq-stat-label">Rank</span>
                      <span className="sq-stat-value sq-stat-value--rank">{row.isBot ? '—' : row.rank}</span>
                    </div>
                  </div>

                  <p className="sq-round-line">
                    <span className="sq-round-emoji" aria-hidden>
                      🪙
                    </span>
                    Round coins (from answers): <strong>{row.coinsEarned}</strong>
                  </p>
                  {!row.isBot && row.performanceBreakdown?.length > 0 ? (
                    <ul className="sq-perf-list" aria-label="Performance bonuses">
                      {row.performanceBreakdown.map((b) => (
                        <li key={b.id} className="sq-perf-chip">
                          {b.label}
                          {Number(b.coins || 0) > 0 ? ` +${b.coins} coins` : ''}
                          {Number(b.xp || 0) > 0 ? ` +${b.xp} XP` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
            </section>

            {recentResults.length > 0 ? (
              <section className="sq-recent" aria-label="Recent Sequence IQ matches">
              <h2 className="sq-recent-title">Recent Sequence IQ matches</h2>
              <ul className="sq-recent-list">
                {recentResults.map((item) => {
                  const w = String(item?.winnerUid || '');
                  const outcome =
                    w === myUid ? 'win' : w === 'draw' ? 'draw' : 'loss';
                  const label = outcome === 'win' ? 'Win' : outcome === 'draw' ? 'Draw' : 'Loss';
                  return (
                    <li key={item.roomId} className="sq-recent-row">
                      <span className={`sq-dot sq-dot--${outcome}`} aria-hidden />
                      <span className="sq-recent-text">
                        {label} | Score {Number(item.myScore ?? 0)}-{Number(item.opponentScore ?? 0)} | XP +{Number(item.xpGained ?? 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              </section>
            ) : null}

            <button type="button" className="sq-cta" onClick={onBackToLobby}>
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
