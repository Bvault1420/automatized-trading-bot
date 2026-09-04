import { getJson } from '../util/http.js';
import { clamp, mean, safeNumber, saturate } from '../util/num.js';

interface TrendingResponse {
  coins?: {
    item: {
      id: string;
      name: string;
      symbol: string;
      market_cap_rank: number | null;
      data?: { price_change_percentage_24h?: { usd?: number } };
    };
  }[];
}

interface BoostEntry {
  tokenAddress: string;
  chainId: string;
  amount?: number;
  totalAmount?: number;
  description?: string;
}

export interface SocialIntel {
  /** 0..1 – wie viel Aufmerksamkeit im Spekulationssektor gerade herrscht. */
  heat: number;
  trendingTerms: { term: string; mentions: number }[];
  /** Anteil der trendenden Coins ohne Top-300-Marktkapitalisierung. */
  smallCapShare: number;
  trendingAvgChange24h: number;
  boostVolume: number;
  detail: string;
}

/**
 * Social-/Hype-Messung ohne kostenpflichtige Social-APIs.
 *
 * Zwei robuste Proxys:
 *  1. CoinGecko-Trending – was Retail-Nutzer gerade aktiv suchen.
 *  2. DexScreener-Boosts – wofuer Projekte gerade echtes Geld fuer Sichtbarkeit
 *     ausgeben. Das korreliert stark mit aktiven Memecoin-Kampagnen.
 */
export async function fetchSocial(): Promise<SocialIntel> {
  const [trending, boosts] = await Promise.all([
    getJson<TrendingResponse>('https://api.coingecko.com/api/v3/search/trending', { cacheMs: 3 * 60_000 }),
    getJson<BoostEntry[]>('https://api.dexscreener.com/token-boosts/latest/v1', { cacheMs: 2 * 60_000 }),
  ]);

  const coins = trending?.coins ?? [];
  const changes = coins.map((c) => safeNumber(c.item.data?.price_change_percentage_24h?.usd));
  const smallCaps = coins.filter((c) => (c.item.market_cap_rank ?? 9999) > 300).length;
  const smallCapShare = coins.length > 0 ? smallCaps / coins.length : 0;
  const avgChange = changes.length > 0 ? mean(changes) : 0;

  const boostList = Array.isArray(boosts) ? boosts : [];
  const boostVolume = boostList.reduce((sum, b) => sum + safeNumber(b.totalAmount ?? b.amount), 0);

  const trendingTerms = coins
    .slice(0, 10)
    .map((c) => ({ term: c.item.symbol.toUpperCase(), mentions: Math.max(1, 15 - (c.item.market_cap_rank ?? 15)) }));

  // Hitze = Retail sucht Small Caps (0.45) + Trending-Coins performen (0.3)
  //         + Projekte kaufen aktiv Sichtbarkeit (0.25)
  const heat = clamp(
    0.45 * smallCapShare + 0.3 * clamp((avgChange + 10) / 40, 0, 1) + 0.25 * saturate(boostVolume, 4000),
    0,
    1,
  );

  return {
    heat,
    trendingTerms,
    smallCapShare,
    trendingAvgChange24h: avgChange,
    boostVolume,
    detail: `${coins.length} Trending-Coins (${Math.round(smallCapShare * 100)}% Small Caps, Ø ${avgChange.toFixed(1)}% 24h), ${boostList.length} geboostete Token`,
  };
}
