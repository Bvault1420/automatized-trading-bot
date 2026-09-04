import { clamp } from '../util/num.js';
import { effectiveMinScore, marketEntryBlocked } from './entry.js';
import { isMicroAccount } from './fees.js';
import { portfolio } from './portfolio.js';
import type { BotSettings, MarketIntel, PortfolioState, ScoredCandidate } from '../types.js';

export interface RiskContext {
  settings: BotSettings;
  intel: MarketIntel;
  state: PortfolioState;
  availableCashUsd: number;
  consecutiveLosses: number;
  cooldownUntil: number | null;
  nativePriceUsd?: number;
}

export interface RiskVerdict {
  allowed: boolean;
  reason: string;
  /** Wird gesetzt, wenn der Bot komplett pausieren soll. */
  halt?: string;
}

const MIN_TRADE_USD = 1;

export { isMicroAccount } from './fees.js';

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

  const crash = marketEntryBlocked(ctx.intel);
  if (crash) {
    return { allowed: false, reason: crash };
  }

  const openCount = portfolio.openPositions(settings.tradingMode).length;
  const maxOpen = isMicroAccount(state.equityUsd)
    ? 1
    : ctx.intel.regime === 'risk-off'
      ? Math.min(1, settings.maxOpenPositions)
      : settings.maxOpenPositions;
  if (openCount >= maxOpen) {
    return { allowed: false, reason: `Maximale Positionsanzahl erreicht (${openCount}/${maxOpen})` };
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

  const minScore = effectiveMinScore(
    ctx.settings,
    ctx.intel,
    portfolio.trades(ctx.settings.tradingMode),
    ctx.consecutiveLosses,
  );

  if (candidate.score < minScore) {
    return {
      allowed: false,
      reason: `Score ${candidate.score.toFixed(1)} unter Schwelle ${minScore.toFixed(0)}`,
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

  return { allowed: true, reason: 'Einstieg freigegeben' };
}

/**
 * Positionsgroesse nach fixed-fractional Ansatz, moduliert mit Signalstaerke,
 * Marktumfeld und aktueller Trefferquote. Nach Verlusten wird kleiner gesetzt.
 */
export function positionSizeUsd(candidate: ScoredCandidate, ctx: RiskContext): number {
  const { settings, state } = ctx;
  const liquidityCap = candidate.candidate.liquidityUsd * 0.0015;

  if (isMicroAccount(state.equityUsd)) {
    const size = Math.min(ctx.availableCashUsd * 0.82, state.equityUsd * 0.85, liquidityCap);
    return size >= MIN_TRADE_USD ? Number(size.toFixed(4)) : 0;
  }

  const base = state.equityUsd * (settings.riskPerTradePct / 100);
  const conviction = clamp(0.7 + (candidate.score - 64) / 55, 0.55, 1.15);
  const regimeFactor = 0.62 + 0.5 * ctx.intel.riskAppetite;
  const lossFactor =
    ctx.consecutiveLosses >= 3 ? 0.45 : ctx.consecutiveLosses === 2 ? 0.6 : ctx.consecutiveLosses === 1 ? 0.78 : 1;

  const remainingSlots = Math.max(1, settings.maxOpenPositions - portfolio.openPositions(settings.tradingMode).length);
  const cashCap = ctx.availableCashUsd * (remainingSlots === 1 ? 0.85 : 0.5);

  const size = Math.min(base * conviction * regimeFactor * lossFactor, liquidityCap, cashCap);
  return size >= MIN_TRADE_USD ? Number(size.toFixed(4)) : 0;
}

export { MIN_TRADE_USD };
