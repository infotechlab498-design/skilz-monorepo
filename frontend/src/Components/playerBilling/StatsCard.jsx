import React from 'react';
import { Wallet } from 'lucide-react';

/**
 * @param {{ label: string, value: string, tone?: 'spend' | 'earn' }}
 */
export default function StatsCard({ label, value, tone = 'spend' }) {
  return (
    <div className="pb-stats-card">
      <div className="pb-stats-card__icon" aria-hidden>
        <Wallet size={22} strokeWidth={2} />
      </div>
      <div>
        <div className="pb-stats-card__label">{label}</div>
        <div className="pb-stats-card__value" data-tone={tone}>
          {value}
        </div>
      </div>
    </div>
  );
}
