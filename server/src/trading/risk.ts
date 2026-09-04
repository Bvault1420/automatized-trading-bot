import { clamp } from '../util/num.js';
import { portfolio } from './portfolio.js';
import type { BotSettings, MarketIntel, PortfolioState, ScoredCandidate } from '../types.js';

export interface RiskContext {
  settings: BotSettings;
  intel: MarketIntel;
  state: PortfolioState;
  availableCashUsd: number;
  consecutiveLosses: number;
  cooldownUntil: number | null;
}

export interface RiskVerdict {
  allowed: boolean;
  reason: string;
  /** Wird gesetzt, wenn der Bot komplett pausieren soll. */
  halt?: string;
}

const MIN_TRADE_USD = 1;

/** Globale Schutzschalter – gelten unabhaengig vom einzelnen Kandidaten. */
export function checkGlobalRisk(ctx: RiskContext): RiskVerdict {
  const { settings, state } = ctx;

  if (state.dayPnlPct <= -Math.abs(settings.dailyLossLimitPct)) {
    return {
      allowed: false,
      reason: `Tagesverlustlimit erreicht (${state.dayPnlPct.toFixed(1)}%)`,
      halt: `Tagesverlustlimit von ${settings.dailyLossLimitPct}% erreicht – Handel bis morgen pausiert`,
    };
  }

  if (state.drawdownPct >= Math.abs(settings.maxDrawdownPct)) {
    return {
      allowed: false,
      reason: `Maximaler Drawdown erreicht (${state.drawdownPct.toFixed(1)}%)`,
      halt: `Drawdown-Limit von ${settings.maxDrawdownPct}% erreicht – Notaus ausgelöst`,
    };
  }

  if (ctx.cooldownUntil && ctx.cooldownUntil > Date.now()) {
    const minutes = Math.ceil((ctx.cooldownUntil - Date.now()) / 60_000);
    return { allowed: false, reason: `Verlustserie – Pause noch ${minutes} Min.` };
  }

  const openCount = portfolio.openPositions(settings.tradingMode).length;
  if (openCount >= settings.maxOpenPositions) {
    return { allowed: false, reason: `Maximale Positionsanzahl erreicht (${openCount}/${settings.maxOpenPositions})` };
  }

  if (ctx.availableCashUsd < MIN_TRADE_USD) {
    return { allowed: false, reason: `Zu wenig freies Kapital ($${ctx.availableCashUsd.toFixed(2)})` };
  }

  return { allowed: true, reason: 'Risikoprüfung bestanden' };
}

/** Prueft einen konkreten Kandidaten gegen die Einstiegsregeln. */
export function checkCandidate(candidate: ScoredCandidate, ctx: RiskContext): RiskVerdict {
  if (!candidate.tradable) {
    return { allowed: false, reason: candidate.rejections[0] ?? 'Nicht handelbar' };
  }

  if (candidate.score < ctx.settings.minEntryScore) {
    return {
      allowed: false,
      reason: `Score ${candidate.score.toFixed(1)} unter Schwelle ${ctx.settings.minEntryScore}`,
    };
  }

  if (
    portfolio.hasOpenPosition(
      ctx.settings.tradingMode,
      candidate.candidate.chain,
      candidate.candidate.tokenAddress,
    )
  ) {
    return { allowed: false, reason: 'Position in diesem Token bereits offen' };
  }

  // Im defensiven Regime nur klar ueberdurchschnittliche Setups zulassen.
  if (ctx.intel.regime === 'risk-off' && candidate.score < ctx.settings.minEntryScore + 8) {
    return { allowed: false, reason: 'Risk-off-Umfeld verlangt ein stärkeres Signal' };
  }

  return { allowed: true, reason: 'Einstieg freigegeben' };
}

/**
 * Positionsgroesse nach fixed-fractional Ansatz, moduliert mit Signalstaerke
 * und Marktumfeld. Bei kleinen Konten wird zusaetzlich sichergestellt, dass
 * nicht das gesamte Kapital in einer Position landet.
 */
export function positionSizeUsd(candidate: ScoredCandidate, ctx: RiskContext): number {
  const { settings, state } = ctx;
  const base = state.equityUsd * (settings.riskPerTradePct / 100);

  // Score 60 -> 0.75x, Score 85+ -> 1.25x
  const conviction = clamp(0.75 + (candidate.score - 60) / 50, 0.6, 1.25);
  const regimeFactor = 0.7 + 0.6 * ctx.intel.riskAppetite;

  // Nie mehr als ein Bruchteil der Poolliquiditaet: sonst frisst die eigene
  // Order die Rendite und der Ausstieg wird teuer.
  const liquidityCap = candidate.candidate.liquidityUsd * 0.002;

  const remainingSlots = Math.max(1, settings.maxOpenPositions - portfolio.openPositions(settings.tradingMode).length);
  const cashCap = ctx.availableCashUsd * (remainingSlots === 1 ? 0.95 : 0.6);

  const size = Math.min(base * conviction * regimeFactor, liquidityCap, cashCap);
  return size >= MIN_TRADE_USD ? Number(size.toFixed(4)) : 0;
}

export { MIN_TRADE_USD };
