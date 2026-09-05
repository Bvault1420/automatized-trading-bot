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
    return <Empty>Keine offenen Positionen. Der Bot prüft den Markt alle 5 Sekunden nach Setups.</Empty>;
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
    <div className="divide-y divide-border/60">
      {positions.map((position) => {
        const held = (Date.now() - position.openedAt) / 1000;
        const peakDrawdown =
          position.peakPrice > 0 ? ((position.peakPrice - position.lastPrice) / position.peakPrice) * 100 : 0;

        return (
          <div key={position.id} className="px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <a
                    href={position.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm font-semibold text-zinc-100 hover:text-accent"
                  >
                    {position.symbol}
                    <ExternalLink className="h-3 w-3 text-zinc-500" />
                  </a>
                  <Chip>{position.chain}</Chip>
                  {position.partialsTaken > 0 && (
                    <Chip tone="accent">{position.partialsTaken}× Teilgewinn</Chip>
                  )}
                  {position.status === 'closing' && <Chip tone="amber">wird verkauft …</Chip>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">{position.entryReason}</p>
              </div>

              <div className="text-right">
                <div className={`num text-base font-semibold ${toneClass(position.netPnlPct ?? position.pnlPct)}`}>
                  {pct(position.netPnlPct ?? position.pnlPct)}
                </div>
                <div className={`num text-[11px] ${toneClass(position.netPnlUsd ?? position.pnlUsd)}`}>
                  {(position.netPnlUsd ?? position.pnlUsd) >= 0 ? '+' : ''}
                  {usd(position.netPnlUsd ?? position.pnlUsd, 3)}
                </div>
                {position.estimatedExitCostUsd != null && position.estimatedExitCostUsd > 0.01 && (
                  <div className="text-[10px] text-zinc-500">
                    Kurs {pct(position.pnlPct)} · Exit-Gebühr ~{usd(position.estimatedExitCostUsd, 2)}
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
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`num font-medium ${tone !== undefined ? toneClass(tone) : 'text-zinc-300'}`}>{value}</div>
    </div>
  );
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <Empty>Noch keine abgeschlossenen Trades.</Empty>;
  }

  const reversed = [...trades].reverse();

  return (
    <div className="divide-y divide-border/60">
      {reversed.map((trade) => {
        const isWin = trade.pnlUsd > 0;
        return (
          <div key={trade.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">{trade.symbol}</span>
                <Chip tone={isWin ? 'positive' : 'negative'}>{trade.chain}</Chip>
                <span className="text-[11px] text-zinc-500">
                  {new Date(trade.closedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">{trade.exitReason}</p>
            </div>

            <div className="text-right">
              <div className={`num text-sm font-semibold ${toneClass(trade.pnlPct)}`}>
                {trade.pnlPct >= 0 ? '+' : ''}
                {pct(trade.pnlPct)}
              </div>
              <div className={`num text-[11px] ${toneClass(trade.pnlUsd)}`}>
                {trade.pnlUsd >= 0 ? '+' : ''}
                {usd(trade.pnlUsd, 3)}
              </div>
            </div>

            <div className="hidden grid-cols-3 gap-3 text-right text-[11px] sm:grid">
              <div>
                <div className="text-[10px] text-zinc-500">Einsatz</div>
                <div className="num text-zinc-300">{usd(trade.costUsd, 2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Dauer</div>
                <div className="num text-zinc-300">{duration(trade.holdSeconds)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Ergebnis</div>
                <div className={`num font-semibold ${toneClass(trade.pnlUsd)}`}>{usd(trade.pnlUsd, 3)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
