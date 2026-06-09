import React, { useMemo } from 'react';
import { formatMatchCoins, formatMatchXp, mapProgressionFields } from './enigmaRewardDisplay.js';
import './WordCipherResult.css';

const SUBLINE_DRAW = 'Even match. Both minds aligned.';
const SUBLINE_WIN = 'Cipher cracked — sharp decode!';
const SUBLINE_LOSS = 'Keep decoding — the next term is yours.';

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
    const label = isMe ? 'You' : isBot ? 'Bot' : String(roomP.displayName || '').trim() || shortUid(uid);
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

function LockIcon() {
  return (
    <svg className="wc-lock" width="20" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18 8h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-3 0H9V6a3 3 0 016 0v2z"
      />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg className="wc-stat-icon wc-stat-icon--coin" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text x="12" y="13.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" dominantBaseline="middle">
        $
      </text>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="wc-stat-icon wc-stat-icon--xp" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 1.5l2.8 6.9 7.4.6-5.6 4.7 1.8 7.3L12 17.9l-6.4 4.1 1.8-7.3-5.6-4.7 7.4-.6L12 1.5z"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="wc-stat-icon wc-stat-icon--rank" width="18" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 4h10v2h3v3c0 2.2-1.6 4-3.7 4.3-.6 2.4-2.5 4.3-4.8 4.8V18h3v2H8v-2h3v-2c-2.4-.5-4.3-2.4-4.8-4.8C4 13 2 11 2 9V6h3V4zm2 2v2h6V6H9zM4 8v1c0 1.1.9 2 2 2h.2C5.7 9.7 5 8.4 5 8H4zm16 0h-1c0 .4-.7 1.7-1.2 3H19c1.1 0 2-.9 2-2V8z"
      />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg className="wc-bot-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a2 2 0 012 2v1h4a2 2 0 012 2v3h2v8h-4v3a2 2 0 01-2 2H8a2 2 0 01-2-2v-3H2V10h2V7a2 2 0 012-2h4V4a2 2 0 012-2zm-6 9v6h12v-6H6zm3 2h2v2H9v-2zm4 0h2v2h-2v-2z"
      />
    </svg>
  );
}

/**
 * Word Cipher match end — themed result screen.
 *
 * @param {{ uid: string, displayName?: string, photoURL?: string }} gameUser
 * @param {object} result — MATCH_END payload
 * @param {object} [roomSnapshot]
 * @param {Array} [recentResults]
 * @param {() => void} onBackToLobby
 */
