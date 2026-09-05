import { getJson } from '../util/http.js';
import { createLogger } from '../util/logger.js';
import { safeNumber } from '../util/num.js';
import { fetchFreshTokenAddresses } from '../intel/fresh.js';
import type { PairSnapshot, TokenCandidate } from '../types.js';

const log = createLogger('scanner');
const API = 'https://api.dexscreener.com';

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; socials?: { type: string; url: string }[]; websites?: unknown[] };
  boosts?: { active?: number };
}

interface BoostEntry {
  tokenAddress: string;
  chainId: string;
  amount?: number;
  totalAmount?: number;
}

/** Quote-Token die als Basis-Suchbegriff pro Chain gute Trefferlisten liefern. */
const CHAIN_QUERIES: Record<string, string[]> = {
  base: ['WETH base', 'USDC base'],
  ethereum: ['WETH ethereum'],
  bsc: ['WBNB bsc'],
  solana: ['SOL raydium', 'SOL pumpswap', 'SOL meteora', 'SOL orca', 'pump'],
  arbitrum: ['WETH arbitrum'],
};

/** Token die nie als Handelskandidat taugen (Quote-Assets, Stablecoins, LSTs). */
const EXCLUDED_SYMBOLS = new Set([
  'WETH', 'ETH', 'WBNB', 'BNB', 'SOL', 'WSOL', 'USDC', 'USDT', 'DAI', 'WBTC', 'CBBTC', 'TBTC',
  'USDBC', 'FRAX', 'LUSD', 'WSTETH', 'STETH', 'RETH', 'CBETH', 'EZETH', 'WEETH', 'USDE', 'SUSDE',
  'USDS', 'PYUSD', 'FDUSD', 'TUSD', 'BUSD', 'MSOL', 'JITOSOL', 'BSOL',
]);

function toCandidate(pair: DexPair, boostAmount = 0): TokenCandidate | null {
  const priceUsd = safeNumber(pair.priceUsd);
  const liquidityUsd = safeNumber(pair.liquidity?.usd);
  if (priceUsd <= 0 || !pair.pairAddress || !pair.baseToken?.address) return null;

  const symbol = (pair.baseToken.symbol ?? '').toUpperCase();
  if (EXCLUDED_SYMBOLS.has(symbol)) return null;

  const createdAt = safeNumber(pair.pairCreatedAt);
  const ageHours = createdAt > 0 ? (Date.now() - createdAt) / 3_600_000 : 24 * 365;

  return {
    id: `${pair.chainId}:${pair.pairAddress}`,
    chain: pair.chainId,
    pairAddress: pair.pairAddress,
    tokenAddress: pair.baseToken.address,
    symbol: pair.baseToken.symbol ?? '???',
    name: pair.baseToken.name ?? pair.baseToken.symbol ?? 'Unbekannt',
    dex: [pair.dexId, ...(pair.labels ?? [])].filter(Boolean).join(' '),
    url: pair.url,
    priceUsd,
    priceNative: safeNumber(pair.priceNative),
    liquidityUsd,
    fdv: safeNumber(pair.fdv),
    marketCap: safeNumber(pair.marketCap ?? pair.fdv),
    volume: {
      m5: safeNumber(pair.volume?.m5),
      h1: safeNumber(pair.volume?.h1),
      h6: safeNumber(pair.volume?.h6),
      h24: safeNumber(pair.volume?.h24),
    },
    priceChange: {
      m5: safeNumber(pair.priceChange?.m5),
      h1: safeNumber(pair.priceChange?.h1),
      h6: safeNumber(pair.priceChange?.h6),
      h24: safeNumber(pair.priceChange?.h24),
    },
    txns: {
      m5: { buys: safeNumber(pair.txns?.m5?.buys), sells: safeNumber(pair.txns?.m5?.sells) },
      h1: { buys: safeNumber(pair.txns?.h1?.buys), sells: safeNumber(pair.txns?.h1?.sells) },
    },
    pairCreatedAt: createdAt,
    ageHours,
    boosts: boostAmount || safeNumber(pair.boosts?.active),
    hasSocials: Boolean(pair.info?.socials?.length || pair.info?.websites?.length),
    imageUrl: pair.info?.imageUrl,
  };
}

async function searchPairs(query: string): Promise<DexPair[]> {
  const res = await getJson<{ pairs?: DexPair[] }>(
    `${API}/latest/dex/search?q=${encodeURIComponent(query)}`,
    { cacheMs: 20_000, timeoutMs: 12_000 },
  );
  return res?.pairs ?? [];
}

async function resolveTokens(chainId: string, addresses: string[]): Promise<DexPair[]> {
  const out: DexPair[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30).join(',');
    const res = await getJson<{ pairs?: DexPair[] } | DexPair[]>(`${API}/latest/dex/tokens/${batch}`, {
      cacheMs: 20_000,
      timeoutMs: 12_000,
    });
    const pairs = Array.isArray(res) ? res : (res?.pairs ?? []);
    out.push(...pairs.filter((p) => p.chainId === chainId));
  }
  return out;
}

