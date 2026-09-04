import { ExternalLink, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Chip, Empty } from './ui';
import { duration, pct, price, toneClass, usd } from '../lib/format';
import type { Position, Trade } from '../lib/types';

export function PositionsTable({
  positions,
  onClose,
}: {
  positions: Position[];
  onClose: (id: string) => Promise<void>;
}) {
  const [closing, setClosing] = useState<string | null>(null);

  if (positions.length === 0) {
    return <Empty>Keine offenen Positionen. Der Bot wartet auf ein Setup mit ausreichendem Score.</Empty>;
  }

  const handleClose = async (id: string) => {
    setClosing(id);
    try {
      await onClose(id);
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="divide-y divide-white/[0.04]">
      {positions.map((position) => {
        const held = (Date.now() - position.openedAt) / 1000;
        const peakDrawdown =
          position.peakPrice > 0 ? ((position.peakPrice - position.lastPrice) / position.peakPrice) * 100 : 0;

        return (
          <div key={position.id} className="px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <a
                    href={position.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm font-bold text-slate-100 hover:text-emerald-300"
                  >
                    {position.symbol}
                    <ExternalLink className="h-3 w-3 text-slate-600" />
                  </a>
                  <Chip>{position.chain}</Chip>
                  {position.partialsTaken > 0 && (
                    <Chip tone="indigo">{position.partialsTaken}× Teilgewinn</Chip>
                  )}
                  {position.status === 'closing' && <Chip tone="amber">wird verkauft …</Chip>}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-slate-600">{position.entryReason}</p>
              </div>

              <div className="text-right">
                <div className={`num text-lg font-bold ${toneClass(position.netPnlPct ?? position.pnlPct)}`}>
                  {pct(position.netPnlPct ?? position.pnlPct)}
                </div>
                <div className={`num text-[11px] ${toneClass(position.netPnlUsd ?? position.pnlUsd)}`}>
                  {(position.netPnlUsd ?? position.pnlUsd) >= 0 ? '+' : ''}
                  {usd(position.netPnlUsd ?? position.pnlUsd, 3)}
                </div>
                {position.estimatedExitCostUsd != null && position.estimatedExitCostUsd > 0.01 && (
                  <div className="text-[10px] text-slate-600">
                    Kurs {pct(position.pnlPct)} · Verkauf ~{usd(position.estimatedExitCostUsd, 2)}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleClose(position.id)}
                disabled={closing === position.id || position.status === 'closing'}
                className="btn-ghost px-2.5 py-1.5"
                title="Position sofort schließen"
              >
                {closing === position.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-6">
              <Field label="Einstieg" value={price(position.entryPrice)} />
              <Field label="Aktuell" value={price(position.lastPrice)} />
              <Field label="Einsatz" value={usd(position.costUsd, 2)} />
              <Field
                label="Gebühren"
                value={usd(position.feesUsd || 0, 3)}
                tone={position.feesUsd ? -position.feesUsd : undefined}
              />
              <Field label="Haltedauer" value={duration(held)} />
              <Field label="Vom Hoch" value={pct(-peakDrawdown)} tone={-peakDrawdown} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className={`num font-semibold ${tone !== undefined ? toneClass(tone) : 'text-slate-300'}`}>{value}</div>
    </div>
  );
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <Empty>Noch keine abgeschlossenen Trades.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-600">
          <tr>
            <th className="px-5 py-2.5 font-semibold">Token</th>
            <th className="px-3 py-2.5 font-semibold">Einstieg</th>
            <th className="px-3 py-2.5 font-semibold">Ausstieg</th>
            <th className="px-3 py-2.5 font-semibold">Dauer</th>
            <th className="px-3 py-2.5 font-semibold">Score</th>
            <th className="px-3 py-2.5 font-semibold">Grund</th>
            <th className="px-5 py-2.5 text-right font-semibold">Ergebnis</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {trades.map((trade) => (
            <tr key={`${trade.id}-${trade.closedAt}`} className="transition-colors hover:bg-white/[0.02]">
              <td className="px-5 py-2.5">
                <a
                  href={trade.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-slate-200 hover:text-emerald-300"
                >
                  {trade.symbol}
                </a>
                <div className="text-[10px] text-slate-600">{trade.chain}</div>
              </td>
              <td className="num px-3 py-2.5 text-slate-400">{price(trade.entryPrice)}</td>
              <td className="num px-3 py-2.5 text-slate-400">{price(trade.exitPrice)}</td>
              <td className="num px-3 py-2.5 text-slate-400">{duration(trade.holdSeconds)}</td>
              <td className="num px-3 py-2.5 text-slate-400">{trade.entryScore.toFixed(0)}</td>
              <td className="max-w-52 truncate px-3 py-2.5 text-slate-500">{trade.exitReason}</td>
              <td className="px-5 py-2.5 text-right">
                <div className={`num font-bold ${toneClass(trade.pnlPct)}`}>{pct(trade.pnlPct)}</div>
                <div className={`num text-[10px] ${toneClass(trade.pnlUsd)}`}>
                  {trade.pnlUsd >= 0 ? '+' : ''}
                  {usd(trade.pnlUsd, 3)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
