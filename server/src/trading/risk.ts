import { clamp } from '../util/num.js';
import { effectiveMinScore, marketEntryBlocked } from './entry.js';
import { isMicroAccount, isRecoveryAccount, isDustAccount, minTradeUsd } from './fees.js';
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
export function maxAllowedPositions(ctx: RiskContext): number {
  const { settings, state } = ctx;
  if (isMicroAccount(state.equityUsd)) {
    // Bei >= $3.50 Gesamtkapital erlauben wir 2 gestaffelte Slots bei Multi-Kandidaten
    if (state.equityUsd >= 3.5 && ctx.availableCashUsd >= 1.6) {
      return 2;
    }
    return 1;
  }
  return ctx.intel.regime === 'risk-off'
    ? Math.min(1, settings.maxOpenPositions)
    : settings.maxOpenPositions;
}

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
  const maxOpen = maxAllowedPositions(ctx);
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
    isRecoveryAccount(ctx.state.equityUsd, ctx.state.startEquityUsd),
  );

  if (candidate.score < minScore) {
    return {
      allowed: false,
      reason: `Score ${candidate.score.toFixed(1)} unter Schwelle ${minScore.toFixed(0)}`,
    };
  }

  if (candidate.rawScore < 55) {
    return {
      allowed: false,
      reason: `Setup-Qualität zu schwach (raw ${candidate.rawScore.toFixed(1)} < 55)`,
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
 * 2 Dynamische Trading-Lagen:
 * 1. Multi-Kandidaten-Lage (Diversifikation): Bei mehreren guten Coins kleinere Beträge,
 *    sodass das Risiko verteilt wird und selbst bei einem Rugpull noch Restkapital bleibt.
 * 2. High-Conviction-Lage (Sniper/Conviction): Bei einem herausragenden Top-Setup (Score >= 62,
 *    starke Security, Hype) wird eine größere Position eröffnet, aber strikt gedeckelt auf max. 65%
 *    des Gesamtkapitals (max. 75% des verfügbaren Cashs), damit der Account immer handlungsfähig bleibt.
 */
export function positionSizeUsd(
  candidate: ScoredCandidate,
  ctx: RiskContext,
  allTradableCount = 1,
): number {
  const { settings, state } = ctx;
  const liquidityCap = candidate.candidate.liquidityUsd * 0.0015;
  const recovery = isRecoveryAccount(state.equityUsd, state.startEquityUsd);
  const minTrade = minTradeUsd(state.equityUsd, state.startEquityUsd);

  // Recovery- und Dust-Konto: fast alles einsetzen, um schnell wieder hochzukommen
  if (recovery || isDustAccount(state.equityUsd)) {
    const cashFraction = isDustAccount(state.equityUsd) ? 0.98 : 0.96;
    const equityFraction = isDustAccount(state.equityUsd) ? 0.96 : 0.92;
    const size = Math.min(ctx.availableCashUsd * cashFraction, state.equityUsd * equityFraction, liquidityCap);
    return size >= minTrade ? Number(size.toFixed(4)) : 0;
  }

  // Ist dies ein herausragendes High-Conviction Setup (Lage 2)?
  const isHighConviction =
    candidate.score >= 62 &&
    candidate.rawScore >= 65 &&
    candidate.security.score >= 0.8 &&
    candidate.candidate.liquidityUsd >= 35_000;

  // Lage 1: Mehrere gute Coins gefunden -> Kleinere Beträge, Risiko streuen
  if (allTradableCount >= 2 && !isHighConviction) {
    const multiCashFraction = state.equityUsd >= 4 ? 0.45 : 0.65;
    const size = Math.min(
      ctx.availableCashUsd * multiCashFraction,
      state.equityUsd * 0.45,
      liquidityCap,
    );
    return size >= minTrade ? Number(size.toFixed(4)) : 0;
  }

  // Lage 2: Ein richtig gutes Potenzial-Setup (High Conviction) -> Größerer Betrag, aber stets Rugpull-geschützt
  if (isHighConviction) {
    // Maximal 65% des Equities / 75% des Cashs -> selbst bei 100% Totalverlust bleiben 35% übrig
    const convictionCap = Math.min(ctx.availableCashUsd * 0.75, state.equityUsd * 0.65, liquidityCap);
    return convictionCap >= minTrade ? Number(convictionCap.toFixed(4)) : 0;
  }

  // Standard Micro-/Normal-Größe (solide Balance)
  if (isMicroAccount(state.equityUsd)) {
    const size = Math.min(ctx.availableCashUsd * 0.75, state.equityUsd * 0.65, liquidityCap);
    return size >= minTrade ? Number(size.toFixed(4)) : 0;
  }

  const base = state.equityUsd * (settings.riskPerTradePct / 100);
  const conviction = clamp(0.7 + (candidate.score - 64) / 55, 0.55, 1.15);
  const regimeFactor = 0.62 + 0.5 * ctx.intel.riskAppetite;
  const lossFactor =
    ctx.consecutiveLosses >= 3 ? 0.45 : ctx.consecutiveLosses === 2 ? 0.6 : ctx.consecutiveLosses === 1 ? 0.78 : 1;

  const remainingSlots = Math.max(1, settings.maxOpenPositions - portfolio.openPositions(settings.tradingMode).length);
  const cashCap = ctx.availableCashUsd * (remainingSlots === 1 ? 0.8 : 0.45);

  const size = Math.min(base * conviction * regimeFactor * lossFactor, liquidityCap, cashCap);
  return size >= minTrade ? Number(size.toFixed(4)) : 0;
}

export { MIN_TRADE_USD };
