import { config } from '../config.js';
import { db } from '../store/db.js';
import { bus } from '../util/bus.js';
import { createLogger, recentLogs } from '../util/logger.js';
import { nowDayStamp, round, uid } from '../util/num.js';
import { UNIVERSE, instrumentById } from '../market/universe.js';
import { allSnapshots, getCandles, lastPriceEur, lastVenue, refreshUniverse, usSessionOpen } from '../market/feed.js';
import { detectRegime } from '../market/regime.js';
import { usdToEur, usdtToEur } from '../market/fx.js';
import { collectSignals } from '../strategy/signals.js';
import { buildPlan, pickBias } from '../strategy/plan.js';
import { checkGlobalRisk, consecutiveLosses, portfolioFrom } from './risk.js';
import { sizePosition } from './sizing.js';
import { decideExit, markToMarket, trailFrom } from './exits.js';
import { adaptRules } from '../learning/adapt.js';
import { runSelfTest } from '../learning/selftest.js';
import { sendAlert, emailStatus } from '../notify/email.js';
import { liveBlockers, placeBinanceExit, placeBinanceMarket } from './live.js';
import type {
  AccountSlice,
  BotStatus,
  Candidate,
  DashboardState,
  Position,
  Regime,
  Trade,
  TradingMode,
} from '../types.js';

const log = createLogger('engine');

class Engine {
  private running = false;
  private haltReason: string | null = null;
  private startedAt: number | null = null;
  private lastTickAt: number | null = null;
  private lastScanAt: number | null = null;
  private cycles = 0;
  private cooldownUntil: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  private busy = false;
  private regime: Regime = 'range';
  private candidates: Candidate[] = [];
  private lastSelfTestAt = 0;

  bootstrap(): void {
    void this.tickSafe();
    this.timers.push(setInterval(() => void this.tickSafe(), config.intervals.tick));
    this.timers.push(setInterval(() => void this.selfTestSafe(), config.intervals.selfTest));
    this.timers.push(setInterval(() => void this.digestSafe(), config.intervals.digest));
    if (db.data.runtime.shouldRun) {
      void this.start(true);
    }
  }

