import { Download, Loader2, Pause, Play } from 'lucide-react';
import { Chip } from './ui';
import type { BotStatus, TradingMode, WalletState } from '../lib/types';

export function Header({
  status,
  wallet,
  connection,
  busy,
  openPositions,
  onStart,
  onStop,
  onModeChange,
  onInstall,
  showInstall,
}: {
  status: BotStatus;
  wallet: WalletState;
  connection: 'connecting' | 'live' | 'offline';
  busy: boolean;
  openPositions: number;
  onStart: () => void;
  onStop: () => void;
  onModeChange: (mode: TradingMode) => void;
  onInstall?: () => void;
  showInstall?: boolean;
}) {
  const isLive = status.mode === 'live';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-0/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-sm font-bold text-zinc-100">
            A
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-zinc-100 sm:text-[15px]">Aletheia</h1>
            <p className="truncate text-[11px] text-zinc-500">
              {status.running ? 'Bot aktiv' : 'Gestoppt'} · {wallet.chain}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {showInstall && onInstall && (
            <button
              type="button"
              className="btn-primary px-2.5 sm:px-3"
              onClick={onInstall}
              title="Als App installieren"
              aria-label="Als App installieren"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">App</span>
            </button>
          )}

          <div className="flex rounded-lg border border-border bg-surface-1 p-0.5">
            {(['paper', 'live'] as const).map((mode) => {
              const active = status.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onModeChange(mode)}
                  disabled={busy}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-35 sm:px-3 sm:text-xs ${
                    active
                      ? mode === 'live'
                        ? 'bg-negative/20 text-negative'
                        : 'bg-zinc-200 text-zinc-900'
                      : 'text-zinc-500'
                  }`}
                >
                  {mode === 'paper' ? 'Demo' : 'Live'}
                </button>
              );
            })}
          </div>

          {status.running ? (
            <button type="button" className="btn-ghost px-2.5 sm:px-4" onClick={onStop} disabled={busy} aria-label="Stoppen">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button type="button" className="btn-primary px-2.5 sm:px-4" onClick={onStart} disabled={busy} aria-label="Starten">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span className="hidden sm:inline">Start</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-1.5 sm:px-5">
        {status.running ? (
          <Chip tone="positive">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            Läuft
          </Chip>
        ) : (
          <Chip tone="slate">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Pause
          </Chip>
        )}
        <Chip tone={connection === 'live' ? 'accent' : 'negative'}>
          {connection === 'live' ? 'Online' : connection === 'connecting' ? 'Verbinde …' : 'Offline'}
        </Chip>
        {isLive && <Chip tone="negative">Echtgeld</Chip>}
        {openPositions > 0 && <Chip>{openPositions} offen</Chip>}
      </div>

      {status.running && (
        <div className="border-t border-border bg-surface-2 px-3 py-2 text-center text-[11px] leading-relaxed text-zinc-400 sm:px-5 sm:text-xs">
          Läuft auf dem Server – Handy oder PC aus ist egal, solange der Host an bleibt.
        </div>
      )}

      {!status.running && openPositions > 0 && (
        <div className="border-t border-border bg-surface-2 px-3 py-2 text-center text-[11px] text-zinc-400 sm:text-xs">
          {openPositions} Position(en) offen – Stop-Loss bleibt aktiv
        </div>
      )}
    </header>
  );
}
