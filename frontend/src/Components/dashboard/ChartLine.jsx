import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * @param {{ data: Array<{month:string,rankA:number,rankB:number}> }} props
 */
export default function ChartLine({ data }) {
  return (
    <article className="dsh-crd dsh-cht dsh-chtR">
      <div className="dsh-rnkHd">
        <h3 className="dsh-chtT">Profile Ranking</h3>
        <p className="dsh-chtSub">+4% more in 2021</p>
      </div>

      <div className="dsh-lneWrap">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 2, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 8" stroke="rgba(148, 163, 184, 0.28)" />
            <XAxis dataKey="month" tick={{ fill: '#98a2b3', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#98a2b3', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v) => Number(v).toLocaleString('en-US')}
              contentStyle={{ borderRadius: 10, border: '1px solid rgba(16,24,40,.12)' }}
            />
            <Line type="monotone" dataKey="rankA" stroke="#ff0080" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="rankB" stroke="#2d3748" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

