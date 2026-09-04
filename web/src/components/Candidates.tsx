import { useState } from 'react';
import { ChevronDown, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Chip, Empty } from './ui';
import { ageLabel, compact, pct, price, toneClass, usd } from '../lib/format';
import type { ScoredCandidate } from '../lib/types';

function scoreTone(score: number, threshold: number): string {
  if (score >= threshold) return 'text-emerald-400';
  if (score >= threshold - 10) return 'text-amber-400';
  return 'text-slate-500';
}

function Breakdown({ item }: { item: ScoredCandidate }) {
  return (
    <div className="grid gap-4 border-t border-white/[0.06] bg-black/25 px-5 py-4 md:grid-cols-2">
      <div className="space-y-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Bewertungsfaktoren</h4>
        {item.breakdown.map((part) => (
          <div key={part.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-slate-300">{part.label}</span>
              <span className="num text-[10px] text-slate-500">
                {(part.value * 100).toFixed(0)} × {(part.weight * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${part.value * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-600">{part.detail}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Sicherheitsprüfung</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone={item.security.score >= 0.7 ? 'emerald' : item.security.score >= 0.4 ? 'amber' : 'rose'}>
              {item.security.score >= 0.7 ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <ShieldAlert className="h-3 w-3" />
              )}
              {(item.security.score * 100).toFixed(0)}/100
            </Chip>
            {item.security.sellTaxPct > 0 && (
              <Chip tone="amber">Verkaufssteuer {item.security.sellTaxPct.toFixed(1)}%</Chip>
            )}
            {item.security.lpLocked && <Chip tone="emerald">LP gesperrt</Chip>}
            {item.security.holderCount > 0 && <Chip>{compact(item.security.holderCount)} Halter</Chip>}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
            {item.security.flags.length > 0 ? item.security.flags.join(' · ') : 'Keine Auffälligkeiten gefunden'}
            <span className="text-slate-700"> · {item.security.source}</span>
          </p>
        </div>

        {item.rejections.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-400/80">
              Warum kein Einstieg
            </h4>
            <ul className="mt-1.5 space-y-1">
              {item.rejections.map((reason) => (
                <li key={reason} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
            <div className="text-[10px] text-slate-600">Volumen 1h</div>
            <div className="num font-semibold text-slate-300">{usd(item.candidate.volume.h1, 0)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
            <div className="text-[10px] text-slate-600">Käufe / Verkäufe 1h</div>
            <div className="num font-semibold text-slate-300">
              {item.candidate.txns.h1.buys} / {item.candidate.txns.h1.sells}
            </div>
          </div>
        </div>

        <a
          href={item.candidate.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200"
        >
          Auf DexScreener ansehen <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export function CandidatesTable({
  candidates,
  minEntryScore,
}: {
  candidates: ScoredCandidate[];
  minEntryScore: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (candidates.length === 0) {
    return <Empty>Der Scanner sammelt noch Daten …</Empty>;
  }

  return (
    <div className="divide-y divide-white/[0.04]">
      {candidates.map((item) => {
        const c = item.candidate;
        const open = expanded === c.id;
        return (
          <div key={c.id} className={open ? 'bg-white/[0.02]' : ''}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : c.id)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className={`num w-12 shrink-0 text-lg font-bold ${scoreTone(item.score, minEntryScore)}`}>
                {item.score.toFixed(0)}
              </div>

              {c.imageUrl ? (
                <img src={c.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-full bg-ink-800 object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[10px] font-bold text-slate-500">
                  {c.symbol.slice(0, 3).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-100">{c.symbol}</span>
                  {item.tradable ? (
                    <Chip tone="emerald">handelbar</Chip>
                  ) : (
                    <Chip tone="slate">gefiltert</Chip>
                  )}
                </div>
                <p className="truncate text-[10px] text-slate-600">
                  {c.chain} · {c.dex} · {ageLabel(c.ageHours)} · Liq. {usd(c.liquidityUsd, 0)}
                </p>
              </div>

              <div className="hidden shrink-0 gap-4 text-right sm:flex">
                {(['m5', 'h1', 'h6'] as const).map((window) => (
                  <div key={window} className="w-14">
                    <div className="text-[9px] uppercase tracking-wider text-slate-600">
                      {window === 'm5' ? '5 Min' : window === 'h1' ? '1 Std' : '6 Std'}
                    </div>
                    <div className={`num text-xs font-bold ${toneClass(c.priceChange[window])}`}>
                      {pct(c.priceChange[window], 1)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="w-20 shrink-0 text-right">
                <div className="num text-xs font-semibold text-slate-300">{price(c.priceUsd)}</div>
                <div className="text-[10px] text-slate-600">{usd(c.marketCap, 0)}</div>
              </div>

              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && <Breakdown item={item} />}
          </div>
        );
      })}
    </div>
  );
}