  shutdown(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  status(): BotStatus {
    return {
      running: this.running,
      mode: db.data.settings.tradingMode,
      haltReason: this.haltReason,
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      lastScanAt: this.lastScanAt,
      cyclesCompleted: this.cycles,
      consecutiveLosses: consecutiveLosses(this.trades()),
      cooldownUntil: this.cooldownUntil,
      regime: this.regime,
      activeStrategyBias: pickBias(this.regime),
      paperDefault: true,
    };
  }

  dashboard(): DashboardState {
    const mode = db.data.settings.tradingMode;
    const open = this.openPositions();
    const mtm = open.reduce((a, p) => a + this.mtmEur(p), 0);
    const account = this.account();
    return {
      status: this.status(),
      settings: db.data.settings,
      rules: db.data.rules,
      portfolio: portfolioFrom(mode, account, open, mtm),
      positions: open,
      trades: this.trades().slice(-80).reverse(),
      candidates: this.candidates.slice(0, 12),
      markets: allSnapshots(),
      logs: recentLogs(100),
      equityCurve: db.data.equityCurve.filter((e) => e.mode === mode).slice(-400),
      ruleChanges: db.data.ruleChanges.slice(-20).reverse(),
      selfTest: db.data.selfTest,
      live: { ready: liveBlockers().length === 0, blockers: liveBlockers() },
      email: emailStatus(),
    };
  }

  async start(resumed = false): Promise<{ ok: boolean; message: string }> {
    if (this.running) return { ok: true, message: 'Bot läuft bereits' };
    if (db.data.settings.tradingMode === 'live') {
      const b = liveBlockers();
      if (b.length) return { ok: false, message: `Live nicht bereit: ${b.join(' · ')}` };
      if (!db.data.settings.liveArmed) return { ok: false, message: 'Live ist nicht scharf geschaltet' };
    }
    this.running = true;
    this.haltReason = null;
    this.startedAt = Date.now();
    if (!resumed) this.cooldownUntil = null;
    db.update((d) => {
      d.runtime.shouldRun = true;
    });
    const mode = db.data.settings.tradingMode;
    log.success(resumed ? `Handel nach Neustart fortgesetzt (${mode})` : `Bot gestartet (${mode}, Paper-Start 100 €)`);
    void sendAlert(
      resumed ? 'Handel fortgesetzt' : 'Bot gestartet',
      `Modus: ${mode}. Paper-Kapital ${db.data.paper.cashEur.toFixed(2)} €. Der Bot nimmt nur Trades mit vollständigem Plan (SL, TP1, TP2).`,
    );
    this.emit();
    return { ok: true, message: `Gestartet (${mode})` };
  }

  stop(reason = 'Manuell gestoppt'): { ok: boolean; message: string } {
    db.update((d) => {
      d.runtime.shouldRun = false;
    });
    this.running = false;
    this.haltReason = reason;
    log.warn(reason);
    void sendAlert('Bot gestoppt', reason);
    this.emit();
    return { ok: true, message: reason };
  }

  async setMode(mode: TradingMode): Promise<{ ok: boolean; message: string }> {
    if (mode === db.data.settings.tradingMode) return { ok: true, message: `Bereits ${mode}` };
    if (mode === 'live') {
      const b = liveBlockers();
      if (b.length) return { ok: false, message: b.join(' · ') };
    }
    if (this.running) this.stop('Moduswechsel');
    db.update((d) => {
      d.settings.tradingMode = mode;
      if (mode === 'live') d.settings.liveArmed = true;
    });
    log.info(`Modus: ${mode}`);
    this.emit();
    return { ok: true, message: `Modus ${mode}` };
  }

  armLive(armed: boolean): { ok: boolean; message: string } {
    db.update((d) => {
      d.settings.liveArmed = armed;
      if (!armed && d.settings.tradingMode === 'live') d.settings.tradingMode = 'paper';
    });
    return { ok: true, message: armed ? 'Live scharf – zusätzlicher Start nötig' : 'Live entsichert' };
  }

  patchSettings(patch: Record<string, unknown>): typeof db.data.settings {
    db.update((d) => {
      Object.assign(d.settings, patch);
    });
    this.emit();
    return db.data.settings;
  }

  private account(): AccountSlice {
    return db.data.settings.tradingMode === 'live' ? db.data.live : db.data.paper;
  }

  private openPositions(): Position[] {
    const mode = db.data.settings.tradingMode;
    return db.data.positions.filter((p) => p.mode === mode && p.remainingQty > 0);
  }

  private trades(): Trade[] {
    const mode = db.data.settings.tradingMode;
    return db.data.trades.filter((t) => t.mode === mode);
  }

  private quoteToEur(instrumentId: string, px: number): number {
    const inst = instrumentById(instrumentId);
    if (!inst || inst.assetClass === 'crypto') return usdtToEur(px);
    return usdToEur(px);
  }

  private lastQuote(instrumentId: string): number | undefined {
    const cs = getCandles(instrumentId);
    return cs.at(-1)?.c;
  }

  private mtmEur(p: Position): number {
    const px = this.lastQuote(p.instrumentId);
    if (!px) return 0;
    const usdt = markToMarket(p.side, p.entry, px, p.remainingQty);
    return this.quoteToEur(p.instrumentId, usdt + p.entry * p.remainingQty) - this.quoteToEur(p.instrumentId, p.entry * p.remainingQty);
  }

  private async tickSafe(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.tick();
    } catch (err) {
      log.error(`Tick: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async tick(): Promise<void> {
    this.rollDay();
    await refreshUniverse({
      crypto: db.data.settings.allowCrypto,
      stocks: db.data.settings.allowStocks,
    });
    const btc = getCandles('BTCUSDT');
    const view = detectRegime(btc);
    this.regime = view.regime;

    await this.manageExits();
    if (this.running) await this.scanEntries();

    this.lastTickAt = Date.now();
    this.cycles += 1;
    this.recordEquity();
    if (this.cycles % 8 === 0) this.learn();
    this.emit();
  }

  private rollDay(): void {
    const stamp = nowDayStamp();
    db.update((d) => {
      for (const key of ['paper', 'live'] as const) {
        const acc = d[key];
        if (acc.entriesDayStamp !== stamp) {
          acc.entriesDayStamp = stamp;
          acc.entriesToday = 0;
          const open = d.positions.filter((p) => p.mode === (key === 'paper' ? 'paper' : 'live'));
          const mtm = open.reduce((a, p) => a + this.mtmEur(p), 0);
          acc.dayStartEquityEur = acc.cashEur + mtm;
          acc.dayStartedAt = Date.now();
        }
      }
    });
  }

  private recordEquity(): void {
    const dash = this.dashboard();
    db.update((d) => {
      d.equityCurve.push({ t: Date.now(), equityEur: dash.portfolio.equityEur, mode: dash.status.mode });
      if (d.equityCurve.length > 2000) d.equityCurve.splice(0, d.equityCurve.length - 2000);
      const acc = dash.status.mode === 'live' ? d.live : d.paper;
      acc.peakEquityEur = Math.max(acc.peakEquityEur, dash.portfolio.equityEur);
    });
  }

  private async manageExits(): Promise<void> {
    for (const pos of this.openPositions()) {
      const px = this.lastQuote(pos.instrumentId);
      if (!px) continue;
      pos.highWater = Math.max(pos.highWater, px);
      pos.lowWater = Math.min(pos.lowWater || px, px);
      if (pos.tp1Filled) {
        const trail = trailFrom(pos, px);
        if (pos.side === 'long') pos.stopLoss = Math.max(pos.stopLoss, pos.entry, trail);
        else pos.stopLoss = Math.min(pos.stopLoss, pos.entry, trail);
      }
      const d = decideExit(pos, px);
      if (d.kind === 'none' || d.qty <= 0) continue;
      await this.closeSlice(pos, px, d.qty, d.kind, d.reason);
    }
  }

  private async closeSlice(
    pos: Position,
    px: number,
    qty: number,
    kind: Exclude<Trade['action'], 'open' | 'manual' | 'halt'> | 'stop' | 'tp1' | 'tp2' | 'trail' | 'time',
    note: string,
  ): Promise<void> {
    qty = Math.min(qty, pos.remainingQty);
    if (qty <= 0) return;
    if (pos.mode === 'live') {
      const inst = instrumentById(pos.instrumentId);
      if (inst?.binance) {
        const live = await placeBinanceExit({ symbol: inst.binance, side: pos.side, qty });
        if (!live.ok) {
          log.error(`Live-Exit fehlgeschlagen: ${live.message}`);
          return;
        }
      }
    }
    const dir = pos.side === 'long' ? 1 : -1;
    const lockedEur = this.quoteToEur(pos.instrumentId, pos.entry * qty);
    const quotePnl = (px - pos.entry) * dir * qty;
    const pnlEur =
      this.quoteToEur(pos.instrumentId, pos.entry * qty + quotePnl) -
      this.quoteToEur(pos.instrumentId, pos.entry * qty);
    const exitNotionalEur = this.quoteToEur(pos.instrumentId, px * qty);
    const feeEur = exitNotionalEur * (pos.plan.feePct / 2);
    const net = pnlEur - feeEur;
    const r = pos.plan.riskEur ? net / pos.plan.riskEur : 0;

    db.update((d) => {
      const p = d.positions.find((x) => x.id === pos.id);
      if (!p) return;
      p.remainingQty -= qty;
      p.realizedEur += net;
      p.feesPaidEur += feeEur;
      if (kind === 'tp1') {
        p.tp1Filled = true;
        p.stopLoss = p.entry;
        p.status = 'partial';
      }
      if (kind === 'tp2') p.tp2Filled = true;
      if (p.remainingQty <= p.qty * 0.02) p.remainingQty = 0;
      const acc = p.mode === 'live' ? d.live : d.paper;
      acc.cashEur += lockedEur + pnlEur - feeEur;
      acc.realizedPnlEur += net;
      d.trades.push({
        id: uid('tr'),
        positionId: p.id,
        mode: p.mode,
        instrumentId: p.instrumentId,
        display: p.display,
        venue: p.venue,
        strategy: p.strategy,
        regime: p.regime,
        side: p.side,
        action: kind,
        qty,
        price: px,
        pnlEur: round(net, 4),
        feeEur: round(feeEur, 4),
        rMultiple: round(r, 3),
        quality: p.plan.quality,
        at: Date.now(),
        note,
      });
      if (p.remainingQty <= 0) {
        d.positions = d.positions.filter((x) => x.id !== p.id);
      }
    });

    const msg = `${kind.toUpperCase()} ${pos.display} ${net >= 0 ? '+' : ''}${net.toFixed(2)} € · ${note}`;
    if (net >= 0) log.success(msg);
    else log.warn(msg);

    if (kind === 'stop') {
      const losses = consecutiveLosses(this.trades());
      if (losses >= db.data.rules.consecutiveLossPause) {
        this.cooldownUntil = Date.now() + 3 * 60 * 60_000;
        log.warn(`${losses} Verluste in Folge – 3h Pause für neue Einstiege`);
        void sendAlert('Verlustserie', `${losses} Verluste hintereinander. Neue Einstiege pausiert. Offene Positionen bleiben geschützt.`);
      }
    }

    if (db.data.settings.emailEveryTrade) {
      void sendAlert(`Trade ${pos.display}`, `${note}\nPnL: ${net.toFixed(2)} €\nStrategie: ${pos.strategy}\n${pos.plan.thesis}`);
    }
  }

  private async scanEntries(): Promise<void> {
    this.lastScanAt = Date.now();
    const mode = db.data.settings.tradingMode;
    const account = this.account();
    const open = this.openPositions();
    const equity = account.cashEur + open.reduce((a, p) => a + this.mtmEur(p), 0);
    const global = checkGlobalRisk({
      rules: db.data.rules,
      account,
      equityEur: equity,
      open,
      recent: this.trades(),
      consecutiveLosses: consecutiveLosses(this.trades()),
      cooldownUntil: this.cooldownUntil,
    });

    const found: Candidate[] = [];
    const allowStocks = db.data.settings.allowStocks && usSessionOpen();

    for (const inst of UNIVERSE) {
      if (inst.assetClass === 'crypto' && !db.data.settings.allowCrypto) continue;
      if (inst.assetClass !== 'crypto' && !allowStocks) continue;
      if (open.some((p) => p.instrumentId === inst.id)) continue;
      const cs = getCandles(inst.id);
      const px = cs.at(-1)?.c;
      if (!px) continue;
      const signals = collectSignals(cs, this.regime, db.data.settings.allowShorts);
      for (const signal of signals) {
        if (db.data.rules.preferMeanReversion && signal.strategy === 'meanReversion') {
          signal.strength += 6;
        }
        const venue = lastVenue(inst.id);
        const plan = buildPlan({
          instrument: inst,
          venue,
          price: px,
          regime: this.regime,
          signal,
          rules: db.data.rules,
        });
        if (!plan) continue;
        const cand: Candidate = { ...plan };
        if (plan.quality < db.data.rules.minQuality) {
          cand.blocked = `Qualität ${plan.quality} < ${db.data.rules.minQuality}`;
        }
        found.push(cand);
      }
    }

    found.sort((a, b) => b.quality - a.quality);
    const top = found[0];
    const second = found[1];
    if (top && second && top.quality >= 82 && top.quality - second.quality >= 10) {
      for (const c of found) {
        if (c.instrumentId !== top.instrumentId) c.blocked = c.blocked ?? 'High-Conviction: anderes Setup klar besser';
      }
    }
    this.candidates = found;

    if (!global.allowed) {
      log.info(`Kein Einstieg: ${global.reason}`);
      return;
    }

    const pick = found.find((c) => !c.blocked);
    if (!pick) {
      log.info('Kein Setup mit vollständigem Plan und Qualitätsschwelle');
      return;
    }

    const sized = sizePosition({
      equityEur: equity,
      cashEur: account.cashEur,
      rules: db.data.rules,
      entry: this.quoteToEur(pick.instrumentId, pick.entry),
      stopLoss: this.quoteToEur(pick.instrumentId, pick.stopLoss),
      side: pick.side,
      venue: pick.venue,
      openCount: open.length,
    });
    if (!sized.ok) {
      pick.blocked = sized.reason;
      log.info(`${pick.display}: ${sized.reason}`);
      return;
    }

    pick.notionalEur = sized.notionalEur;
    pick.feeEur = sized.feeEur;
    pick.riskEur = sized.riskEur;

    const qty = sized.notionalEur / this.quoteToEur(pick.instrumentId, pick.entry);

    if (mode === 'live') {
      const inst = instrumentById(pick.instrumentId);
      if (!inst?.binance) {
        log.info(`${pick.display}: Live nur über Binance Spot (Aktien bleiben Paper/Alpaca)`);
        if (inst?.assetClass !== 'crypto') {
          // stocks live via alpaca not fully wired for orders yet – keep paper accounting skipped
        }
      } else {
        const usdt = pick.entry * qty;
        const live = await placeBinanceMarket({ symbol: inst.binance, side: pick.side, quoteUsdt: usdt });
        if (!live.ok) {
          log.error(`Live-Order abgelehnt: ${live.message}`);
          return;
        }
      }
    }

    const pos: Position = {
      id: uid('pos'),
      mode,
      instrumentId: pick.instrumentId,
      display: pick.display,
      assetClass: instrumentById(pick.instrumentId)?.assetClass ?? 'crypto',
      venue: pick.venue,
      strategy: pick.strategy,
      regime: pick.regime,
      side: pick.side,
      status: 'open',
      qty,
      entry: pick.entry,
      remainingQty: qty,
      stopLoss: pick.stopLoss,
      tp1: pick.tp1,
      tp2: pick.tp2,
      tp1Filled: false,
      tp2Filled: false,
      trailPct: pick.runnerTrailPct,
      highWater: pick.entry,
      lowWater: pick.entry,
      openedAt: Date.now(),
      plan: { ...pick, notionalEur: sized.notionalEur, feeEur: sized.feeEur, riskEur: sized.riskEur },
      feesPaidEur: sized.feeEur,
      realizedEur: 0,
    };

    db.update((d) => {
      d.positions.push(pos);
      const acc = mode === 'live' ? d.live : d.paper;
      acc.cashEur -= sized.notionalEur + sized.feeEur;
      acc.entriesToday += 1;
      d.trades.push({
        id: uid('tr'),
        positionId: pos.id,
        mode,
        instrumentId: pos.instrumentId,
        display: pos.display,
        venue: pos.venue,
        strategy: pos.strategy,
        regime: pos.regime,
        side: pos.side,
        action: 'open',
        qty,
        price: pick.entry,
        pnlEur: 0,
        feeEur: sized.feeEur,
        rMultiple: 0,
        quality: pick.quality,
        at: Date.now(),
        note: pick.thesis,
      });
    });

    log.success(
      `Einstieg ${pick.display} ${pick.side} @ Plan-Qualität ${pick.quality} · ${sized.notionalEur.toFixed(2)} € · ${pick.strategy}`,
    );
    log.info(pick.thesis);
  }

  private learn(): void {
    const { rules, changes } = adaptRules(db.data.rules, this.trades());
    if (!changes.length) return;
    db.update((d) => {
      d.rules = rules;
      d.ruleChanges.push(...changes);
      if (d.ruleChanges.length > 80) d.ruleChanges.splice(0, d.ruleChanges.length - 80);
    });
    for (const c of changes) {
      log.warn(`Regeländerung: ${c.title} – ${c.detail}`);
      void sendAlert(`Regeländerung: ${c.title}`, c.detail);
    }
  }

  private async selfTestSafe(): Promise<void> {
    try {
      const btc = getCandles('BTCUSDT');
      if (btc.length < 120) return;
      const inst = instrumentById('BTCUSDT')!;
      const report = runSelfTest(inst, btc, 'binance', db.data.rules);
      db.update((d) => {
        d.selfTest = report;
      });
      this.lastSelfTestAt = Date.now();
      log.info(
        `Selbsttest: ${report.trades} Trades, Winrate ${(report.winRate * 100).toFixed(0)} %, PF ${report.profitFactor.toFixed(2)} – ${report.recommendation}`,
      );
      if (report.expectancyEur < 0) {
        const before = db.data.rules.minQuality;
        db.update((d) => {
          d.rules.minQuality = Math.min(90, d.rules.minQuality + 2);
          d.ruleChanges.push({
            id: uid('rule'),
            at: Date.now(),
            title: 'Selbsttest negativ',
            detail: report.recommendation,
            before: { minQuality: before },
            after: { minQuality: d.rules.minQuality },
          });
        });
        void sendAlert('Selbsttest negativ', report.recommendation);
      }
      this.emit();
    } catch (err) {
      log.warn(`Selbsttest: ${(err as Error).message}`);
    }
  }

  private async digestSafe(): Promise<void> {
    const p = this.dashboard().portfolio;
    void sendAlert(
      'Tagesbericht',
      `Equity ${p.equityEur.toFixed(2)} € · Tag ${p.dayPnlEur.toFixed(2)} € (${p.dayPnlPct.toFixed(2)} %) · Gesamt ${p.totalPnlPct.toFixed(2)} %.\nOffene Positionen: ${this.openPositions().length}.`,
    );
  }

  resetPaper(): { ok: boolean; message: string } {
    db.update((d) => {
      const start = d.settings.paperStartEur || 100;
      d.paper = {
        cashEur: start,
        startEquityEur: start,
        dayStartEquityEur: start,
        dayStartedAt: Date.now(),
        peakEquityEur: start,
        realizedPnlEur: 0,
        entriesToday: 0,
        entriesDayStamp: nowDayStamp(),
      };
      d.positions = d.positions.filter((p) => p.mode !== 'paper');
      d.trades = d.trades.filter((t) => t.mode !== 'paper');
      d.equityCurve = d.equityCurve.filter((e) => e.mode !== 'paper');
    });
    log.info('Paper-Konto auf 100 € zurückgesetzt');
    this.emit();
    return { ok: true, message: 'Paper auf 100 € zurückgesetzt' };
  }

  private emit(): void {
    bus.emitState(this.dashboard());
  }
}

export const engine = new Engine();
