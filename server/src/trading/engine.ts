import { config } from '../config.js';
import { db } from '../store/db.js';
import { bus } from '../util/bus.js';
import { createLogger } from '../util/logger.js';
import { clamp, round } from '../util/num.js';
import { getIntel, refreshIntel } from '../intel/index.js';
import { getCandidates, runScan } from '../scanner/index.js';
import { fetchPairSnapshot } from '../scanner/dexscreener.js';
import { checkSecurity } from '../scanner/security.js';
import { portfolio } from './portfolio.js';
import { checkCandidate, checkGlobalRisk, positionSizeUsd, type RiskContext } from './risk.js';
import { PaperExecutor } from './executor/paper.js';
import { LiveExecutor } from './executor/live.js';
import { hotWallet } from '../chain/hot.js';
import { sweepToNative } from '../chain/deposits.js';
import type { Executor } from './executor/types.js';
import type { BotSettings, BotStatus, Position, ScoredCandidate, TradingMode } from '../types.js';

const log = createLogger('engine');

const paperExecutor = new PaperExecutor();
const liveExecutor = new LiveExecutor();

interface ExitDecision {
  fraction: number;
  reason: string;
  urgent: boolean;
}

class Engine {
  private running = false;
  private haltReason: string | null = null;
  private startedAt: number | null = null;
  private lastTickAt: number | null = null;
  private lastScanAt: number | null = null;
  private cyclesCompleted = 0;
  private cooldownUntil: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  private busy = false;
  private scanning = false;
  private lockedWarningAt = 0;
  /** Positionen die gerade verkauft werden – verhindert doppelte Orders. */
  private selling = new Set<string>();

  get settings(): BotSettings {
    return db.data.settings;
  }

  get mode(): TradingMode {
    return this.settings.tradingMode;
  }

  get executor(): Executor {
    return this.mode === 'live' ? liveExecutor : paperExecutor;
  }

  status(): BotStatus {
    return {
      running: this.running,
      mode: this.mode,
      haltReason: this.haltReason,
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      lastScanAt: this.lastScanAt,
      cyclesCompleted: this.cyclesCompleted,
      consecutiveLosses: portfolio.consecutiveLosses(this.mode),
      cooldownUntil: this.cooldownUntil,
    };
  }

  private emitStatus(): void {
    bus.emitEvent('status', this.status());
  }

  /** Hintergrundaufgaben laufen immer, damit das Dashboard auch bei gestopptem Bot lebt. */
  bootstrap(): void {
    void this.refreshIntelSafe();
    void this.scanSafe();

    this.timers.push(setInterval(() => void this.refreshIntelSafe(), config.intervals.intel));
    this.timers.push(setInterval(() => void this.scanSafe(), config.intervals.scan));
    this.timers.push(setInterval(() => void this.tickSafe(), config.intervals.tick));

    // Nach einem Neustart den Handel fortsetzen, wenn er zuvor lief – sonst
    // stuende der Bot nach einem Absturz unbemerkt still.
    if (db.data.runtime.shouldRun) {
      void this.start(true).then((result) => {
        if (!result.ok) log.warn(`Automatischer Neustart des Handels nicht möglich: ${result.message}`);
      });
    }
  }

