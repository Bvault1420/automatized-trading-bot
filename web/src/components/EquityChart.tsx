import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EquityPoint } from '../lib/types';
import { clock } from '../lib/format';

export function EquityChart({ data, startEquity }: { data: EquityPoint[]; startEquity: number }) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500">
        Kapitalverlauf erscheint, sobald der Bot Daten gesammelt hat
      </div>
    );
  }

  const last = data[data.length - 1].equity;
  const up = last >= startEquity;
  const color = up ? '#10b981' : '#f43f5e';
  const values = data.map((d) => d.equity);
  const min = Math.min(...values, startEquity);
  const max = Math.max(...values, startEquity);
  const padding = Math.max((max - min) * 0.15, max * 0.01, 0.01);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(ts: number) => clock(ts).slice(0, 5)}
            stroke="rgba(148,163,184,0.4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[min - padding, max + padding]}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            stroke="rgba(148,163,184,0.4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={58}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,14,24,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(ts: number) => clock(ts)}
            formatter={(value: number, name: string) => [
              `$${value.toFixed(4)}`,
              name === 'equity' ? 'Gesamtkapital' : name === 'cash' ? 'Frei' : 'Investiert',
            ]}
          />
          <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#equityFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
