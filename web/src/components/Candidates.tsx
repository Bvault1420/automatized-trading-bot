import { useState } from 'react';
import { ChevronDown, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Chip, Empty } from './ui';
import { ageLabel, compact, pct, price, toneClass, usd } from '../lib/format';
import type { ScoredCandidate } from '../lib/types';

function scoreTone(score: number, threshold: number): string {
  if (score >= threshold) return 'text-positive font-semibold';
  if (score >= threshold - 8) return 'text-amber-400 font-medium';
  return 'text-zinc-500';
}

function Breakdown({ item }: { item: ScoredCandidate }) {
  return (
    <div className="grid gap-4 border-t border-border/60 bg-surface-0/60 px-4 py-3 sm:px-5 md:grid-cols-2">
      <div className="space-y-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Bewertungsfaktoren</h4>
        {item.breakdown.map((part) => (
          <div key={part.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-zinc-300">{part.label}</span>
              <span className="num text-[10px] text-zinc-500">
                {(part.value * 100).toFixed(0)} × {(part.weight * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${part.value * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-500">{part.detail}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Sicherheitsprüfung</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone={item.security.score >= 0.7 ? 'positive' : item.security.score >= 0.45 ? 'amber' : 'negative'}>
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
            {item.security.lpLocked && <Chip tone="positive">LP gesperrt</Chip>}
            {item.security.holderCount > 0 && <Chip>{compact(item.security.holderCount)} Halter</Chip>}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
            {item.security.flags.length > 0 ? item.security.flags.join(' · ') : 'Keine Auffälligkeiten gefunden'}
            <span className="text-zinc-600"> · {item.security.source}</span>
          </p>
        </div>

        {item.rejections.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-negative">
              Ausschlussgrund
            </h4>
            <ul className="mt-1.5 space-y-1">
              {item.rejections.map((reason) => (
                <li key={reason} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-negative" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-border/80 bg-surface-2 px-2.5 py-1.5">
            <div className="text-[10px] text-zinc-500">Volumen 1h</div>
            <div className="num font-semibold text-zinc-200">{usd(item.candidate.volume.h1, 0)}</div>
          </div>
          <div className="rounded-lg border border-border/80 bg-surface-2 px-2.5 py-1.5">
            <div className="text-[10px] text-zinc-500">Käufe / Verkäufe 1h</div>
            <div className="num font-semibold text-zinc-200">
              {item.candidate.txns.h1.buys} / {item.candidate.txns.h1.sells}
            </div>
          </div>
        </div>

        <a
          href={item.candidate.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-zinc-100"
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

  const clean = candidates.filter((c) => c.tradable).length;
  const ready = candidates.filter((c) => c.tradable && c.score >= minEntryScore).length;

  return (
    <div className="divide-y divide-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2/40 px-4 py-2.5 text-xs text-zinc-400 sm:px-5">
        <div>
          <span>{candidates.length} bewertet</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span className="text-zinc-300">{clean} handelbar</span>
          {ready > 0 && (
            <>
              <span className="mx-1.5 text-zinc-600">·</span>
              <span className="text-positive font-semibold">{ready} über Einstiegsschwelle</span>
            </>
          )}
        </div>
        <div className="text-[11px] text-zinc-500">Schwelle: {minEntryScore} Pkt.</div>
      </div>

      {candidates.map((item) => {
        const c = item.candidate;
        const open = expanded === c.id;

        return (
          <div key={c.id} className="transition-colors hover:bg-surface-2/30">
            <div
              className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              onClick={() => setExpanded(open ? null : c.id)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-2 text-xs font-bold text-zinc-200">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  c.symbol.slice(0, 3)
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-100">{c.symbol}</span>
                  <span className="hidden truncate text-xs text-zinc-500 sm:inline">{c.name}</span>
                  <Chip tone={item.tradable ? 'slate' : 'amber'}>
                    {c.chain}
                  </Chip>
                  {c.dex && <span className="hidden text-[11px] text-zinc-500 md:inline">{c.dex}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                  <span>Liq. {usd(c.liquidityUsd, 0)}</span>
                  <span>Vol 5m {usd(c.volume.m5, 0)}</span>
                  <span>Alter {ageLabel(c.ageHours)}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="num text-xs text-zinc-300">{price(c.priceUsd)}</div>
                  <div className={`num text-[11px] ${toneClass(c.priceChange.m5)}`}>
                    5m {pct(c.priceChange.m5)}
                  </div>
                </div>

                <div className="w-12 text-right">
                  <div className={`num text-base font-semibold ${scoreTone(item.score, minEntryScore)}`}>
                    {item.score.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-zinc-500">Score</div>
                </div>

                <ChevronDown
                  className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>

            {open && <Breakdown item={item} />}
          </div>
        );
      })}
    </div>
  );
}
