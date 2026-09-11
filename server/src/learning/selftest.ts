import { collectSignals } from '../strategy/signals.js';
import { buildPlan } from '../strategy/plan.js';
import { decideExit } from '../trading/exits.js';
import { FACTORY_RULES } from './adapt.js';
import { roundTripCostPct } from '../trading/sizing.js';
import type { AdaptiveRules, Candle, Instrument, Position, SelfTestReport, VenueId } from '../types.js';

export function runSelfTest(
  instrument: Instrument,
  candles: Candle[],
  venue: VenueId,
  rules: AdaptiveRules,
  now = Date.now(),
): SelfTestReport {
  const pnls: number[] = [];
  let pos: Position | null = null;
  const fee = roundTripCostPct(venue);
  let peak = 100;
  let equity = 100;
  let maxDd = 0;

  for (let i = 90; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const bar = window[window.length - 1]!;
    const px = bar.c;

    if (pos) {
      pos.highWater = Math.max(pos.highWater, bar.h);
      pos.lowWater = Math.min(pos.lowWater, bar.l);
      const d = decideExit(pos, px, now);
      if (d.kind !== 'none' && d.qty > 0) {
        const dir = pos.side === 'long' ? 1 : -1;
        const pnl = (px - pos.entry) * dir * d.qty - Math.abs(d.qty * px) * (fee / 2);
        pnls.push(pnl);
        equity += pnl;
        pos.remainingQty -= d.qty;
        if (d.kind === 'tp1') {
          pos.tp1Filled = true;
          pos.stopLoss = pos.entry;
        }
        if (d.kind === 'tp2') pos.tp2Filled = true;
        if (pos.remainingQty <= pos.qty * 0.02 || d.kind === 'stop' || d.kind === 'trail' || d.kind === 'time') {
          pos = null;
        }
      }
    } else {
      const signals = collectSignals(window, 'range', true);
      const best = [...signals].sort((a, b) => b.strength - a.strength)[0];
      if (best) {
        const plan = buildPlan({
          instrument,
          venue,
          price: px,
          regime: 'range',
          signal: best,
          rules,
        });
        if (plan && plan.quality >= rules.minQuality) {
          const notional = 20;
          const qty = notional / px;
          pos = {
            id: `sim_${i}`,
            mode: 'paper',
            instrumentId: instrument.id,
            display: instrument.display,
            assetClass: instrument.assetClass,
            venue,
            strategy: plan.strategy,
            regime: plan.regime,
            side: plan.side,
            status: 'open',
            qty,
            entry: px,
            remainingQty: qty,
            stopLoss: plan.stopLoss,
            tp1: plan.tp1,
            tp2: plan.tp2,
            tp1Filled: false,
            tp2Filled: false,
            trailPct: plan.runnerTrailPct,
            highWater: bar.h,
            lowWater: bar.l,
            openedAt: now - (candles.length - i) * 15 * 60_000,
            plan,
            feesPaidEur: notional * (fee / 2),
            realizedEur: 0,
          };
          equity -= notional * (fee / 2);
        }
      }
    }

    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }

  const wins = pnls.filter((x) => x > 0).length;
  const expectancy = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  const gw = pnls.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const gl = Math.abs(pnls.filter((x) => x < 0).reduce((a, b) => a + b, 0));
  const pf = gl === 0 ? (gw > 0 ? 3 : 0) : gw / gl;

  return {
    at: now,
    trades: pnls.length,
    winRate: pnls.length ? wins / pnls.length : 0,
    expectancyEur: expectancy,
    maxDrawdownPct: maxDd,
    profitFactor: pf,
    recommendation:
      expectancy < 0 || pf < 1
        ? 'Selbsttest negativ – Qualität erhöhen, Risiko nicht anfassen.'
        : 'Selbsttest tragfähig – nur vorsichtige, engere Regeln erlaubt.',
    applied: false,
  };
}

export function emptySelfTest(now = Date.now()): SelfTestReport {
  return {
    at: now,
    trades: 0,
    winRate: 0,
    expectancyEur: 0,
    maxDrawdownPct: 0,
    profitFactor: 0,
    recommendation: 'Noch zu wenig Marktdaten für einen Selbsttest.',
    applied: false,
  };
}

export const defaultInstrument: Instrument = {
  id: 'BTCUSDT',
  symbol: 'BTCUSDT',
  display: 'Bitcoin',
  assetClass: 'crypto',
  base: 'BTC',
  quote: 'USDT',
  venues: ['binance'],
};

void FACTORY_RULES;
