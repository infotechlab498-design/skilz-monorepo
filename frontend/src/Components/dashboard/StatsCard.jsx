import React from 'react';

function formatValue(value, currency = false) {
  const n = Number(value || 0);
  if (currency) return `$${n.toLocaleString('en-US')}`;
  return n.toLocaleString('en-US');
}

/**
 * @param {{ title: string, value: number, percent: number, icon: React.ReactNode, currency?: boolean }} props
 */
export default function StatsCard({ title, value, percent, icon, currency = false }) {
  const positive = Number(percent) >= 0;
  return (
    <article className="dsh-crd dsh-crdSt">
      <div className="dsh-stL">
        <p className="dsh-stT">{title}</p>
        <h3 className="dsh-stV">{formatValue(value, currency)}</h3>
        <p className={`dsh-stP ${positive ? 'is-up' : 'is-down'}`}>
          {positive ? '+' : ''}
          {Number(percent || 0)}%
        </p>
      </div>
      <div className="dsh-stI" aria-hidden="true">
        {icon}
      </div>
    </article>
  );
}

