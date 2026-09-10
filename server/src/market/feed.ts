import { config } from '../config.js';
import { candlesFromBinance, refreshEurUsd, usdToEur, usdtToEur } from './fx.js';
import { UNIVERSE } from './universe.js';
import { getJson } from '../util/http.js';
import { createLogger } from '../util/logger.js';
import { adx, atr, closes, lastValid, rsi } from './indicators.js';
import type { Candle, Instrument, MarketSnapshot, VenueId } from '../types.js';

const log = createLogger('market');

const candles = new Map<string, Candle[]>();
const prices = new Map<string, { venue: VenueId; priceEur: number; at: number }>();

export function getCandles(id: string): Candle[] {
  return candles.get(id) ?? [];
}

export function lastPriceEur(id: string): number | undefined {
  return prices.get(id)?.priceEur;
}

export function lastVenue(id: string): VenueId {
  return prices.get(id)?.venue ?? (UNIVERSE.find((x) => x.id === id)?.assetClass === 'crypto' ? 'binance' : 'paper');
}

export async function refreshUniverse(opts: { crypto: boolean; stocks: boolean }): Promise<void> {
  await refreshEurUsd();
  const list = UNIVERSE.filter((i) => (i.assetClass === 'crypto' ? opts.crypto : opts.stocks));
  const jobs = list.map((inst) => async () => {
    try {
      if (inst.assetClass === 'crypto') await refreshCrypto(inst);
      else if (usSessionOpen()) await refreshYahoo(inst);
    } catch (err) {
      log.warn(`${inst.id}: ${(err as Error).message}`);
    }
  });
  await pool(jobs, 5);
}

async function pool(jobs: Array<() => Promise<void>>, n: number): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++]!;
      await job();
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, () => worker()));
}

function remember(inst: Instrument, cs: Candle[], venue: VenueId): boolean {
  if (!cs.length) return false;
  candles.set(inst.id, cs);
  prices.set(inst.id, { venue, priceEur: usdtToEur(cs[cs.length - 1]!.c), at: Date.now() });
  return true;
}

async function refreshCrypto(inst: Instrument): Promise<void> {
  const symbol = inst.binance ?? inst.id;
  const sources: Array<() => Promise<boolean>> = [
    async () => remember(inst, candlesFromBinance(await getJson(`${config.binance.dataUrl}/api/v3/klines?symbol=${symbol}&interval=15m&limit=200`)), 'binance'),
    async () => remember(inst, candlesFromBinance(await getJson(`${config.binance.baseUrl}/api/v3/klines?symbol=${symbol}&interval=15m&limit=200`)), 'binance'),
    async () => remember(inst, await krakenCandles(inst), 'kraken'),
    async () => remember(inst, await coinbaseCandles(inst), 'coinbase'),
  ];
  for (const src of sources) {
    try {
      if (await src()) return;
    } catch {
      /* nächste Quelle */
    }
  }
  log.warn(`${inst.id}: keine Krypto-Quelle erreichbar`);
}

function krakenPair(inst: Instrument): string {
  const base = inst.base === 'BTC' ? 'XBT' : inst.base;
  return `${base}USDT`;
}

async function krakenCandles(inst: Instrument): Promise<Candle[]> {
  const raw = (await getJson(`https://api.kraken.com/0/public/OHLC?pair=${krakenPair(inst)}&interval=15`)) as {
    error?: string[];
    result?: Record<string, unknown>;
  };
  if (raw.error?.length) throw new Error(raw.error.join(','));
  const rows = Object.entries(raw.result ?? {}).find(([k]) => k !== 'last')?.[1];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    t: Number(row[0]) * 1000,
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[6]),
  }));
}

async function coinbaseCandles(inst: Instrument): Promise<Candle[]> {
  const raw = (await getJson(
    `https://api.exchange.coinbase.com/products/${inst.base}-USDT/candles?granularity=900`,
  )) as number[][];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      t: Number(row[0]) * 1000,
      l: Number(row[1]),
      h: Number(row[2]),
      o: Number(row[3]),
      c: Number(row[4]),
      v: Number(row[5]),
    }))
    .sort((a, b) => a.t - b.t);
}

async function refreshYahoo(inst: Instrument): Promise<void> {
  const symbol = inst.yahoo ?? inst.id;
  const raw = (await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=15m&range=5d`,
  )) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
      }>;
    };
  };
  const res = raw.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0];
  if (!q || !ts.length) throw new Error('Yahoo leer');
  const cs: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (![o, h, l, c].every((x) => Number.isFinite(x))) continue;
    cs.push({ t: ts[i]! * 1000, o: o!, h: h!, l: l!, c: c!, v: q.volume?.[i] ?? 0 });
  }
  if (!cs.length) throw new Error('Yahoo Kerzen ungültig');
  candles.set(inst.id, cs);
  prices.set(inst.id, { venue: 'alpaca', priceEur: usdToEur(cs[cs.length - 1]!.c), at: Date.now() });
}

export function snapshotOf(inst: Instrument): MarketSnapshot | null {
  const cs = getCandles(inst.id);
  const px = lastPriceEur(inst.id);
  if (!cs.length || !px) return null;
  const c = closes(cs);
  const prev = cs.length > 16 ? cs[cs.length - 17]!.c : cs[0]!.c;
  const rsiNow = lastValid(rsi(c, 14));
  const adxNow = lastValid(adx(cs, 14));
  const atrNow = lastValid(atr(cs, 14));
  const lastC = cs[cs.length - 1]!.c;
  return {
    instrumentId: inst.id,
    display: inst.display,
    assetClass: inst.assetClass,
    price: px,
    venue: lastVenue(inst.id),
    changePct: prev ? ((lastC - prev) / prev) * 100 : 0,
    atrPct: lastC ? (atrNow / lastC) * 100 : 0,
    rsi: rsiNow || 0,
    adx: adxNow || 0,
    updatedAt: Date.now(),
  };
}

export function usSessionOpen(now = Date.now()): boolean {
  const d = new Date(now);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return minutes >= 13 * 60 + 30 && minutes <= 20 * 60;
}

export function allSnapshots(): MarketSnapshot[] {
  return UNIVERSE.map(snapshotOf).filter((x): x is MarketSnapshot => Boolean(x));
}