/** Token fuer die aktuell Sichtbarkeit gekauft wird – starkes Hype-Signal. */
async function fetchBoosted(chains: string[]): Promise<Map<string, number>> {
  const [top, latest] = await Promise.all([
    getJson<BoostEntry[]>(`${API}/token-boosts/top/v1`, { cacheMs: 60_000 }),
    getJson<BoostEntry[]>(`${API}/token-boosts/latest/v1`, { cacheMs: 60_000 }),
  ]);
  const map = new Map<string, number>();
  for (const entry of [...(top ?? []), ...(latest ?? [])]) {
    if (!entry?.tokenAddress || !chains.includes(entry.chainId)) continue;
    const key = `${entry.chainId}:${entry.tokenAddress.toLowerCase()}`;
    map.set(key, Math.max(map.get(key) ?? 0, safeNumber(entry.totalAmount ?? entry.amount)));
  }
  return map;
}

/**
 * Sammelt Handelskandidaten aus mehreren DexScreener-Quellen und behaelt pro
 * Token nur das Paar mit der hoechsten Liquiditaet (dort ist die Slippage am
 * geringsten).
 */
export async function discoverCandidates(
  chains: string[],
  minLiquidityUsd: number,
  extraQueries: string[] = [],
): Promise<TokenCandidate[]> {
  const [boosts, freshAddresses] = await Promise.all([
    fetchBoosted(chains).catch(() => new Map<string, number>()),
    fetchFreshTokenAddresses(chains).catch(() => new Map<string, string[]>()),
  ]);

  const tasks: Promise<DexPair[]>[] = [];
  for (const chain of chains) {
    for (const query of CHAIN_QUERIES[chain] ?? [chain]) {
      tasks.push(searchPairs(query).catch(() => []));
    }
    for (const term of extraQueries.slice(0, 6)) {
      tasks.push(searchPairs(`${term} ${chain}`).catch(() => []));
    }
    const addresses = [
      ...[...boosts.keys()]
        .filter((key) => key.startsWith(`${chain}:`))
        .map((key) => key.slice(chain.length + 1)),
      ...(freshAddresses.get(chain) ?? []),
    ].slice(0, 80);
    if (addresses.length > 0) tasks.push(resolveTokens(chain, addresses).catch(() => []));
  }

  const pairs = (await Promise.all(tasks)).flat();

  const bestByToken = new Map<string, TokenCandidate>();
  for (const pair of pairs) {
    if (!chains.includes(pair.chainId)) continue;
    const boostKey = `${pair.chainId}:${pair.baseToken?.address?.toLowerCase()}`;
    const candidate = toCandidate(pair, boosts.get(boostKey) ?? 0);
    if (!candidate) continue;
    if (candidate.liquidityUsd < minLiquidityUsd) continue;
    if (candidate.ageHours < 0.2) continue;
    if (candidate.volume.h1 < 2_000) continue;
    if (candidate.priceChange.h24 < -45) continue;
    if (candidate.priceChange.m5 < -12) continue;
    if (candidate.priceChange.h1 < -22) continue;

    const tokenKey = `${candidate.chain}:${candidate.tokenAddress.toLowerCase()}`;
    const existing = bestByToken.get(tokenKey);
    if (!existing || candidate.liquidityUsd > existing.liquidityUsd) bestByToken.set(tokenKey, candidate);
  }

  const result = [...bestByToken.values()];
  log.debug(`${pairs.length} Paare geladen → ${result.length} Kandidaten nach Vorfilter`);
  return result;
}

/** Aktueller Preis eines bekannten Paares (fuer Positions-Updates). */
export async function fetchPairSnapshot(
  chain: string,
  pairAddress: string,
): Promise<PairSnapshot | null> {
  const res = await getJson<{ pairs?: DexPair[] } | DexPair[]>(`${API}/latest/dex/pairs/${chain}/${pairAddress}`, {
    cacheMs: 2_500,
    timeoutMs: 8_000,
  });
  const pairs = Array.isArray(res) ? res : (res?.pairs ?? []);
  const pair = pairs[0];
  if (!pair) return null;
  const priceUsd = safeNumber(pair.priceUsd);
  if (priceUsd <= 0) return null;
  return {
    priceUsd,
    liquidityUsd: safeNumber(pair.liquidity?.usd),
    priceChangeM5: safeNumber(pair.priceChange?.m5),
    priceChangeH1: safeNumber(pair.priceChange?.h1),
    volumeM5: safeNumber(pair.volume?.m5),
    buysM5: safeNumber(pair.txns?.m5?.buys),
    sellsM5: safeNumber(pair.txns?.m5?.sells),
  };
}
