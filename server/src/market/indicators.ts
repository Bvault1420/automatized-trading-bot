import type { Candle } from '../types.js';

export function closes(cs: Candle[]): number[] {
  return cs.map((c) => c.c);
}

export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0]!;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(NaN);
  if (cs.length < 2) return out;
  const trs: number[] = [0];
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i]!;
    const prev = cs[i - 1]!;
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c)));
  }
  let sum = 0;
  for (let i = 1; i <= period && i < trs.length; i++) sum += trs[i]!;
  if (trs.length <= period) return out;
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]!) / period;
    out[i] = prev;
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { mid: number[]; upper: number[]; lower: number[] } {
  const mid = sma(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || Number.isNaN(mid[i]!)) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i]!;
    const sd = Math.sqrt(slice.reduce((a, x) => a + (x - m) ** 2, 0) / period);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

export function adx(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(NaN);
  if (cs.length < period + 2) return out;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i]!.h - cs[i - 1]!.h;
    const down = cs[i - 1]!.l - cs[i]!.l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(
        cs[i]!.h - cs[i]!.l,
        Math.abs(cs[i]!.h - cs[i - 1]!.c),
        Math.abs(cs[i]!.l - cs[i - 1]!.c),
      ),
    );
  }
  const smooth = (arr: number[]): number[] => {
    const s: number[] = new Array(arr.length).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i]!;
    s[period] = sum;
    for (let i = period + 1; i < arr.length; i++) {
      s[i] = s[i - 1]! - s[i - 1]! / period + arr[i]!;
    }
    return s;
  };
  const str = smooth(tr);
  const sp = smooth(plusDM);
  const sm = smooth(minusDM);
  const dx: number[] = new Array(cs.length).fill(NaN);
  for (let i = period; i < cs.length; i++) {
    if (!str[i]) continue;
    const pdi = 100 * (sp[i]! / str[i]!);
    const mdi = 100 * (sm[i]! / str[i]!);
    const den = pdi + mdi;
    dx[i] = den === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / den;
  }
  let acc = 0;
  let count = 0;
  for (let i = period; i < period * 2 && i < dx.length; i++) {
    if (!Number.isNaN(dx[i]!)) {
      acc += dx[i]!;
      count++;
    }
  }
  if (count) out[period * 2 - 1] = acc / count;
  for (let i = period * 2; i < dx.length; i++) {
    const prev = out[i - 1];
    if (Number.isNaN(prev as number) || Number.isNaN(dx[i]!)) continue;
    out[i] = (prev! * (period - 1) + dx[i]!) / period;
  }
  return out;
}

export function lastValid(xs: number[]): number {
  for (let i = xs.length - 1; i >= 0; i--) {
    if (Number.isFinite(xs[i])) return xs[i]!;
  }
  return NaN;
}

export function rangeHigh(cs: Candle[], n: number): number {
  const slice = cs.slice(-n);
  return slice.reduce((m, c) => Math.max(m, c.h), -Infinity);
}

export function rangeLow(cs: Candle[], n: number): number {
  const slice = cs.slice(-n);
  return slice.reduce((m, c) => Math.min(m, c.l), Infinity);
}

export function volumeSma(cs: Candle[], period: number): number {
  const slice = cs.slice(-period);
  if (!slice.length) return 0;
  return slice.reduce((a, c) => a + c.v, 0) / slice.length;
}
