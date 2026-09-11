import { adx, atr, closes, ema, lastValid, rsi } from './indicators.js';
import type { Candle, Regime } from '../types.js';

export interface RegimeView {
  regime: Regime;
  adx: number;
  rsi: number;
  atrPct: number;
  trendBias: number;
  note: string;
}

export function detectRegime(btc: Candle[]): RegimeView {
  if (btc.length < 60) {
    return {
      regime: 'range',
      adx: 0,
      rsi: 50,
      atrPct: 0,
      trendBias: 0,
      note: 'Zu wenig BTC-Daten – vorsichtig im Range-Modus',
    };
  }
  const c = closes(btc);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const adxNow = lastValid(adx(btc, 14));
  const rsiNow = lastValid(rsi(c, 14));
  const atrNow = lastValid(atr(btc, 14));
  const px = c[c.length - 1]!;
  const atrPct = px ? (atrNow / px) * 100 : 0;
  const e20n = lastValid(e20);
  const e50n = lastValid(e50);
  const trendBias = e20n && e50n ? (e20n - e50n) / e50n : 0;
  const last6 = btc.slice(-6);
  const range6 = last6.length
    ? (Math.max(...last6.map((x) => x.h)) - Math.min(...last6.map((x) => x.l))) / px
    : 0;

  if (atrPct > 2.8 && range6 > 0.018) {
    return {
      regime: 'breakout',
      adx: adxNow,
      rsi: rsiNow,
      atrPct,
      trendBias,
      note: 'Hohe Bewegung – Breakout/Trend, Mean-Reversion nur mit Extra-Qualität',
    };
  }
  if (adxNow >= 23 && trendBias < -0.008 && rsiNow < 42) {
    return {
      regime: 'risk-off',
      adx: adxNow,
      rsi: rsiNow,
      atrPct,
      trendBias,
      note: 'BTC-Abwärtsdruck – weniger Risiko, Shorts/Cash bevorzugt',
    };
  }
  if (adxNow >= 22 && trendBias > 0.004) {
    return {
      regime: 'trend-up',
      adx: adxNow,
      rsi: rsiNow,
      atrPct,
      trendBias,
      note: 'Aufwärtstrend – Trendfolge und saubere Rücksetzer',
    };
  }
  if (adxNow >= 22 && trendBias < -0.004) {
    return {
      regime: 'trend-down',
      adx: adxNow,
      rsi: rsiNow,
      atrPct,
      trendBias,
      note: 'Abwärtstrend – Shorts nur mit Plan, Longs nur Extrem-Mean-Reversion',
    };
  }
  return {
    regime: 'range',
    adx: adxNow,
    rsi: rsiNow,
    atrPct,
    trendBias,
    note: 'Seitwärts – Mean-Reversion und Grid haben Vorrang',
  };
}
