import { clamp } from '../util/num.js';
import { effectiveMinScore, marketEntryBlocked } from './entry.js';
import { isMicroAccount, isRecoveryAccount, minTradeUsd } from './fees.js';
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
}

const MIN_TRADE_USD = 1;

export { isMicroAccount, isRecoveryAccount, minTradeUsd } from './fees.js';
/** Globale Schutzschalter – gelten unabhaengig vom einzelnen Kandidaten. */
export function checkGlobalRisk(ctx: RiskContext): RiskVerdict {
  const { settings, state } = ctx;
  const recovery = isRecoveryAccount(state.equityUsd, state.startEquityUsd);

  if (!recovery && state.dayPnlPct <= -Math.abs(settings.dailyLossLimitPct)) {
    return {
      allowed: false,
      reason: `Tagesverlustlimit erreicht (${state.dayPnlPct.toFixed(1)}%) – heute keine neuen Einstiege`,
    };
  }

  if (!recovery && state.drawdownPct >= Math.abs(settings.maxDrawdownPct)) {
    return {
      allowed: false,
      reason: `Drawdown-Limit erreicht (${state.drawdownPct.toFixed(1)}%) – keine neuen Einstiege`,
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

  const minTrade = minTradeUsd(state.equityUsd, state.startEquityUsd);
  if (ctx.availableCashUsd < minTrade) {
    return { allowed: false, reason: `Zu wenig freies Kapital ($${ctx.availableCashUsd.toFixed(2)}, min. $${minTrade.toFixed(2)})` };
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

  if (candidate.rawScore < 52) {
    return {
      allowed: false,
      reason: `Setup-Qualität zu schwach (raw ${candidate.rawScore.toFixed(1)} < 52)`,
    };
  }

  if (candidate.security.checked && candidate.security.score < 0.48) {
    return {
      allowed: false,
      reason: `Sicherheits-Score zu niedrig (${(candidate.security.score * 100).toFixed(0)}%)`,
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
  const recovery = isRecoveryAccount(state.equityUsd, state.startEquityUsd);
  const minTrade = minTradeUsd(state.equityUsd, state.startEquityUsd);

  if (isMicroAccount(state.equityUsd) || recovery) {
    const cashFactor = recovery ? 0.94 : 0.82;
    const size = Math.min(ctx.availableCashUsd * cashFactor, state.equityUsd * (recovery ? 0.9 : 0.85), liquidityCap);
    return size >= minTrade ? Number(size.toFixed(4)) : 0;
  }

  const base = state.equityUsd * (settings.riskPerTradePct / 100);
  const conviction = clamp(0.7 + (candidate.score - 64) / 55, 0.55, 1.15);
  const regimeFactor = 0.62 + 0.5 * ctx.intel.riskAppetite;
  const lossFactor =
    ctx.consecutiveLosses >= 3 ? 0.45 : ctx.consecutiveLosses === 2 ? 0.6 : ctx.consecutiveLosses === 1 ? 0.78 : 1;

  const remainingSlots = Math.max(1, settings.maxOpenPositions - portfolio.openPositions(settings.tradingMode).length);
  const cashCap = ctx.availableCashUsd * (remainingSlots === 1 ? 0.85 : 0.5);

  const size = Math.min(base * conviction * regimeFactor * lossFactor, liquidityCap, cashCap);
  return size >= minTradeUsd(state.equityUsd, state.startEquityUsd) ? Number(size.toFixed(4)) : 0;
}

export { MIN_TRADE_USD };
