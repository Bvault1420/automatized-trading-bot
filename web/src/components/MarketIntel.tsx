import { Activity, Gauge, Newspaper, TrendingUp } from 'lucide-react';
import { Card, Chip, SignalBar } from './ui';
import { pct, timeAgo, toneClass, usd } from '../lib/format';
import type { MarketIntel as Intel } from '../lib/types';

function RiskGauge({ value, regime }: { value: number; regime: Intel['regime'] }) {
  const percent = Math.round(value * 100);
  // Halbkreis-Anzeige: 180 Grad Bogen, gefuellt entsprechend Risikoappetit.
  const radius = 58;
  const circumference = Math.PI * radius;
  const filled = circumference * value;

  const tone =
    regime === 'risk-on'
      ? { stroke: '#10b981', label: 'Risk-on', chip: 'emerald' as const }
      : regime === 'risk-off'
        ? { stroke: '#f43f5e', label: 'Risk-off', chip: 'rose' as const }
        : { stroke: '#f59e0b', label: 'Neutral', chip: 'amber' as const };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 78" className="w-full max-w-[190px]">
        <path
          d={`M ${70 - radius} 70 A ${radius} ${radius} 0 0 1 ${70 + radius} 70`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        <path
          d={`M ${70 - radius} 70 A ${radius} ${radius} 0 0 1 ${70 + radius} 70`}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 700ms ease, stroke 400ms ease' }}
        />
        <text x="70" y="58" textAnchor="middle" className="num" fontSize="26" fontWeight="700" fill="#f1f5f9">
          {percent}
        </text>
        <text x="70" y="72" textAnchor="middle" fontSize="8.5" fill="#64748b" letterSpacing="1.2">
          RISIKOAPPETIT
        </text>
      </svg>
      <Chip tone={tone.chip}>{tone.label}</Chip>
    </div>
  );
}

export function MarketIntelPanel({ intel }: { intel: Intel }) {
  const fg = intel.fearGreed;

  return (
    <Card
      title="Marktlage"
      icon={<Gauge className="h-3.5 w-3.5" />}
      action={<span className="text-[10px] text-slate-600">{timeAgo(intel.updatedAt)}</span>}
      bodyClassName="p-5 space-y-4"
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-5">
        <RiskGauge value={intel.riskAppetite} regime={intel.regime} />
        <div className="space-y-2.5">
          {fg && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Fear &amp; Greed
                </span>
                <span className="num text-sm font-bold text-slate-200">
                  {fg.value}
                  <span className="ml-1 text-[10px] font-medium text-slate-500">/100</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500">
                <div
                  className="h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)] transition-all duration-700"
                  style={{ marginLeft: `${fg.value}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {fg.classification} · Vortag {fg.previous}
              </p>
            </div>
          )}

          {intel.macro && (
            <div className="grid grid-cols-3 gap-2">
              {(['btc', 'eth', 'sol'] as const).map((key) => {
                const coin = intel.macro?.[key];
                if (!coin) return null;
                return (
                  <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{key}</div>
                    <div className={`num text-xs font-bold ${toneClass(coin.change24h)}`}>
                      {pct(coin.change24h)}
                    </div>
                    <div className="num text-[10px] text-slate-600">{usd(coin.price, 0)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-xs leading-relaxed text-slate-400">
        {intel.narrative}
      </p>

      <div className="space-y-2.5">
        {intel.signals.map((signal) => (
          <div key={signal.key} className="group">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">{signal.label}</span>
              <span className={`num text-[11px] font-bold ${toneClass(signal.score)}`}>
                {signal.score >= 0 ? '+' : ''}
                {(signal.score * 100).toFixed(0)}
              </span>
            </div>
            <div className="mt-1">
              <SignalBar score={signal.score} />
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{signal.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function NewsPanel({ intel }: { intel: Intel }) {
  const items = intel.news.items.slice(0, 14);

  return (
    <Card
      title="Nachrichten & Stimmung"
      icon={<Newspaper className="h-3.5 w-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          {intel.social.freshPosts > 0 && (
            <Chip tone="emerald">{intel.social.freshPosts} Posts / {intel.social.freshWindowMinutes} Min.</Chip>
          )}
          <Chip tone="emerald">{intel.news.bullishCount} bullisch</Chip>
          <Chip tone="rose">{intel.news.bearishCount} bärisch</Chip>
        </div>
      }
      bodyClassName="p-0"
    >
      {intel.social.trendingTerms.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-5 py-3">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <TrendingUp className="h-3 w-3" /> Trends
          </span>
          {intel.social.trendingTerms.slice(0, 7).map((term) => (
            <span
              key={term.term}
              className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
            >
              {term.term}
            </span>
          ))}
        </div>
      )}

      <div className="max-h-80 divide-y divide-white/[0.04] overflow-y-auto">
        {items.map((item, index) => (
          <a
            key={`${item.url}-${index}`}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]"
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                item.sentiment > 0.15 ? 'bg-emerald-400' : item.sentiment < -0.15 ? 'bg-rose-400' : 'bg-slate-600'
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-300">{item.title}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                {item.source} · {timeAgo(item.publishedAt)}
              </p>
            </div>
          </a>
        ))}
        {items.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Activity className="h-4 w-4" /> Nachrichten werden geladen …
          </div>
        )}
      </div>
    </Card>
  );
}
