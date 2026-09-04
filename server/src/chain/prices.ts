import { getJson } from '../util/http.js';
import { safeNumber } from '../util/num.js';

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
};

const fallback: Record<string, number> = {};

/** USD-Preis eines Native-Coins – fuer die Umrechnung von Wallet-Guthaben. */
export async function nativePriceUsd(symbol: string): Promise<number> {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return 0;
  const res = await getJson<Record<string, { usd?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { cacheMs: 60_000 },
  );
  const price = safeNumber(res?.[id]?.usd);
  if (price > 0) {
    fallback[symbol.toUpperCase()] = price;
    return price;
  }
  // Letzter bekannter Preis ist besser als 0 (sonst wirkt das Wallet leer).
  return fallback[symbol.toUpperCase()] ?? 0;
}
