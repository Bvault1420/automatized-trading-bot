import {
  adx,
  atr,
  bollinger,
  closes,
  ema,
  lastValid,
  rangeHigh,
  rangeLow,
  rsi,
  volumeSma,
} from '../market/indicators.js';
import type { Candle, Regime, Side, StrategyId } from '../types.js';

export interface RawSignal {
  strategy: StrategyId;
  side: Side;
  strength: number;
  reasons: string[];
  slPctHint: number;
  tp1R: number;
  tp2R: number;
}

export function collectSignals(cs: Candle[], regime: Regime, allowShorts: boolean): RawSignal[] {
  if (cs.length < 80) return [];
  const out: RawSignal[] = [];
  const mr = meanReversion(cs, regime);
  if (mr) out.push(mr);
  const tr = trendFollow(cs, regime);
  if (tr) out.push(tr);
  const gr = gridFade(cs, regime);
  if (gr) out.push(gr);
  const br = breakout(cs, regime);
  if (br) out.push(br);
  return out.filter((s) => allowShorts || s.side === 'long');
}

function meanReversion(cs: Candle[], regime: Regime): RawSignal | null {
  const c = closes(cs);
  const r = lastValid(rsi(c, 14));
  const bb = bollinger(c, 20, 2);
  const px = c[c.length - 1]!;
  const lower = lastValid(bb.lower);
  const upper = lastValid(bb.upper);
  const a = lastValid(adx(cs, 14));
  if (!Number.isFinite(r) || !Number.isFinite(lower)) return null;

  const rangeOk = regime === 'range' || regime === 'trend-up' || regime === 'risk-off';
  if (r <= 32 && px <= lower * 1.004 && a < 28 && rangeOk) {
    const extra = regime === 'range' ? 8 : 0;
    const crashHaircut = regime === 'risk-off' ? -12 : 0;
    return {
      strategy: 'meanReversion',
      side: 'long',
      strength: clampScore(70 + (32 - r) + extra + crashHaircut),
      reasons: [`RSI ${r.toFixed(1)} überverkauft`, 'Preis am unteren Bollinger-Band', 'Mean-Reversion-Plan'],
      slPctHint: 0.012,
      tp1R: 1.1,
      tp2R: 2.1,
    };
  }
  if (r >= 68 && px >= upper * 0.996 && a < 28 && (regime === 'range' || regime === 'trend-down')) {
    return {
      strategy: 'meanReversion',
      side: 'short',
      strength: clampScore(70 + (r - 68) + (regime === 'range' ? 8 : 0)),
      reasons: [`RSI ${r.toFixed(1)} überkauft`, 'Preis am oberen Band', 'Mean-Reversion Short'],
      slPctHint: 0.012,
      tp1R: 1.1,
      tp2R: 2.1,
    };
  }
  return null;
}

function trendFollow(cs: Candle[], regime: Regime): RawSignal | null {
  const c = closes(cs);
  const e20 = lastValid(ema(c, 20));
  const e50 = lastValid(ema(c, 50));
  const px = c[c.length - 1]!;
  const a = lastValid(adx(cs, 14));
  const atrNow = lastValid(atr(cs, 14));
  const r = lastValid(rsi(c, 14));
  if (![e20, e50, a, atrNow].every(Number.isFinite)) return null;

  const dist = Math.abs(px - e20) / (atrNow || px);
  if (regime === 'trend-up' && e20 > e50 && px > e20 && dist < 1.15 && a >= 20 && r > 48 && r < 68) {
    return {
      strategy: 'trend',
      side: 'long',
      strength: clampScore(66 + (a - 20) + (1.15 - dist) * 8),
      reasons: ['EMA20 über EMA50', `ADX ${a.toFixed(0)} bestätigt Trend`, 'Rücksetzer nicht überdehnt'],
      slPctHint: Math.max(0.01, (atrNow / px) * 1.4),
      tp1R: 1.2,
      tp2R: 2.4,
    };
  }
  if (regime === 'trend-down' && e20 < e50 && px < e20 && dist < 1.15 && a >= 20 && r < 52 && r > 32) {
    return {
      strategy: 'trend',
      side: 'short',
      strength: clampScore(66 + (a - 20)),
      reasons: ['Abwärtstrend bestätigt', `ADX ${a.toFixed(0)}`, 'Short mit Trend, nicht gegenhalten'],
      slPctHint: Math.max(0.01, (atrNow / px) * 1.4),
      tp1R: 1.2,
      tp2R: 2.4,
    };
  }
  return null;
}

function gridFade(cs: Candle[], regime: Regime): RawSignal | null {
  if (regime !== 'range') return null;
  const px = cs[cs.length - 1]!.c;
  const hi = rangeHigh(cs, 48);
  const lo = rangeLow(cs, 48);
  const width = (hi - lo) / px;
  const a = lastValid(adx(cs, 14));
  if (width < 0.018 || a > 20) return null;
  const pos = (px - lo) / (hi - lo || 1);
  if (pos <= 0.18) {
    return {
      strategy: 'grid',
      side: 'long',
      strength: clampScore(64 + (0.18 - pos) * 40),
      reasons: ['Range-Unterkante', `Spanne ${(width * 100).toFixed(1)} %`, 'Grid-Fade Long'],
      slPctHint: Math.max(0.009, (px - lo) / px + 0.004),
      tp1R: 1.0,
      tp2R: 1.8,
    };
  }
  if (pos >= 0.82) {
    return {
      strategy: 'grid',
      side: 'short',
      strength: clampScore(64 + (pos - 0.82) * 40),
      reasons: ['Range-Oberkante', 'Grid-Fade Short'],
      slPctHint: Math.max(0.009, (hi - px) / px + 0.004),
      tp1R: 1.0,
      tp2R: 1.8,
    };
  }
  return null;
}

function breakout(cs: Candle[], regime: Regime): RawSignal | null {
  if (regime !== 'breakout' && regime !== 'trend-up') return null;
  const px = cs[cs.length - 1]!.c;
  const hi = rangeHigh(cs.slice(0, -1), 24);
  const vol = cs[cs.length - 1]!.v;
  const vAvg = volumeSma(cs.slice(0, -1), 20);
  const atrNow = lastValid(atr(cs, 14));
  if (px > hi * 1.0015 && vol > vAvg * 1.45 && atrNow / px > 0.004) {
    return {
      strategy: 'breakout',
      side: 'long',
      strength: clampScore(62 + Math.min(12, ((vol / (vAvg || 1)) - 1.45) * 8)),
      reasons: ['24-Kerzen-Hoch gebrochen', 'Volumen bestätigt', 'Breakout nur mit enger Invalidierung'],
      slPctHint: Math.max(0.011, (atrNow / px) * 1.2),
      tp1R: 1.3,
      tp2R: 2.6,
    };
  }
  return null;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}