  shutdown(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  async start(resumed = false): Promise<{ ok: boolean; message: string }> {
    if (this.running) return { ok: true, message: 'Bot läuft bereits' };

    const blockers = await this.executor.blockers();
    if (blockers.length > 0) {
      const message = `Start nicht möglich: ${blockers.join(' · ')}`;
      log.error(message);
      return { ok: false, message };
    }

    this.running = true;
    this.haltReason = null;
    this.startedAt = Date.now();
    db.update((draft) => {
      draft.runtime.shouldRun = true;
    });
    log.success(
      `${resumed ? 'Handel nach Neustart fortgesetzt' : 'Bot gestartet'} im ${this.mode === 'live' ? 'LIVE' : 'PAPER'}-Modus`,
    );
    this.emitStatus();
    void this.tickSafe();
    return { ok: true, message: `Bot gestartet (${this.mode})` };
  }

  /**
   * Stoppt ausschliesslich neue Einstiege. Offene Positionen bleiben durch
   * Stop-Loss, Trailing-Stop und Notausstieg weiter geschuetzt.
   */
  stop(reason = 'Manuell gestoppt'): void {
    db.update((draft) => {
      draft.runtime.shouldRun = false;
    });
    if (!this.running) return;
    this.running = false;
    this.haltReason = reason;
    const open = portfolio.openPositions(this.mode).length;
    log.warn(
      open > 0
        ? `Bot gestoppt: ${reason} – ${open} offene Position(en) bleiben durch das Risikomanagement überwacht`
        : `Bot gestoppt: ${reason}`,
    );
    this.emitStatus();
  }

  async setMode(mode: TradingMode): Promise<{ ok: boolean; message: string }> {
    if (mode === this.mode) return { ok: true, message: `Modus ist bereits ${mode}` };
    if (this.running) this.stop('Moduswechsel');

    if (mode === 'live') {
      const blockers = await liveExecutor.blockers();
      if (blockers.length > 0) {
        return { ok: false, message: `Live-Modus nicht bereit: ${blockers.join(' · ')}` };
      }
    }

    db.update((draft) => {
      draft.settings.tradingMode = mode;
    });
    log.info(`Handelsmodus auf ${mode.toUpperCase()} gesetzt`);
    this.emitStatus();
    return { ok: true, message: `Modus auf ${mode} gesetzt` };
  }

  updateSettings(patch: Partial<BotSettings>): BotSettings {
    db.update((draft) => {
      const s = draft.settings;
      if (patch.maxOpenPositions !== undefined) s.maxOpenPositions = clamp(patch.maxOpenPositions, 1, 10);
      if (patch.riskPerTradePct !== undefined) s.riskPerTradePct = clamp(patch.riskPerTradePct, 1, 100);
      if (patch.stopLossPct !== undefined) s.stopLossPct = clamp(patch.stopLossPct, 2, 90);
      if (patch.takeProfitPct !== undefined) s.takeProfitPct = clamp(patch.takeProfitPct, 3, 500);
      if (patch.trailingStopPct !== undefined) s.trailingStopPct = clamp(patch.trailingStopPct, 2, 90);
      if (patch.maxHoldMinutes !== undefined) s.maxHoldMinutes = clamp(patch.maxHoldMinutes, 1, 1440);
      if (patch.dailyLossLimitPct !== undefined) s.dailyLossLimitPct = clamp(patch.dailyLossLimitPct, 1, 100);
      if (patch.maxDrawdownPct !== undefined) s.maxDrawdownPct = clamp(patch.maxDrawdownPct, 1, 100);
      if (patch.minLiquidityUsd !== undefined) s.minLiquidityUsd = clamp(patch.minLiquidityUsd, 1_000, 50_000_000);
      if (patch.maxSlippagePct !== undefined) s.maxSlippagePct = clamp(patch.maxSlippagePct, 0.1, 50);
      if (patch.minEntryScore !== undefined) s.minEntryScore = clamp(patch.minEntryScore, 0, 100);
      if (patch.scanChains !== undefined && patch.scanChains.length > 0) s.scanChains = patch.scanChains;
    });
    log.info('Einstellungen aktualisiert');
    return this.settings;
  }

  private async refreshIntelSafe(): Promise<void> {
    try {
      await refreshIntel();
    } catch (err) {
      log.error(`Marktdaten konnten nicht geladen werden: ${(err as Error).message}`);
    }
  }

  private async scanSafe(): Promise<void> {
    // Ein Scan kann laenger dauern als das Intervall (langsame Security-APIs);
    // parallele Durchlaeufe wuerden die Rate-Limits sprengen.
    if (this.scanning) return;
    this.scanning = true;
    try {
      const cooldowns = new Map(Object.entries(db.data.cooldowns));
      await runScan({
        chains: this.settings.scanChains,
        intel: getIntel(),
        minLiquidityUsd: this.settings.minLiquidityUsd,
        liveChain: this.mode === 'live' ? config.chain.dexscreenerId : null,
        blacklist: new Set(db.data.blacklist),
        cooldowns,
      });
      this.lastScanAt = Date.now();
      this.emitStatus();
    } catch (err) {
      log.error(`Scan fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      this.scanning = false;
    }
  }

  private async riskContext(): Promise<RiskContext> {
    const availableCashUsd = await this.executor.availableCashUsd();
    const state = portfolio.markEquity(this.mode, this.mode === 'live' ? availableCashUsd : 0);
    return {
      settings: this.settings,
      intel: getIntel(),
      state,
      availableCashUsd,
      consecutiveLosses: portfolio.consecutiveLosses(this.mode),
      cooldownUntil: this.cooldownUntil,
    };
  }

  private async tickSafe(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.tick();
    } catch (err) {
      log.error(`Tick fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async tick(): Promise<void> {
    this.lastTickAt = Date.now();

    if (hotWallet.unlocked) {
      try {
        await sweepToNative();
      } catch {
        // Einzahlungen bleiben liegen und werden im naechsten Tick erneut versucht.
      }
    }

    await this.updatePositions();

    const ctx = await this.riskContext();

    // Risikomanagement laeuft immer. "Gestoppt" bedeutet ausdruecklich nur
    // "keine neuen Einstiege" – offene Positionen behalten ihren Stop-Loss,
    // ihren Trailing-Stop und den Notausstieg bei Liquiditaetseinbruch. Alles
    // andere wuerde bestehendes Kapital genau dann ungeschuetzt lassen, wenn
    // es am gefaehrlichsten ist.
    if (this.canExit()) await this.manageExits(ctx);

    if (this.running) {
      await this.considerEntries(ctx);
      this.cyclesCompleted++;
    }

    this.emitStatus();
  }

  /** Im Live-Modus sind Verkaeufe ohne entsperrtes Wallet technisch unmoeglich. */
  private canExit(): boolean {
    if (this.mode !== 'live') return true;
    if (hotWallet.unlocked) return true;

    const open = portfolio.openPositions('live').length;
    if (open > 0 && Date.now() - this.lockedWarningAt > 5 * 60_000) {
      this.lockedWarningAt = Date.now();
      log.warn(
        `${open} Live-Position(en) offen, aber das Bot-Wallet ist gesperrt – Ausstiege sind bis zum Entsperren nicht möglich`,
      );
    }
    return false;
  }

  private async updatePositions(): Promise<void> {
    const open = portfolio.openPositions(this.mode);
    await Promise.all(
      open.map(async (position) => {
        const snapshot = await fetchPairSnapshot(position.chain, position.pairAddress);
        if (snapshot) portfolio.updatePrice(position.id, snapshot.priceUsd);
      }),
    );
    if (open.length > 0) bus.emitEvent('positions', portfolio.openPositions(this.mode));
  }

  /**
   * Exit-Logik. Reihenfolge ist bewusst: Notfaelle zuerst, dann Verlustschutz,
   * dann Gewinnmitnahme. Ein Memecoin-Trade wird eher zu frueh als zu spaet
   * beendet – der typische Totalverlust entsteht durch Aussitzen.
   */
  private decideExit(position: Position, snapshot: { liquidityUsd: number; priceChangeM5: number } | null): ExitDecision | null {
    const s = this.settings;
    const pnlPct = position.pnlPct;
    const ageMinutes = (Date.now() - position.openedAt) / 60_000;
    const drawdownFromPeak =
      position.peakPrice > 0 ? ((position.peakPrice - position.lastPrice) / position.peakPrice) * 100 : 0;

    if (snapshot && snapshot.liquidityUsd > 0 && snapshot.liquidityUsd < s.minLiquidityUsd * 0.4) {
      return { fraction: 1, reason: 'Liquidität eingebrochen – Notausstieg', urgent: true };
    }

    if (pnlPct <= -Math.abs(s.stopLossPct)) {
      return { fraction: 1, reason: `Stop-Loss bei ${pnlPct.toFixed(1)}%`, urgent: true };
    }

    // Erste Teilgewinnmitnahme: holt den Einsatz weitgehend vom Tisch.
    if (position.partialsTaken === 0 && pnlPct >= s.takeProfitPct) {
      return { fraction: 0.5, reason: `Teilgewinn bei +${pnlPct.toFixed(1)}%`, urgent: false };
    }

    // Zweite Stufe bei doppeltem Ziel.
    if (position.partialsTaken === 1 && pnlPct >= s.takeProfitPct * 2.2) {
      return { fraction: 0.5, reason: `Zweiter Teilgewinn bei +${pnlPct.toFixed(1)}%`, urgent: false };
    }

    // Trailing-Stop, sobald ein nennenswerter Puffer existiert.
    const trailingArmed = position.partialsTaken > 0 || pnlPct >= s.takeProfitPct * 0.6;
    if (trailingArmed && drawdownFromPeak >= s.trailingStopPct) {
      return {
        fraction: 1,
        reason: `Trailing-Stop – ${drawdownFromPeak.toFixed(1)}% vom Hoch zurück`,
        urgent: true,
      };
    }

    // Momentum kippt, obwohl die Position im Plus ist: Gewinn sichern.
    if (pnlPct > 8 && snapshot && snapshot.priceChangeM5 < -9) {
      return { fraction: 1, reason: 'Momentum gedreht – Gewinn gesichert', urgent: true };
    }

    // Kapital nicht in Seitwaertsbewegungen binden.
    if (ageMinutes >= s.maxHoldMinutes && pnlPct < 5) {
      return { fraction: 1, reason: `Zeitstopp nach ${Math.round(ageMinutes)} Min. (${pnlPct.toFixed(1)}%)`, urgent: false };
    }

    // Sehr langer Halt ohne Durchbruch.
    if (ageMinutes >= s.maxHoldMinutes * 4) {
      return { fraction: 1, reason: `Maximale Haltedauer erreicht (${pnlPct.toFixed(1)}%)`, urgent: false };
    }

    return null;
  }

  private async manageExits(_ctx: RiskContext): Promise<void> {
    const open = portfolio.openPositions(this.mode);
    for (const position of open) {
      if (this.selling.has(position.id)) continue;
      const snapshot = await fetchPairSnapshot(position.chain, position.pairAddress);
      const decision = this.decideExit(position, snapshot);
      if (!decision) continue;
      await this.executeSell(position, decision.fraction, decision.reason);
    }
  }

  async executeSell(position: Position, fraction: number, reason: string): Promise<boolean> {
    if (this.selling.has(position.id)) return false;
    this.selling.add(position.id);
    portfolio.markClosing(position.id);

    try {
      const result = await this.executor.sell(position, fraction, this.settings.maxSlippagePct);
      if (!result.ok) {
        log.error(`Verkauf ${position.symbol} fehlgeschlagen: ${result.error}`);
        portfolio.unmarkClosing(position.id);
        return false;
      }

      const applied = portfolio.applySell({
        positionId: position.id,
        tokenAmount: result.tokenAmount,
        priceUsd: result.priceUsd,
        proceedsUsd: result.proceedsUsd,
        feeUsd: result.feeUsd,
        reason,
        txHash: result.txHash,
      });

      if (applied?.trade) {
        const t = applied.trade;
        const sign = t.pnlUsd >= 0 ? '+' : '';
        log.trade(
          `GESCHLOSSEN ${t.symbol}: ${sign}$${t.pnlUsd.toFixed(3)} (${sign}${t.pnlPct.toFixed(1)}%) nach ${Math.round(t.holdSeconds / 60)} Min. – ${reason}`,
        );
        this.applyLossCooldown();
      } else {
        log.trade(`Teilverkauf ${position.symbol}: $${result.proceedsUsd.toFixed(3)} – ${reason}`);
      }

      portfolio.markEquity(this.mode, this.mode === 'live' ? await this.executor.availableCashUsd() : 0);
      return true;
    } finally {
      portfolio.unmarkClosing(position.id);
      this.selling.delete(position.id);
    }
  }

  /** Nach mehreren Verlusten in Folge pausieren – oft ist das Regime gekippt. */
  private applyLossCooldown(): void {
    const losses = portfolio.consecutiveLosses(this.mode);
    if (losses >= 3) {
      this.cooldownUntil = Date.now() + 20 * 60_000;
      log.warn(`${losses} Verluste in Folge – 20 Minuten Pause vor neuen Einstiegen`);
    } else if (losses === 0) {
      this.cooldownUntil = null;
    }
  }

  private async considerEntries(ctx: RiskContext): Promise<void> {
    const global = checkGlobalRisk(ctx);
    if (!global.allowed) {
      if (global.halt) {
        this.stop(global.halt);
        await this.closeAll('Risikolimit erreicht');
      }
      return;
    }

    const candidates = getCandidates();
    if (candidates.length === 0) return;

    for (const candidate of candidates) {
      const verdict = checkCandidate(candidate, ctx);
      if (!verdict.allowed) continue;

      const size = positionSizeUsd(candidate, ctx);
      if (size <= 0) continue;

      const opened = await this.executeBuy(candidate, size);
      if (opened) return; // pro Tick maximal eine neue Position
    }
  }

  private async executeBuy(scored: ScoredCandidate, amountUsd: number): Promise<boolean> {
    const c = scored.candidate;

    // Sicherheitslage direkt vor dem Kauf erneut pruefen – Contracts koennen
    // sich zwischen Scan und Ausfuehrung aendern.
    const security = await checkSecurity(c.chain, c.tokenAddress);
    if (security.isHoneypot || !security.ok) {
      log.warn(`Einstieg ${c.symbol} abgebrochen: Sicherheitsprüfung nicht bestanden (${security.flags.join(', ')})`);
      db.update((draft) => {
        if (!draft.blacklist.includes(`${c.chain}:${c.tokenAddress.toLowerCase()}`)) {
          draft.blacklist.push(`${c.chain}:${c.tokenAddress.toLowerCase()}`);
        }
      });
      return false;
    }

    const result = await this.executor.buy(c, amountUsd, this.settings.maxSlippagePct);
    if (!result.ok) {
      log.warn(`Kauf ${c.symbol} nicht ausgeführt: ${result.error}`);
      return false;
    }

    const topFactors = [...scored.breakdown]
      .sort((a, b) => b.value * b.weight - a.value * a.weight)
      .slice(0, 3)
      .map((b) => b.label)
      .join(', ');
    const reason = `Score ${scored.score.toFixed(1)} · ${topFactors} · Marktumfeld ${scored.candidate.chain}/${getIntel().regime}`;

    portfolio.openPosition({
      mode: this.mode,
      chain: c.chain,
      pairAddress: c.pairAddress,
      tokenAddress: c.tokenAddress,
      symbol: c.symbol,
      name: c.name,
      url: c.url,
      entryPrice: result.priceUsd,
      tokenAmount: result.tokenAmount,
      costUsd: result.spentUsd,
      feeUsd: result.feeUsd,
      entryScore: round(scored.score, 1),
      entryReason: reason,
      stopLossPct: this.settings.stopLossPct,
      takeProfitPct: this.settings.takeProfitPct,
      txHash: result.txHash,
    });

    log.trade(
      `GEKAUFT ${c.symbol} auf ${c.chain} für $${amountUsd.toFixed(2)} @ $${result.priceUsd.toPrecision(6)} · Score ${scored.score.toFixed(1)}`,
    );
    portfolio.markEquity(this.mode, this.mode === 'live' ? await this.executor.availableCashUsd() : 0);
    return true;
  }

  async closeAll(reason = 'Alle Positionen manuell geschlossen'): Promise<number> {
    const open = portfolio.openPositions(this.mode);
    let closed = 0;
    for (const position of open) {
      if (await this.executeSell(position, 1, reason)) closed++;
    }
    return closed;
  }

  async closePosition(positionId: string, reason = 'Manuell geschlossen'): Promise<{ ok: boolean; message: string }> {
    const position = portfolio.findPosition(positionId);
    if (!position) return { ok: false, message: 'Position nicht gefunden' };
    if (position.status === 'closed') return { ok: false, message: 'Position ist bereits geschlossen' };
    const ok = await this.executeSell(position, 1, reason);
    return { ok, message: ok ? `${position.symbol} geschlossen` : 'Verkauf fehlgeschlagen' };
  }

  /** Sofortiger Notaus: Bot stoppen und alles verkaufen. */
  async panic(): Promise<{ ok: boolean; message: string }> {
    this.stop('Notaus ausgelöst');
    const closed = await this.closeAll('Notaus – alle Positionen geschlossen');
    return { ok: true, message: `Notaus ausgeführt, ${closed} Position(en) geschlossen` };
  }
}

export const engine = new Engine();
