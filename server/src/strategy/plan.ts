import { roundTripCostPct } from '../trading/sizing.js';
import { round } from '../util/num.js';
import type { RawSignal } from './signals.js';
import type { AdaptiveRules, Instrument, Regime, Side, StrategyId, TradePlan, VenueId } from '../types.js';

export function buildPlan(opts: {
  instrument: Instrument;
  venue: VenueId;
  price: number;
  regime: Regime;
  signal: RawSignal;
  rules: AdaptiveRules;
}): TradePlan | null {
  const { instrument, venue, price, regime, signal, rules } = opts;
  if (price <= 0) return null;
  const feePct = roundTripCostPct(venue);
  const slPct = Math.min(0.028, Math.max(0.008, signal.slPctHint));
  const stopLoss = signal.side === 'long' ? price * (1 - slPct) : price * (1 + slPct);
  const risk = Math.abs(price - stopLoss);
  if (risk <= 0) return null;
  const tp1 = signal.side === 'long' ? price + risk * signal.tp1R : price - risk * signal.tp1R;
  const tp2 = signal.side === 'long' ? price + risk * signal.tp2R : price - risk * signal.tp2R;
  const rr = signal.tp2R;
  if (rr < rules.minRewardToRisk) return null;
  const moveToTp1 = Math.abs(tp1 - price) / price;
  if (moveToTp1 < feePct * 2.2) return null;

  const regimeFit = regimeFitScore(signal.strategy, regime, signal.side);
  const weight = rules.strategyWeights[signal.strategy] ?? 0;
  if (weight <= 0 || rules.disabledStrategies.includes(signal.strategy)) return null;

  const quality = Math.round(
    signal.strength * 0.46 +
      Math.min(25, (rr / rules.minRewardToRisk) * 12) +
      regimeFit * 0.22 +
      weight * 8,
  );

  const thesis = [
    `${instrument.display}: ${strategyLabel(signal.strategy)} ${signal.side === 'long' ? 'Long' : 'Short'}`,
    `Marktphase ${regimeLabel(regime)}`,
    `SL ${(slPct * 100).toFixed(2)} %, TP1 ${signal.tp1R.toFixed(1)}R, TP2 ${signal.tp2R.toFixed(1)}R`,
    `Nach Gebühren (${(feePct * 100).toFixed(2)} % Roundtrip) bleibt R:R ${rr.toFixed(2)}`,
    ...signal.reasons,
  ].join(' · ');

  return {
    instrumentId: instrument.id,
    display: instrument.display,
    venue,
    strategy: signal.strategy,
    regime,
    side: signal.side,
    thesis,
    invalidation:
      signal.side === 'long'
        ? 'Schluss unter Stop oder Regime kippt klar gegen die Position'
        : 'Schluss über Stop oder Regime kippt klar gegen die Position',
    entry: price,
    stopLoss: round(stopLoss, 6),
    tp1: round(tp1, 6),
    tp2: round(tp2, 6),
    runnerTrailPct: Math.max(0.006, slPct * 0.7),
    rewardToRisk: round(rr, 3),
    feePct,
    feeEur: 0,
    riskEur: 0,
    notionalEur: 0,
    quality: Math.min(99, quality),
    reasons: signal.reasons,
  };
}

/** Manueller Einstieg: immer vollständiger Plan, Bot übernimmt danach die Exits. */
export function buildManualPlan(opts: {
  instrument: Instrument;
  venue: VenueId;
  price: number;
  regime: Regime;
  side: Side;
  atrPct?: number;
}): TradePlan {
  const { instrument, venue, price, regime, side } = opts;
  const feePct = roundTripCostPct(venue);
  const atrPct = Number.isFinite(opts.atrPct) && (opts.atrPct ?? 0) > 0 ? opts.atrPct! : 0.012;
  const slPct = Math.min(0.024, Math.max(0.01, atrPct * 1.35));
  const stopLoss = side === 'long' ? price * (1 - slPct) : price * (1 + slPct);
  const risk = Math.abs(price - stopLoss);
  const tp1R = 1.2;
  const tp2R = 2.2;
  const tp1 = side === 'long' ? price + risk * tp1R : price - risk * tp1R;
  const tp2 = side === 'long' ? price + risk * tp2R : price - risk * tp2R;
  const strategy = pickBias(regime);
  const dir = side === 'long' ? 'Long' : 'Short';
  return {
    instrumentId: instrument.id,
    display: instrument.display,
    venue,
    strategy,
    regime,
    side,
    thesis: [
      `Manuell eröffnet: ${instrument.display} ${dir}`,
      'Bot übernimmt ab jetzt SL, TP1 (40 %), TP2 (40 %) und Trailing-Runner',
      `SL ${(slPct * 100).toFixed(2)} %, TP1 ${tp1R.toFixed(1)}R, TP2 ${tp2R.toFixed(1)}R`,
      `Marktphase ${regimeLabel(regime)} · Roundtrip ${(feePct * 100).toFixed(2)} %`,
    ].join(' · '),
    invalidation:
      side === 'long'
        ? 'Schluss unter Stop – Bot schließt, kein Nachkaufen'
        : 'Schluss über Stop – Bot schließt, kein Nachverkaufen',
    entry: price,
    stopLoss: round(stopLoss, 6),
    tp1: round(tp1, 6),
    tp2: round(tp2, 6),
    runnerTrailPct: Math.max(0.006, slPct * 0.7),
    rewardToRisk: round(tp2R, 3),
    feePct,
    feeEur: 0,
    riskEur: 0,
    notionalEur: 0,
    quality: 88,
    reasons: ['Manueller Einstieg', 'Vollständiger Plan an Bot übergeben'],
  };
}

export function pickBias(regime: Regime): StrategyId {
  if (regime === 'range' || regime === 'risk-off') return 'meanReversion';
  if (regime === 'breakout') return 'breakout';
  return 'trend';
}

function regimeFitScore(strategy: StrategyId, regime: Regime, side: Side): number {
  if (strategy === 'meanReversion' && regime === 'range') return 100;
  if (strategy === 'meanReversion' && regime === 'risk-off' && side === 'long') return 40;
  if (strategy === 'trend' && (regime === 'trend-up' || regime === 'trend-down')) return 95;
  if (strategy === 'grid' && regime === 'range') return 88;
  if (strategy === 'breakout' && regime === 'breakout') return 92;
  if (strategy === 'breakout' && regime === 'trend-up') return 70;
  return 35;
}

function strategyLabel(id: StrategyId): string {
  switch (id) {
    case 'meanReversion':
      return 'Mean Reversion';
    case 'trend':
      return 'Trendfolge';
    case 'grid':
      return 'Grid/Range';
    case 'breakout':
      return 'Breakout';
  }
}

function regimeLabel(r: Regime): string {
  switch (r) {
    case 'trend-up':
      return 'Aufwärtstrend';
    case 'trend-down':
      return 'Abwärtstrend';
    case 'range':
      return 'Seitwärts';
    case 'breakout':
      return 'Ausbruch';
    case 'risk-off':
      return 'Risiko-aus';
  }
}
