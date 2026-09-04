import { getJson } from '../util/http.js';
import { safeNumber } from '../util/num.js';

interface GlobalResponse {
  data?: {
    total_market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
  };
}

interface MarketRow {
  id: string;
  current_price: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  total_volume: number;
}

export interface CoinSnapshot {
  price: number;
  change24h: number;
  change7d: number;
}

export interface Macro {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  marketCapChange24h: number;
  btcDominance: number;
  btc: CoinSnapshot | null;
  eth: CoinSnapshot | null;
  sol: CoinSnapshot | null;
  /** Verhaeltnis 24h-Volumen zu Marktkapitalisierung – Proxy fuer Aktivitaet. */
  turnover: number;
}

const API = 'https://api.coingecko.com/api/v3';

function toSnapshot(row: MarketRow | undefined): CoinSnapshot | null {
  if (!row) return null;
  return {
    price: safeNumber(row.current_price),
    change24h: safeNumber(row.price_change_percentage_24h_in_currency),
    change7d: safeNumber(row.price_change_percentage_7d_in_currency),
  };
}

/**
 * Makro-Bild des Gesamtmarkts. Memecoins sind ein Hebel auf die Majors:
 * faellt BTC/ETH/SOL, sterben Memecoin-Rallyes fast immer zuerst.
 */
export async function fetchMacro(): Promise<Macro | null> {
  const [global, markets] = await Promise.all([
    getJson<GlobalResponse>(`${API}/global`, { cacheMs: 4 * 60_000 }),
    getJson<MarketRow[]>(
      `${API}/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&price_change_percentage=24h,7d`,
      { cacheMs: 2 * 60_000 },
    ),
  ]);

  if (!global?.data && !markets) return null;

  const totalCap = safeNumber(global?.data?.total_market_cap?.usd);
  const totalVol = safeNumber(global?.data?.total_volume?.usd);
  const byId = new Map((markets ?? []).map((row) => [row.id, row]));

  return {
    totalMarketCapUsd: totalCap,
    totalVolumeUsd: totalVol,
    marketCapChange24h: safeNumber(global?.data?.market_cap_change_percentage_24h_usd),
    btcDominance: safeNumber(global?.data?.market_cap_percentage?.btc),
    btc: toSnapshot(byId.get('bitcoin')),
    eth: toSnapshot(byId.get('ethereum')),
    sol: toSnapshot(byId.get('solana')),
    turnover: totalCap > 0 ? totalVol / totalCap : 0,
  };
}
