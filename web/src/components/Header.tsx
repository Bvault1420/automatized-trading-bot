import { AlertOctagon, Loader2, Pause, Play, Zap } from 'lucide-react';
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
  onPanic,
  onModeChange,
}: {
  status: BotStatus;
  wallet: WalletState;
  connection: 'connecting' | 'live' | 'offline';
  busy: boolean;
  openPositions: number;
  onStart: () => void;
  onStop: () => void;
  onPanic: () => void;
  onModeChange: (mode: TradingMode) => void;
}) {
  const isLive = status.mode === 'live';

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Zap className="h-5 w-5 text-emerald-950" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold leading-tight tracking-tight text-white">Aletheia</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
              Autonomer Trading-Bot
            </p>
          </div>
        </div>

        <div className="mx-1 hidden h-8 w-px bg-white/[0.07] sm:block" />

        {/* Modusumschalter: der Live-Modus wird bewusst hervorgehoben. */}
        <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
          {(['paper', 'live'] as const).map((mode) => {
            const active = status.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onModeChange(mode)}
                disabled={busy || (mode === 'live' && !wallet.liveReady)}
                title={
                  mode === 'live' && !wallet.liveReady
                    ? `Live nicht bereit: ${wallet.liveBlockers.join(' · ')}`
                    : undefined
                }
                className={`rounded-[10px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-35 ${
                  active
                    ? mode === 'live'
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                      : 'bg-slate-200 text-slate-900'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === 'paper' ? 'Simulation' : 'Echtgeld'}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {status.running ? (
            <Chip tone="emerald">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Aktiv
            </Chip>
          ) : (
            <Chip tone={status.haltReason ? 'amber' : 'slate'}>
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              Gestoppt
            </Chip>
          )}
          <Chip tone={connection === 'live' ? 'indigo' : 'rose'}>
            {connection === 'live' ? 'Verbunden' : connection === 'connecting' ? 'Verbinde …' : 'Offline'}
          </Chip>
          {isLive && <Chip tone="rose">Echtes Geld</Chip>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {status.running ? (
            <button type="button" className="btn-ghost" onClick={onStop} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              Stoppen
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={onStart} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Bot starten
            </button>
          )}
          <button type="button" className="btn-danger" onClick={onPanic} disabled={busy} title="Alles sofort verkaufen">
            <AlertOctagon className="h-4 w-4" />
            Notaus
          </button>
        </div>
      </div>

      {!status.running && (status.haltReason || openPositions > 0) && (
        <div className="border-t border-amber-500/20 bg-amber-500/[0.07] px-6 py-2 text-center text-xs font-medium text-amber-300">
          {status.haltReason}
          {status.haltReason && openPositions > 0 && ' · '}
          {openPositions > 0 && (
            <span className="text-amber-200/80">
              {openPositions} offene Position{openPositions === 1 ? '' : 'en'} – Stop-Loss und Notausstieg bleiben
              aktiv
            </span>
          )}
        </div>
      )}
    </header>
  );
}
