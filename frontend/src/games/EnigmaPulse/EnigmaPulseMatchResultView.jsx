import React, { useMemo } from 'react';
import { formatMatchCoins, formatMatchXp, mapProgressionFields } from './enigmaRewardDisplay.js';
import './EnigmaPulseMatchResultView.css';

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

/**
 * Presentational match end screen for EnigmaPulse games (Syllogism, etc.).
 * @param {{ uid: string, displayName?: string, photoURL?: string }} gameUser
 * @param {object} result — MATCH_END payload
 * @param {object} [roomSnapshot] — last room payload for displayName / photoURL / isBot
 * @param {Array} recentResults — from getRecentEnigmaResults
 * @param {() => void} onBackToLobby
 * @param {string} [gameLabel]
 * @param {string} [sublineDraw]
 * @param {string} [sublineWin]
 * @param {string} [sublineLoss]
 */
const DEFAULT_SUBLINE_DRAW = 'Evenly matched. Well played.';
const DEFAULT_SUBLINE_WIN = 'Great logical consistency!';
const DEFAULT_SUBLINE_LOSS = 'Keep training your reasoning chains.';

export default function EnigmaPulseMatchResultView({
  gameUser,
  result,
  roomSnapshot = null,
  recentResults = [],
  onBackToLobby,
  gameLabel = 'Match',
  sublineDraw = DEFAULT_SUBLINE_DRAW,
  sublineWin = DEFAULT_SUBLINE_WIN,
  sublineLoss = DEFAULT_SUBLINE_LOSS,
}) {
  const myUid = String(gameUser?.uid || '');
  const winnerUid = String(result?.winnerUid || '');
  const isDraw = winnerUid === 'draw';
  const iWon = !isDraw && winnerUid === myUid;

  const rows = useMemo(
    () => buildRows({ result, roomSnapshot, gameUser }),
    [result, roomSnapshot, gameUser]
  );

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
  const subline = isDraw ? sublineDraw : iWon ? sublineWin : sublineLoss;

  return (
    <div className="epmrv-shell">
      <div className="epmrv-card">
        <p className="epmrv-game-label">{gameLabel}</p>
        <h2 className={`epmrv-headline ${isDraw ? 'is-draw' : iWon ? 'is-win' : 'is-loss'}`}>{headline}</h2>
        <p className="epmrv-subline">{subline}</p>

        {endNote ? <p className="epmrv-end-note">{endNote}</p> : null}

        <div className="epmrv-players" role="list">
          {sortedRows.map((row) => (
            <div
              key={row.uid || row.label}
              className={`epmrv-player ${row.isMe ? 'is-me' : ''} ${row.isBot ? 'is-bot' : ''}`}
              role="listitem"
            >
              <div className="epmrv-player-main">
                {row.photoURL ? (
                  <img className="epmrv-avatar" src={row.photoURL} alt="" width={40} height={40} />
                ) : (
                  <span className="epmrv-avatar-placeholder" aria-hidden>
                    {row.label.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div>
                  <div className="epmrv-player-name">{row.label}</div>
                  <div className="epmrv-score">Score {row.score}</div>
                </div>
              </div>
              <dl className="epmrv-stats">
                <div className="epmrv-stat">
                  <dt>Match coins</dt>
                  <dd>{row.isBot ? '—' : formatMatchCoins(row)}</dd>
                </div>
                <div className="epmrv-stat">
                  <dt>XP</dt>
                  <dd>{row.isBot ? '—' : formatMatchXp(row)}</dd>
                </div>
                <div className="epmrv-stat">
                  <dt>Rank</dt>
                  <dd>{row.isBot ? '—' : row.rank}</dd>
                </div>
              </dl>
              <p className="epmrv-round-coins">
                Round coins (from answers): <strong>{row.coinsEarned}</strong>
              </p>
              {!row.isBot && row.performanceBreakdown?.length > 0 ? (
                <ul className="epmrv-perf-list" aria-label="Performance bonuses">
                  {row.performanceBreakdown.map((b) => (
                    <li key={b.id} className="epmrv-perf-chip">
                      {b.label}
                      {Number(b.coins || 0) > 0 ? ` +${b.coins} coins` : ''}
                      {Number(b.xp || 0) > 0 ? ` +${b.xp} XP` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        {recentResults.length ? (
          <div className="epmrv-recent">
            <h3 className="epmrv-recent-title">Recent {gameLabel} matches</h3>
            <ul className="epmrv-recent-list">
              {recentResults.map((row) => (
                <li key={row.roomId}>
                  {`${row.winnerUid === myUid ? 'Win' : row.winnerUid === 'draw' ? 'Draw' : 'Loss'} | Score ${row.myScore}-${row.opponentScore} | XP +${row.xpGained}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button type="button" className="epmrv-cta" onClick={onBackToLobby}>
          Back to lobby
        </button>
      </div>
    </div>
  );
}
