import React from 'react';

const LABELS = ['A', 'B', 'C', 'D'];

/**
 * @param {{
 *   question: { sequence: string[], options: string[] } | null,
 *   nodeIndex: number,
 *   totalNodes: number,
 *   disabled?: boolean,
 *   flashKey?: string | null,
 *   onPick: (index: number) => void,
 * }} props
 */
export default function QuestionCard({ question, nodeIndex, totalNodes, disabled, flashKey, onPick }) {
  if (!question) {
    return (
      <div className="nc-card nc-card--empty">
        <p>Loading chain…</p>
      </div>
    );
  }

  const seq = Array.isArray(question.sequence) ? question.sequence : [];

  return (
    <div className={`nc-card ${flashKey ? `nc-card--flash-${flashKey}` : ''}`}>
      <div className="nc-card__meta">
        <span className="nc-node-pill">
          Node {nodeIndex + 1}/{totalNodes}
        </span>
        {question.difficulty ? <span className="nc-diff">{question.difficulty}</span> : null}
      </div>
      <div className="nc-sequence" aria-label="Number sequence">
        {seq.map((cell, i) => (
          <React.Fragment key={`${i}-${cell}`}>
            {i > 0 ? <span className="nc-seq-arrow" aria-hidden="true">→</span> : null}
            <span className={cell === '?' ? 'nc-seq-cell nc-seq-cell--q' : 'nc-seq-cell'}>{cell}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="nc-options" role="group" aria-label="Answers">
        {question.options.map((opt, idx) => (
          <button
            key={LABELS[idx]}
            type="button"
            className="nc-opt"
            disabled={disabled}
            onClick={() => onPick(idx)}
          >
            <span className="nc-opt__badge">{LABELS[idx]}</span>
            <span className="nc-opt__text">{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
