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
import { InstallBanner, InstallModal, useInstallPrompt } from './components/InstallPrompt';
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
  const { install, dismiss, showBanner, canInstall, isIos, isAndroid, hasNativePrompt, modalOpen, closeModal } =
    useInstallPrompt();
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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-7 w-7 animate-pulse text-accent" />
          <p className="text-center text-xs text-zinc-500">
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
    <div className="min-h-[100dvh] safe-bottom pb-20 sm:pb-8">
      <Header
        status={status}
        wallet={wallet}
        connection={connection}
        busy={busy}
        openPositions={positions.length}
        onStart={() => void action(api.start)}
        onStop={() => void action(api.stop)}
        onModeChange={setMode}
        onInstall={() => void install()}
        showInstall={canInstall}
      />

      <InstallModal
        open={modalOpen}
        onClose={closeModal}
        onInstall={install}
        isIos={isIos}
        isAndroid={isAndroid}
        hasNativePrompt={hasNativePrompt}
      />

      {showBanner && (
        <div className="pt-3">
          <InstallBanner onInstall={() => void install()} onDismiss={dismiss} showIosHint={isIos} />
        </div>
      )}

      <main className="mx-auto max-w-[1600px] space-y-4 px-3 py-4 sm:space-y-5 sm:px-5 sm:py-6">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-6">
          <Stat
            label="Gesamtkapital"
            value={usd(portfolio.equityUsd)}
            sub={
              portfolio.reservedUsd > 0
                ? `${usd(portfolio.cashUsd)} frei · ${usd(portfolio.reservedUsd)} Gas`
                : `${usd(portfolio.cashUsd)} frei · ${usd(portfolio.exposureUsd)} investiert`
            }
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
            sub={`${stats.wins}W / ${stats.losses}L (${stats.totalTrades} gesamt)`}
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
            sub={`${stats.totalTrades} Trades`}
            icon={<History className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_380px] sm:gap-5">
          <div className="space-y-4 sm:space-y-5">
            <Card
              title="Kapitalverlauf"
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              action={
                <span className="text-[10px] text-zinc-500">
                  {status.lastTickAt ? `Prüfung ${timeAgo(status.lastTickAt)}` : 'wartet …'}
                </span>
              }
              bodyClassName="px-3 py-4"
            >
              <EquityChart data={equityCurve} startEquity={portfolio.startEquityUsd} />
            </Card>

            <Card bodyClassName="p-0">
              <nav className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-b border-border/80 px-2 py-2 sm:px-3">
                {tabs.map(({ key, label, icon: Icon, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:px-3.5 ${
                      tab === key
                        ? 'bg-surface-3 text-zinc-100 shadow-xs'
                        : 'text-zinc-500 hover:bg-surface-2 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className="num rounded-full bg-surface-2 border border-border px-1.5 py-0.2 text-[10px] text-zinc-400">
                        {count}
                      </span>
                    )}
                  </button>
                ))}
                <span className="hidden shrink-0 pr-2 text-[10px] text-zinc-600 sm:ml-auto sm:inline">
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

          <aside className="space-y-4 sm:space-y-5">
            <MarketIntelPanel intel={intel} />
            <WalletPanel wallet={wallet} onNotify={notify} onRefresh={refresh} />
            <SettingsPanel settings={settings} isPaper={isPaper} onNotify={notify} onRefresh={refresh} />
          </aside>
        </div>

        <footer className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-surface-1 px-4 py-3 sm:px-5 sm:py-3.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            <span className="font-semibold text-zinc-400">Risikohinweis:</span> Memecoin-Handel birgt erhebliche Risiken.
            Der Bot filtert Setups mit mathematischen und sicherheitsanalytischen Modellen, kann jedoch keine Gewinne garantieren.
          </p>
        </footer>
      </main>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-5 sm:left-auto sm:right-5 sm:p-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`slide-in pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-lg backdrop-blur-md ${
              toast.ok
                ? 'border-positive/30 bg-surface-2/95 text-positive'
                : 'border-negative/30 bg-surface-2/95 text-negative'
            }`}
          >
            {toast.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