export default function WordCipherResult({
  gameUser,
  result,
  roomSnapshot = null,
  recentResults = [],
  onBackToLobby,
}) {
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
  const suppressRewards = endReason === 'returned_lobby_prestart';

  const headline = isDraw ? 'Draw' : iWon ? 'You won' : 'You lost';
  const subline = isDraw ? SUBLINE_DRAW : iWon ? SUBLINE_WIN : SUBLINE_LOSS;
  const headlineMod = isDraw ? 'draw' : iWon ? 'win' : 'loss';

  const category = String(roomSnapshot?.category || roomSnapshot?.question?.category || '').trim();
  const difficulty = String(roomSnapshot?.difficulty || '').trim();
  const showContext = Boolean(category || difficulty);

  return (
    <div className="wc-result">
      <div className="wc-result-panel">
        <div className="wc-result-decor wc-result-decor--rings" aria-hidden />
        <div className="wc-result-decor wc-result-decor--glow" aria-hidden />

        <div className="wc-result-scroll">
          <div className="wc-result-inner">
            <header className="wc-hero">
              <div className="wc-brand">
                <LockIcon />
                <span className="wc-brand-text">WORD CIPHER</span>
              </div>

              <h1 className={`wc-headline wc-headline--${headlineMod}`}>{headline}</h1>

              <div className="wc-subline-row">
                <span className="wc-subline-line wc-subline-line--l" aria-hidden />
                <span className="wc-subline-ornament" aria-hidden>
                  ✦
                </span>
                <p className="wc-subline-text">{subline}</p>
                <span className="wc-subline-ornament" aria-hidden>
                  ✦
                </span>
                <span className="wc-subline-line wc-subline-line--r" aria-hidden />
              </div>

              <div className="wc-gold-rule" role="presentation" />

              {showContext ? (
                <div className="wc-context-chips">
                  {category ? <span className="wc-chip">{category}</span> : null}
                  {difficulty ? <span className="wc-chip wc-chip--diff">{difficulty}</span> : null}
                </div>
              ) : null}

              {endNote ? (
                <p className="wc-end-note" role="status">
                  {endNote}
                </p>
              ) : null}
            </header>

            <section className="wc-cards" aria-label="Match results">
              {sortedRows.map((row) => {
                const isWinner = !isDraw && winnerUid === row.uid;
                const cardTone = row.isMe ? 'me' : row.isBot ? 'bot' : 'opp';

                return (
                  <article
                    key={row.uid || row.label}
                    className={`wc-card wc-card--${cardTone} ${isWinner ? 'wc-card--winner' : ''}`}
                  >
                    <div className="wc-card-top">
                      <div className="wc-card-identity">
                        <div className={`wc-avatar-ring wc-avatar-ring--${cardTone}`}>
                          {row.photoURL && !row.isBot ? (
                            <img className="wc-avatar-img" src={row.photoURL} alt="" width={48} height={48} />
                          ) : row.isBot ? (
                            <span className="wc-avatar-fallback wc-avatar-fallback--bot">
                              <BotIcon />
                            </span>
                          ) : (
                            <span className="wc-avatar-fallback">{row.label.slice(0, 1).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="wc-card-names">
                          <span className="wc-player-name">{row.label}</span>
                          <span className="wc-player-score">Score {row.score}</span>
                        </div>
                      </div>

                      {isWinner ? (
                        <span className="wc-winner-badge" aria-label="Winner">
                          Winner
                        </span>
                      ) : null}
                    </div>

                    <div className={`wc-stats ${row.isBot || suppressRewards ? 'wc-stats--muted' : ''}`}>
                      <div className="wc-stat">
                        <CoinIcon />
                        <span className="wc-stat-label">Match coins</span>
                        <span className="wc-stat-value wc-stat-value--coins">
                          {row.isBot || suppressRewards ? '—' : formatMatchCoins(row)}
                        </span>
                      </div>
                      <div className="wc-stat">
                        <StarIcon />
                        <span className="wc-stat-label">XP</span>
                        <span className="wc-stat-value wc-stat-value--xp">
                          {row.isBot || suppressRewards ? '—' : formatMatchXp(row)}
                        </span>
                      </div>
                      <div className="wc-stat">
                        <TrophyIcon />
                        <span className="wc-stat-label">Rank</span>
                        <span className="wc-stat-value wc-stat-value--rank">
                          {row.isBot || suppressRewards ? '—' : row.rank}
                        </span>
                      </div>
                    </div>

                    <p className="wc-round-line">
                      Round coins (from answers): <strong>{row.coinsEarned}</strong>
                    </p>
                  </article>
                );
              })}
            </section>

            {recentResults.length > 0 ? (
              <section className="wc-recent" aria-label="Recent Word Cipher matches">
                <h2 className="wc-recent-title">Recent Word Cipher matches</h2>
                <ul className="wc-recent-list">
                  {recentResults.map((item) => {
                    const w = String(item?.winnerUid || '');
                    const outcome = w === myUid ? 'win' : w === 'draw' ? 'draw' : 'loss';
                    const label = outcome === 'win' ? 'Win' : outcome === 'draw' ? 'Draw' : 'Loss';
                    return (
                      <li key={item.roomId} className="wc-recent-row">
                        <span className={`wc-dot wc-dot--${outcome}`} aria-hidden />
                        <span className="wc-recent-text">
                          {label} | Score {Number(item.myScore ?? 0)}-{Number(item.opponentScore ?? 0)} | XP +
                          {Number(item.xpGained ?? 0)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <button type="button" className="wc-cta" onClick={onBackToLobby}>
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
