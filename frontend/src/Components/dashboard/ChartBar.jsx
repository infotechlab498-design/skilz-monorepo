import React from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dsh-tip">
      <p>Month: {label}</p>
      <p>Wins: {Number(payload[0]?.value || 0).toLocaleString('en-US')}</p>
    </div>
  );
}

/**
 * Footer metrics match Firestore `users/{uid}.stats` via dashboard builders: wins, totalMatches.
 * @param {{ data: Array<{month:string,wins:number,challenges:number}>, weeklyGrowthPct: number, totalWins: number, totalMatches: number }} props
 */
export default function ChartBar({ data, weeklyGrowthPct, totalWins, totalMatches }) {
  return (
    <article className="dsh-crd dsh-cht dsh-chtL">
      <div className="dsh-barWrap">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 20, right: 14, left: 2, bottom: 10 }}>
            <XAxis dataKey="month" tick={{ fill: '#c7d2fe', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
            <Bar dataKey="wins" barSize={6} radius={[8, 8, 0, 0]} fill="#fff" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="dsh-chtFt">
        <h3 className="dsh-chtT">Game winning Ratio</h3>
        <p className="dsh-chtSub">(+{Number(weeklyGrowthPct || 0)}%) than last week</p>
        <div className="dsh-mtr">
          <div className="dsh-mtrIt">
            <p className="dsh-mtrLb">Wins</p>
            <h4 className="dsh-mtrVl">{Number(totalWins || 0).toLocaleString('en-US')}</h4>
          </div>
          <div className="dsh-mtrIt">
            <p className="dsh-mtrLb">Matches</p>
            <h4 className="dsh-mtrVl">{Number(totalMatches || 0).toLocaleString('en-US')}</h4>
          </div>
        </div>
      </div>
    </article>
  );
}

