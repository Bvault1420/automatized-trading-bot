import { Gauge, Newspaper, TrendingUp } from 'lucide-react';
import { Card, Chip, SignalBar } from './ui';
import { pct, timeAgo, toneClass, usd } from '../lib/format';
import type { MarketIntel as Intel } from '../lib/types';

function RiskGauge({ value, regime }: { value: number; regime: Intel['regime'] }) {
  const percent = Math.round(value * 100);
  const radius = 54;
  const circumference = Math.PI * radius;
  const filled = circumference * value;

  const tone =
    regime === 'risk-on'
      ? { stroke: '#10b981', label: 'Risk-on', chip: 'positive' as const }
      : regime === 'risk-off'
        ? { stroke: '#ef4444', label: 'Risk-off', chip: 'negative' as const }
        : { stroke: '#f59e0b', label: 'Neutral', chip: 'amber' as const };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 76" className="w-full max-w-[170px]">
        <path
          d={`M ${70 - radius} 68 A ${radius} ${radius} 0 0 1 ${70 + radius} 68`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={`M ${70 - radius} 68 A ${radius} ${radius} 0 0 1 ${70 + radius} 68`}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 700ms ease, stroke 400ms ease' }}
        />
        <text x="70" y="56" textAnchor="middle" className="num" fontSize="24" fontWeight="700" fill="#f4f4f5">
          {percent}
        </text>
        <text x="70" y="70" textAnchor="middle" fontSize="8" fill="#71717a" letterSpacing="1">
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
      action={<span className="text-[10px] text-zinc-500">{timeAgo(intel.updatedAt)}</span>}
      bodyClassName="p-4 space-y-4 sm:p-5"
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 sm:gap-5">
        <RiskGauge value={intel.riskAppetite} regime={intel.regime} />
        <div className="space-y-2.5">
          {fg && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Fear &amp; Greed
                </span>
                <span className="num text-xs font-semibold text-zinc-200">
                  {fg.value}
                  <span className="ml-0.5 text-[10px] text-zinc-500">/100</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${fg.value}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                {fg.classification} · Vortag {fg.previous}
              </p>
            </div>
          )}

          {intel.macro && (
            <div className="grid grid-cols-3 gap-1.5">
              {(['btc', 'eth', 'sol'] as const).map((key) => {
                const coin = intel.macro?.[key];
                if (!coin) return null;
                return (
                  <div key={key} className="rounded-lg border border-border/80 bg-surface-2 px-2 py-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{key}</div>
                    <div className={`num text-xs font-semibold ${toneClass(coin.change24h)}`}>
                      {pct(coin.change24h)}
                    </div>
                    <div className="num text-[10px] text-zinc-500">{usd(coin.price, 0)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="rounded-lg border border-border/80 bg-surface-2 px-3 py-2 text-xs leading-relaxed text-zinc-400">
        {intel.narrative}
      </p>

      <div className="space-y-2">
        {intel.signals.map((signal) => (
          <div key={signal.key} className="group">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-zinc-300">{signal.label}</span>
              <span className={`num text-[11px] font-semibold ${toneClass(signal.score)}`}>
                {signal.score >= 0 ? '+' : ''}
                {(signal.score * 100).toFixed(0)}
              </span>
            </div>
            <div className="mt-1">
              <SignalBar score={signal.score} />
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-500">{signal.detail}</p>
          </div>
        ))}
      </div>

      {intel.social.trendingTerms.length > 0 && (
        <div className="border-t border-border/60 pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <TrendingUp className="h-3.5 w-3.5 text-accent" />
            <span>Trending Begriffe</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {intel.social.trendingTerms.map((term) => (
              <Chip key={term.term}>
                <span className="text-zinc-300">${term.term}</span>
                <span className="num text-[10px] text-zinc-500">×{term.mentions}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function NewsPanel({ intel }: { intel: Intel }) {
  const news = intel.news;

  return (
    <Card
      title="Nachrichten & Signale"
      icon={<Newspaper className="h-3.5 w-3.5" />}
      action={
        <span className="text-[10px] text-zinc-500">
          {news.bullishCount}↑ / {news.bearishCount}↓
        </span>
      }
      bodyClassName="p-0"
    >
      <div className="divide-y divide-border/60">
        {news.items.slice(0, 8).map((item, idx) => (
          <a
            key={idx}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/40 sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-medium text-zinc-200">{item.title}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                <span>{item.source}</span>
                <span>·</span>
                <span>{timeAgo(item.publishedAt)}</span>
                {item.matchedTerms?.length > 0 && (
                  <span className="text-accent">{item.matchedTerms.join(', ')}</span>
                )}
              </div>
            </div>
            <span className={`num shrink-0 text-xs font-semibold ${toneClass(item.sentiment)}`}>
              {item.sentiment > 0 ? '+' : ''}
              {(item.sentiment * 100).toFixed(0)}
            </span>
          </a>
        ))}
      </div>
    </Card>
  );
}
