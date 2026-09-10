import { config } from '../config.js';
import { getJson } from '../util/http.js';
import { createLogger } from '../util/logger.js';
import type { Candle } from '../types.js';

const log = createLogger('fx');
let eurUsd = 1.08;
let last = 0;

export async function refreshEurUsd(): Promise<number> {
  if (Date.now() - last < 60_000 && eurUsd) return eurUsd;
  try {
    const rows = (await getJson(
      `${config.binance.baseUrl}/api/v3/klines?symbol=EURUSDT&interval=1h&limit=2`,
    )) as number[][];
    const px = Number(rows.at(-1)?.[4]);
    if (px > 0) {
      eurUsd = px;
      last = Date.now();
    }
  } catch (err) {
    log.warn(`EUR-Kurs nicht aktualisiert: ${(err as Error).message}`);
  }
  return eurUsd;
}

export function usdtToEur(usdt: number): number {
  return eurUsd > 0 ? usdt / eurUsd : usdt / 1.08;
}

export function usdToEur(usd: number): number {
  return usdtToEur(usd);
}

export function candlesFromBinance(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => ({
    t: Number(row[0]),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
  }));
}
