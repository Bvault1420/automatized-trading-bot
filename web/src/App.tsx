import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Copy,
  Globe,
  Mail,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Smartphone,
} from 'lucide-react';
import { api } from './lib/api';
import { money, n2, pct, regimeName, signedMoney, strategyName, timeAgo, when } from './lib/format';
import { useBotState } from './lib/useBotState';
import type { TradingMode } from './lib/types';

export default function App() {
  const { state, connection, refresh } = useBotState();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<{ pc: string[]; phone: string[]; public?: string[]; hint: string } | null>(null);

  useEffect(() => {
    if (state?.settings.alertEmail) setEmail(state.settings.alertEmail);
  }, [state?.settings.alertEmail]);

  useEffect(() => {
    void api.access().then(setAccess).catch(() => {});
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      notify(r.message);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chart = useMemo(
    () =>
      (state?.equityCurve ?? []).map((p) => ({
        t: new Date(p.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        equity: Number(p.equityEur.toFixed(2)),
      })),
    [state?.equityCurve],
  );

  if (!state) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-muted">
        <Activity className="h-6 w-6 animate-pulse text-gold" />
        <p>{connection === 'offline' ? 'Keine Verbindung zum Bot.' : 'Dashboard wird geladen …'}</p>
      </div>
    );
  }

  const { portfolio, status, rules, settings } = state;
  const up = portfolio.totalPnlEur >= 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-gold uppercase">Paper-First · 24/7</p>
          <h1 className="font-serif text-4xl italic text-ink sm:text-5xl">Aegis</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Automatisierter Mix aus Krypto und Aktien. Jeder Trade braucht einen Plan mit SL, TP1 und TP2.
            Demo startet bei {money(settings.paperStartEur)}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ModeChip
            mode={status.mode}
            liveReady={state.live.ready}
            blockers={state.live.blockers}
            disabled={busy}
            onMode={(m) => void run(() => api.setMode(m))}
            onBlocked={(msg) => notify(msg)}
          />
          {status.running ? (
            <button className="btn-ghost" disabled={busy} onClick={() => void run(() => api.stop())}>
              <Pause className="h-4 w-4" /> Pause
            </button>
          ) : (
            <button className="btn-gold" disabled={busy} onClick={() => void run(() => api.start())}>
              <Play className="h-4 w-4" /> Start
            </button>
          )}
        </div>
      </header>

      {access && (
        <section className="panel mb-6 p-4">
          <h2 className="mb-2 text-sm font-medium">Website – immer erreichbar</h2>
          <p className="mb-3 text-xs text-muted">{access.hint}</p>
          <p className="mb-3 font-mono text-xs text-gold">
            Dieser Browser: {typeof window !== 'undefined' ? window.location.origin : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(access.public ?? []).length > 0 && (
              <UrlList
                icon={<Globe className="h-4 w-4 text-gold" />}
                title="Firefox / Chrome / Handy (Internet)"
                urls={access.public ?? []}
                onCopy={notify}
              />
            )}
            <UrlList icon={<Monitor className="h-4 w-4 text-gold" />} title="Nur auf diesem Rechner" urls={access.pc} onCopy={notify} />
            <UrlList
              icon={<Smartphone className="h-4 w-4 text-gold" />}
              title="Handy · gleiches WLAN"
              urls={access.phone.length ? access.phone : ['Sobald der PC im WLAN ist, erscheint hier die IP']}
              onCopy={notify}
              copyable={access.phone.length > 0}
            />
          </div>
        </section>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Equity (Paper)" value={money(portfolio.equityEur)} sub={`Cash ${money(portfolio.cashEur)}`} />
        <Stat
          label="Gesamt"
          value={signedMoney(portfolio.totalPnlEur)}
          sub={pct(portfolio.totalPnlPct)}
          tone={up ? 'up' : 'down'}
        />
        <Stat
          label="Heute"
          value={signedMoney(portfolio.dayPnlEur)}
          sub={pct(portfolio.dayPnlPct)}
          tone={portfolio.dayPnlEur >= 0 ? 'up' : 'down'}
        />
        <Stat
          label="Marktphase"
          value={regimeName[status.regime] ?? status.regime}
          sub={`Bias: ${strategyName[status.activeStrategyBias]}`}
        />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Kapitalkurve</h2>
            <span className="text-[11px] text-muted">
              {connection === 'live' ? 'Live-Stream' : connection === 'offline' ? 'Offline' : 'Polling'} · Tick{' '}
              {timeAgo(status.lastTickAt)}
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart.length ? chart : [{ t: 'start', equity: settings.paperStartEur }]}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c6a36a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#c6a36a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2a261c" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: '#8b8678', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tick={{ fill: '#8b8678', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{ background: '#12130f', border: '1px solid #2a261c', borderRadius: 12 }}
                  formatter={(v: number | string) => [typeof v === 'number' ? money(v) : v, 'Equity']}
                />
                <Area type="monotone" dataKey="equity" stroke="#c6a36a" fill="url(#eq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-gold" /> Schutzregeln
          </h2>
          <ul className="space-y-2 text-sm text-muted">
            <Li k="Min. Qualität" v={String(rules.minQuality)} />
            <Li k="Min. R:R nach Gebühren" v={n2(rules.minRewardToRisk)} />
            <Li k="Risiko / Trade" v={`${n2(rules.riskPerTradePct)} %`} />
            <Li k="Max. Einstiege / Tag" v={String(rules.maxEntriesPerDay)} />
            <Li k="Tagesverlust-Halt" v={`${n2(rules.dailyLossLimitPct)} %`} />
            <Li k="Drawdown" v={`${n2(portfolio.drawdownPct)} %`} />
            <Li k="Verluste in Folge" v={String(status.consecutiveLosses)} />
          </ul>
          {status.haltReason && <p className="mt-3 text-xs text-down">{status.haltReason}</p>}
          {status.cooldownUntil && status.cooldownUntil > Date.now() && (
            <p className="mt-2 text-xs text-gold">Pause bis {when(status.cooldownUntil)}</p>
          )}
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-medium">Pläne / Kandidaten</h2>
          <div className="space-y-3">
            {state.candidates.length === 0 && (
              <p className="text-sm text-muted">Noch keine Setups. Der Bot handelt nur, wenn ein vollständiger Plan steht.</p>
            )}
            {state.candidates.slice(0, 6).map((c) => (
              <div key={`${c.instrumentId}-${c.strategy}-${c.side}`} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    {c.display}{' '}
                    <span className="text-xs text-muted">
                      {c.side === 'long' ? 'Long' : 'Short'} · {strategyName[c.strategy]}
                    </span>
                  </div>
                  <span className={`text-xs ${c.blocked ? 'text-muted' : 'text-gold'}`}>
                    {c.blocked ? 'Wartet' : `Q ${c.quality}`}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{c.thesis}</p>
                {!c.blocked && (
                  <p className="mt-2 font-mono text-[11px] text-ink/80">
                    SL {n2(c.stopLoss)} · TP1 {n2(c.tp1)} · TP2 {n2(c.tp2)} · R:R {n2(c.rewardToRisk)}
                  </p>
                )}
                {c.blocked && <p className="mt-1 text-[11px] text-down">{c.blocked}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-medium">Offene Positionen</h2>
          {state.positions.length === 0 && <p className="text-sm text-muted">Keine offenen Positionen.</p>}
          <div className="space-y-3">
            {state.positions.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {p.display} {p.side === 'long' ? <ArrowUpRight className="inline h-4 w-4 text-up" /> : <ArrowDownRight className="inline h-4 w-4 text-down" />}
                  </span>
                  <span className="text-xs text-muted">{strategyName[p.strategy]}</span>
                </div>
                <p className="mt-2 font-mono text-[11px]">
                  Entry {n2(p.entry)} · SL {n2(p.stopLoss)} · TP1 {n2(p.tp1)}
                  {p.tp1Filled ? ' ✓' : ''} · TP2 {n2(p.tp2)}
                  {p.tp2Filled ? ' ✓' : ''}
                </p>
                <p className="mt-1 text-xs text-muted">{p.plan.invalidation}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Journal</h2>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2">Zeit</th>
                  <th>Markt</th>
                  <th>Aktion</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {state.trades.map((t) => (
                  <tr key={t.id} className="border-t border-line/80">
                    <td className="py-2 text-muted">{when(t.at)}</td>
                    <td>{t.display}</td>
                    <td className="uppercase text-muted">{t.action}</td>
                    <td className={`num ${t.pnlEur >= 0 ? 'text-up' : 'text-down'}`}>{signedMoney(t.pnlEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.trades.length === 0 && <p className="text-sm text-muted">Noch keine Trades – Qualität vor Frequenz.</p>}
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-medium">Selbsttest & Lernen</h2>
          {state.selfTest ? (
            <div className="space-y-1 text-sm text-muted">
              <p>Trades im Test: {state.selfTest.trades}</p>
              <p>Winrate: {n2(state.selfTest.winRate * 100)} %</p>
              <p>Profit-Faktor: {n2(state.selfTest.profitFactor)}</p>
              <p className="text-ink">{state.selfTest.recommendation}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Selbsttest startet, sobald genug Kerzen da sind.</p>
          )}
          <div className="mt-3 space-y-2">
            {state.ruleChanges.slice(0, 5).map((c) => (
              <div key={c.id} className="rounded-lg bg-black/20 p-2">
                <p className="text-xs text-gold">{c.title}</p>
                <p className="text-[11px] text-muted">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Mail className="h-4 w-4 text-gold" /> E-Mail
          </h2>
          <p className="mb-2 text-xs text-muted">
            {state.email.configured ? 'SMTP ist gesetzt.' : 'SMTP in .env setzen (SMTP_HOST, ALERT_EMAIL_TO).'} Aktuell:{' '}
            {settings.alertEmail || 'keine Adresse'}
          </p>
          <div className="flex gap-2">
            <input
              className="min-h-10 flex-1 rounded-lg border border-line bg-black/30 px-3 text-sm outline-none focus:border-gold"
              placeholder="alerts@du.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="btn-ghost"
              disabled={busy || !email.includes('@')}
              onClick={() => void run(async () => {
                await api.settings({ alertEmail: email, emailEveryTrade: true });
                return { ok: true, message: 'E-Mail gespeichert' };
              })}
            >
              Speichern
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Toggle
              label="Krypto"
              on={settings.allowCrypto}
              onClick={() => void api.settings({ allowCrypto: !settings.allowCrypto }).then(() => refresh())}
            />
            <Toggle
              label="Aktien"
              on={settings.allowStocks}
              onClick={() => void api.settings({ allowStocks: !settings.allowStocks }).then(() => refresh())}
            />
            <Toggle
              label="Shorts"
              on={settings.allowShorts}
              onClick={() => void api.settings({ allowShorts: !settings.allowShorts }).then(() => refresh())}
            />
          </div>
          <button className="btn-ghost mt-4" onClick={() => void run(() => api.resetPaper())}>
            <RefreshCw className="h-4 w-4" /> Paper auf 100 € zurücksetzen
          </button>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-sm font-medium">Märkte</h2>
          <div className="max-h-64 overflow-auto text-xs">
            {state.markets.map((m) => (
              <div key={m.instrumentId} className="flex items-center justify-between border-b border-line/60 py-1.5">
                <span>
                  {m.display} <span className="text-muted">{m.assetClass}</span>
                </span>
                <span className={`num ${m.changePct >= 0 ? 'text-up' : 'text-down'}`}>{pct(m.changePct)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-medium">Protokoll</h2>
        <div className="max-h-48 overflow-auto font-mono text-[11px] text-muted">
          {state.logs
            .slice()
            .reverse()
            .map((l, i) => (
              <div key={`${l.t}-${i}`}>
                <span className="text-gold/70">{when(l.t)}</span> [{l.scope}] {l.message}
              </div>
            ))}
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-5 right-5 rounded-xl border border-line bg-[#12130f] px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}

      <style>{`
        .btn-gold, .btn-ghost {
          display: inline-flex; align-items: center; gap: 0.4rem;
          min-height: 40px; padding: 0 14px; border-radius: 12px;
          font-size: 13px; font-weight: 500; cursor: pointer;
        }
        .btn-gold { background: #c6a36a; color: #1a140c; border: 0; }
        .btn-ghost { background: transparent; color: #e8e4d9; border: 1px solid #2a261c; }
        .btn-gold:disabled, .btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="panel p-4">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 font-serif text-2xl ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : ''}`}>{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function Li({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span>{k}</span>
      <span className="num text-ink">{v}</span>
    </li>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 ${on ? 'border-gold text-gold' : 'border-line text-muted'}`}
    >
      {label}
    </button>
  );
}

function ModeChip({
  mode,
  liveReady,
  blockers,
  disabled,
  onMode,
  onBlocked,
}: {
  mode: TradingMode;
  liveReady: boolean;
  blockers: string[];
  disabled: boolean;
  onMode: (m: TradingMode) => void;
  onBlocked: (msg: string) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-line">
      <button
        className={`px-3 py-2 text-xs ${mode === 'paper' ? 'bg-gold text-[#1a140c]' : 'text-muted'}`}
        disabled={disabled}
        onClick={() => onMode('paper')}
      >
        Paper 100 €
      </button>
      <button
        className={`px-3 py-2 text-xs ${mode === 'live' ? 'bg-down text-white' : 'text-muted'}`}
        disabled={disabled}
        onClick={() => {
          if (!liveReady) {
            onBlocked(`Live noch nicht bereit: ${blockers.join(' · ') || 'API-Schlüssel in .env setzen'}`);
            return;
          }
          if (confirm('Echtgeld-Modus aktivieren? Der Bot nutzt dieselben Schutzregeln, aber echtes Kapital.')) onMode('live');
        }}
      >
        Live
      </button>
    </div>
  );
}

function UrlList({
  icon,
  title,
  urls,
  onCopy,
  copyable = true,
}: {
  icon: ReactNode;
  title: string;
  urls: string[];
  onCopy: (msg: string) => void;
  copyable?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium">
        {icon}
        {title}
      </p>
      <ul className="space-y-1">
        {urls.map((u) => (
          <li key={u} className="flex items-center justify-between gap-2">
            <span className="num break-all text-xs text-ink">{u}</span>
            {copyable && u.startsWith('http') && (
              <button
                type="button"
                className="btn-ghost !min-h-8 !px-2"
                onClick={() => {
                  void navigator.clipboard.writeText(u).then(
                    () => onCopy(`Kopiert: ${u}`),
                    () => onCopy(u),
                  );
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
