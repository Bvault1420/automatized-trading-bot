import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  CheckCircle2,
  History,
  Radar,
  ScrollText,
  Target,
  TriangleAlert,
  Wallet2,
  XCircle,
} from 'lucide-react';
import { Header } from './components/Header';
import { EquityChart } from './components/EquityChart';
import { MarketIntelPanel, NewsPanel } from './components/MarketIntel';
import { CandidatesTable } from './components/Candidates';
import { PositionsTable, TradesTable } from './components/Positions';
import { LogStream } from './components/LogStream';
import { WalletPanel } from './components/WalletPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { Card, Stat } from './components/ui';
import { api } from './lib/api';
import { useBotState } from './lib/useBotState';
import { duration, pct, timeAgo, usd } from './lib/format';
import type { TradingMode } from './lib/types';

type Tab = 'signals' | 'positions' | 'trades' | 'logs';

interface Toast {
  id: number;
  message: string;
  ok: boolean;
}

export default function App() {
  const { state, connection, refresh } = useBotState();
  const [tab, setTab] = useState<Tab>('signals');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, ok = true) => {
    const toast: Toast = { id: Date.now() + Math.random(), message, ok };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 5000);
  }, []);

  const action = useCallback(
    async (fn: () => Promise<{ ok: boolean; message: string }>) => {
      setBusy(true);
      try {
        const result = await fn();
        notify(result.message, result.ok);
        await refresh();
      } catch (err) {
        notify((err as Error).message, false);
      } finally {
        setBusy(false);
      }
    },
    [notify, refresh],
  );

  // Der Notaus ist irreversibel – deshalb eine bewusste Rückfrage.
  const panic = useCallback(() => {
    if (!window.confirm('Notaus: Bot stoppen und alle Positionen sofort verkaufen?')) return;
    void action(api.panic);
  }, [action]);

  const setMode = useCallback(
    (mode: TradingMode) => {
      if (mode === 'live') {
        if (!state?.wallet.liveReady) {
          notify(`Echtgeld ist noch nicht bereit: ${(state?.wallet.liveBlockers ?? []).join(' · ')}`, false);
          document.getElementById('wallet-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (!window.confirm(`Echtgeld-Modus aktivieren? Der Bot handelt dann mit echtem Kapital auf ${state.wallet.chain}.`)) {
          return;
        }
      }
      void action(() => api.setMode(mode));
    },
    [action, notify, state?.wallet.liveReady, state?.wallet.liveBlockers, state?.wallet.chain],
  );

  useEffect(() => {
    document.title = state
      ? `${usd(state.portfolio.equityUsd)} · ${pct(state.portfolio.totalPnlPct)} · Aletheia`
      : 'Aletheia · Autonomer Trading-Bot';
  }, [state]);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-7 w-7 animate-pulse text-emerald-500" />
          <p className="text-sm text-slate-500">
            {connection === 'offline' ? 'Keine Verbindung zum Bot-Server …' : 'Dashboard wird geladen …'}
          </p>
        </div>
      </div>
    );
  }

  const { portfolio, stats, status, intel, candidates, positions, trades, wallet, settings, logs, equityCurve } =
    state;
  const isPaper = status.mode === 'paper';

  const tabs: { key: Tab; label: string; icon: typeof Radar; count?: number }[] = [
    { key: 'signals', label: 'Signale', icon: Radar, count: candidates.filter((c) => c.tradable && c.score >= settings.minEntryScore).length },
    { key: 'positions', label: 'Positionen', icon: Briefcase, count: positions.length },
    { key: 'trades', label: 'Historie', icon: History, count: trades.length },
    { key: 'logs', label: 'Protokoll', icon: ScrollText },
  ];

  return (
    <div className="min-h-screen pb-16">
      <Header
        status={status}
        wallet={wallet}
        connection={connection}
        busy={busy}
        openPositions={positions.length}
        onStart={() => void action(api.start)}
        onStop={() => void action(api.stop)}
        onPanic={panic}
        onModeChange={setMode}
      />

      <main className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat
            label="Gesamtkapital"
            value={usd(portfolio.equityUsd)}
            sub={`${usd(portfolio.cashUsd)} frei · ${usd(portfolio.exposureUsd)} investiert`}
            icon={<Wallet2 className="h-3.5 w-3.5" />}
          />
          <Stat
            label="Gesamt-Ergebnis"
            value={pct(portfolio.totalPnlPct)}
            sub={`Start ${usd(portfolio.startEquityUsd)}`}
            tone={portfolio.totalPnlPct > 0 ? 'good' : portfolio.totalPnlPct < 0 ? 'bad' : 'neutral'}
            icon={<BarChart3 className="h-3.5 w-3.5" />}
          />
          <Stat
            label="Heute"
            value={pct(portfolio.dayPnlPct)}
            sub={`Drawdown ${portfolio.drawdownPct.toFixed(1)}%`}
            tone={portfolio.dayPnlPct > 0 ? 'good' : portfolio.dayPnlPct < 0 ? 'bad' : 'neutral'}
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          <Stat
            label="Trefferquote"
            value={`${stats.winRatePct.toFixed(0)}%`}
            sub={`${stats.wins} Gewinne / ${stats.losses} Verluste`}
            tone={stats.winRatePct >= 50 ? 'good' : stats.totalTrades > 0 ? 'bad' : 'neutral'}
            icon={<Target className="h-3.5 w-3.5" />}
          />
          <Stat
            label="Profit-Faktor"
            value={stats.profitFactor.toFixed(2)}
            sub={`Erwartungswert ${pct(stats.expectancyPct)}`}
            tone={stats.profitFactor >= 1 ? 'good' : stats.totalTrades > 0 ? 'bad' : 'neutral'}
          />
          <Stat
            label="Ø Haltedauer"
            value={stats.avgHoldSeconds > 0 ? duration(stats.avgHoldSeconds) : '–'}
            sub={`${stats.totalTrades} Trades gesamt`}
            icon={<History className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            <Card
              title="Kapitalverlauf"
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              action={
                <span className="text-[10px] text-slate-600">
                  {status.lastTickAt ? `Letzte Prüfung ${timeAgo(status.lastTickAt)}` : 'wartet …'}
                </span>
              }
              bodyClassName="px-3 py-4"
            >
              <EquityChart data={equityCurve} startEquity={portfolio.startEquityUsd} />
            </Card>

            <Card bodyClassName="p-0">
              <nav className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
                {tabs.map(({ key, label, icon: Icon, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                      tab === key
                        ? 'bg-white/[0.08] text-slate-100'
                        : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className="num rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {count}
                      </span>
                    )}
                  </button>
                ))}
                <span className="ml-auto pr-2 text-[10px] text-slate-700">
                  {status.lastScanAt ? `Scan ${timeAgo(status.lastScanAt)}` : ''}
                </span>
              </nav>

              {tab === 'signals' && (
                <CandidatesTable candidates={candidates} minEntryScore={settings.minEntryScore} />
              )}
              {tab === 'positions' && (
                <PositionsTable
                  positions={positions}
                  onClose={async (id) => {
                    await action(() => api.closePosition(id));
                  }}
                />
              )}
              {tab === 'trades' && <TradesTable trades={trades} />}
              {tab === 'logs' && <LogStream logs={logs} />}
            </Card>

            <NewsPanel intel={intel} />
          </div>

          <aside className="space-y-5">
            <MarketIntelPanel intel={intel} />
            <WalletPanel wallet={wallet} onNotify={notify} onRefresh={refresh} />
            <SettingsPanel settings={settings} isPaper={isPaper} onNotify={notify} onRefresh={refresh} />
          </aside>
        </div>

        <footer className="flex items-start gap-2.5 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] px-5 py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-relaxed text-amber-200/70">
            <span className="font-semibold text-amber-300">Risikohinweis.</span> Memecoin-Handel ist hochspekulativ.
            Kein Algorithmus kann Gewinne oder eine bestimmte Trefferquote garantieren – auch dieser nicht. Der Bot
            arbeitet mit Wahrscheinlichkeiten, und Totalverluste einzelner Positionen sind normaler Teil der
            Strategie. Setze ausschließlich Geld ein, dessen Verlust du verkraften kannst, und teste zuerst
            ausgiebig im Simulationsmodus.
          </p>
        </footer>
      </main>

      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`slide-in pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-xl ${
              toast.ok
                ? 'border-emerald-500/25 bg-emerald-950/85 text-emerald-200'
                : 'border-rose-500/25 bg-rose-950/85 text-rose-200'
            }`}
          >
            {toast.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
