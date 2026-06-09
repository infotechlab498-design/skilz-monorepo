import React from 'react';
import { NC_BOT_UID } from '../../../../shared/neurochain/constants.js';

/**
 * @param {{
 *   game: Record<string, unknown> | null,
 *   myUid: string,
 *   onBack: () => void,
 * }} props
 */
export default function NeuroChainResult({ game, myUid, onBack }) {
  if (!game) return null;
  const players = Array.isArray(game.players) ? game.players : [];
  const scores = game.scores && typeof game.scores === 'object' ? game.scores : {};
  const rows = players
    .filter((p) => p.uid !== NC_BOT_UID || game.mode === 'practice')
    .map((p) => ({
      uid: p.uid,
      name: p.displayName || p.uid,
      score: Number(scores[p.uid] ?? 0),
      isMe: p.uid === myUid,
      isBot: p.uid === NC_BOT_UID,
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="nc-result">
      <h2 className="nc-result__title">Match complete</h2>
      <p className="nc-result__sub">
        {game.winnerUid === myUid
          ? 'You took the chain.'
          : game.winnerUid === NC_BOT_UID
            ? 'NeuroBot stole the spotlight.'
            : game.winnerUid
              ? 'Opponent edged ahead.'
              : 'Draw — razor close.'}
      </p>
      <ol className="nc-result__list">
        {rows.map((r, i) => (
          <li key={r.uid} className={r.isMe ? 'nc-result__row nc-result__row--me' : 'nc-result__row'}>
            <span className="nc-result__rank">{i + 1}</span>
            <span className="nc-result__name">
              {r.name}
              {r.isBot ? ' (bot)' : ''}
              {r.isMe ? ' · You' : ''}
            </span>
            <span className="nc-result__score">{r.score}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="nc-btn nc-btn--primary" onClick={onBack}>
        Back to lobby
      </button>
    </div>
  );
}
