import { getJson } from '../util/http.js';
import { safeNumber } from '../util/num.js';

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  BNB: 'binancecoin',
  SOL: 'solana',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
};

const fallback: Record<string, number> = {};

/** Konservative Defaults wenn CoinGecko rate-limited ist – verhindert „leeres Wallet“. */
const DEFAULT_FALLBACK: Record<string, number> = {
  SOL: 150,
  ETH: 3200,
  BTC: 95000,
  BNB: 580,
};

/** USD-Preis eines Native-Coins – fuer die Umrechnung von Wallet-Guthaben. */
export async function nativePriceUsd(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase();
  const id = COINGECKO_IDS[sym];
  if (!id) return DEFAULT_FALLBACK[sym] ?? 0;
  const res = await getJson<Record<string, { usd?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { cacheMs: 60_000 },
  );
  const price = safeNumber(res?.[id]?.usd);
  if (price > 0) {
    fallback[sym] = price;
    return price;
  }
  // Letzter bekannter Preis ist besser als 0 (sonst wirkt das Wallet leer).
  return fallback[sym] ?? DEFAULT_FALLBACK[sym] ?? 0;
}
