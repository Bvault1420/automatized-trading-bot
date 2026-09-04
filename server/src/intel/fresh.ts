import { XMLParser } from 'fast-xml-parser';
import { getJson, getText } from '../util/http.js';
import { analyzeSentiment } from './sentiment.js';
import { annotateNewsItem, isJunkNews } from './importance.js';
import { clamp } from '../util/num.js';
import type { NewsItem } from '../types.js';

const rssParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const TICKER_RE = /\$([A-Z]{2,12})\b/g;
const WORD_TICKER_RE = /\b([A-Z]{3,10})\b/g;
const STOP = new Set([
  'THE', 'AND', 'FOR', 'YOU', 'THIS', 'THAT', 'WITH', 'FROM', 'JUST', 'HAVE', 'WILL',
  'NOT', 'ARE', 'WAS', 'BUT', 'ALL', 'CAN', 'NOW', 'NEW', 'ONE', 'OUT', 'GET', 'GOT',
  'USD', 'USDT', 'USDC', 'BTC', 'ETH', 'SOL', 'BNB', 'ATH', 'ATHS', 'CEO', 'ETF',
  'SEC', 'USD', 'IMO', 'LOL', 'WTF', 'USA', 'NFT', 'DEX', 'APY', 'TVL', 'MCAP',
]);

export interface FreshMention {
  term: string;
  mentions: number;
  newestAgeMin: number;
}

export interface FreshIntel {
  posts: NewsItem[];
  mentions: FreshMention[];
  freshCount: number;
  windowMinutes: 30;
  heat: number;
  detail: string;
}

interface RedditListing {
  data?: {
    children?: { data?: { title?: string; url?: string; created_utc?: number; subreddit?: string; permalink?: string } }[];
  };
}

interface DexProfile {
  chainId?: string;
  tokenAddress?: string;
  description?: string;
  url?: string;
}

const REDDITS = [
  'CryptoMoonShots',
  'memecoins',
  'SolanaMemeCoins',
  'pumpdotfun',
  'SatoshiStreetBets',
  'cryptomoonshots',
];

function collectTickers(text: string, into: Map<string, { mentions: number; newest: number }>, at: number): void {
  const upper = text.toUpperCase();
  for (const match of upper.matchAll(TICKER_RE)) {
    const term = match[1];
    if (!term || STOP.has(term)) continue;
    const prev = into.get(term);
    into.set(term, { mentions: (prev?.mentions ?? 0) + 1, newest: Math.min(prev?.newest ?? at, at) });
  }
  for (const match of text.matchAll(WORD_TICKER_RE)) {
    const term = match[1];
    if (!term || STOP.has(term) || term.length > 8) continue;
    const prev = into.get(term);
    into.set(term, { mentions: (prev?.mentions ?? 0) + 0.35, newest: Math.min(prev?.newest ?? at, at) });
  }
}

function redditItem(title: string, url: string, publishedAt: number, sub: string): NewsItem[] {
  if (!title) return [];
  const { score, matchedTerms } = analyzeSentiment(title);
  return [
    annotateNewsItem({
      title,
      url,
      source: `Reddit r/${sub}`,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now(),
      sentiment: score,
      matchedTerms,
    }),
  ];
}

async function fetchSubredditRss(sub: string): Promise<NewsItem[]> {
  const xml = await getText(`https://www.reddit.com/r/${sub}/new/.rss`, { cacheMs: 40_000, timeoutMs: 8_000 });
  if (!xml) return [];
  try {
    const parsed = rssParser.parse(xml) as Record<string, any>;
    const raw = parsed?.feed?.entry ?? parsed?.rss?.channel?.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];
    return items.slice(0, 25).flatMap((item) => {
      const title = typeof item.title === 'string' ? item.title : String(item.title?.['#text'] ?? '');
      const link =
        typeof item.link === 'string'
          ? item.link
          : String(item.link?.['@_href'] ?? item.link?.['#text'] ?? '');
      const dateRaw = item.updated ?? item.published ?? item.pubDate;
      const publishedAt = dateRaw ? new Date(String(dateRaw)).getTime() : Date.now();
      return redditItem(title.trim(), link, publishedAt, sub);
    });
  } catch {
    return [];
  }
}

async function fetchSubreddit(sub: string): Promise<NewsItem[]> {
  const fromRss = await fetchSubredditRss(sub);
  if (fromRss.length > 0) return fromRss;

  const res = await getJson<RedditListing>(`https://www.reddit.com/r/${sub}/new.json?limit=40&raw_json=1`, {
    cacheMs: 40_000,
    timeoutMs: 8_000,
    headers: { accept: 'application/json' },
  });
  return (res?.data?.children ?? []).flatMap((row) => {
    const post = row.data;
    if (!post?.title) return [];
    const publishedAt = (post.created_utc ?? 0) * 1000 || Date.now();
    return redditItem(
      post.title,
      post.permalink ? `https://www.reddit.com${post.permalink}` : (post.url ?? ''),
      publishedAt,
      post.subreddit ?? sub,
    );
  });
}

async function fetchDexProfiles(): Promise<NewsItem[]> {
  const profiles = await getJson<DexProfile[]>('https://api.dexscreener.com/token-profiles/latest/v1', {
    cacheMs: 45_000,
    timeoutMs: 8_000,
  });
  if (!Array.isArray(profiles)) return [];
  const now = Date.now();
  return profiles.slice(0, 40).flatMap((profile) => {
    const text = (profile.description ?? '').trim();
    if (!text) return [];
    const { score, matchedTerms } = analyzeSentiment(text);
    return [
      annotateNewsItem({
        title: text.slice(0, 180),
        url: profile.url ?? '',
        source: `DexScreener Profil (${profile.chainId ?? '?'})`,
        publishedAt: now,
        sentiment: score,
        matchedTerms,
      }),
    ];
  });
}

/**
 * Posts und Mentions der letzten Minuten: Reddit-New, DexScreener-Profile.
 * Das ist der frische Retail-Tape, den RSS-Feeds (Stunden) nicht abdecken.
 */
export async function fetchFresh(): Promise<FreshIntel> {
  const results = await Promise.allSettled([
    ...REDDITS.map((sub) => fetchSubreddit(sub)),
    fetchDexProfiles(),
  ]);

  const posts = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .map((item) => (item.importanceTier ? item : annotateNewsItem(item)));
  const now = Date.now();
  const windowMs = 30 * 60_000;
  const recent = posts.filter((p) => now - p.publishedAt <= windowMs && !isJunkNews(p));
  const mentionMap = new Map<string, { mentions: number; newest: number }>();
  for (const post of recent) {
    collectTickers(`${post.title} ${post.matchedTerms.join(' ')}`, mentionMap, post.publishedAt);
  }

  const mentions = [...mentionMap.entries()]
    .map(([term, value]) => ({
      term,
      mentions: Math.round(value.mentions * 10) / 10,
      newestAgeMin: Math.max(0, (now - value.newest) / 60_000),
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 20);

  const freshCount = recent.length;
  const heat = clamp(freshCount / 40, 0, 1);

  return {
    posts: posts
      .filter((p) => !isJunkNews(p))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 40),
    mentions,
    freshCount,
    windowMinutes: 30,
    heat,
    detail:
      freshCount > 0
        ? `${freshCount} Posts der letzten 30 Min. · heiß: ${mentions
            .slice(0, 5)
            .map((m) => `$${m.term}`)
            .join(', ') || '–'}`
        : 'Keine frischen Retail-Posts in den letzten 30 Minuten',
  };
}

export function mentionBoost(symbol: string, mentions: FreshMention[]): number {
  const key = symbol.toUpperCase();
  const hit = mentions.find((m) => m.term === key);
  if (!hit) return 0;
  const recency = hit.newestAgeMin <= 8 ? 1 : hit.newestAgeMin <= 20 ? 0.7 : 0.4;
  return clamp(0.08 + 0.06 * Math.min(hit.mentions, 4) * recency, 0, 0.22);
}

export function geckoNetwork(chain: string): string | null {
  if (chain === 'solana') return 'solana';
  if (chain === 'base') return 'base';
  if (chain === 'bsc') return 'bsc';
  if (chain === 'ethereum') return 'eth';
  return null;
}

export async function fetchFreshTokenAddresses(chains: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const tasks: Promise<void>[] = [];

  const profiles = getJson<DexProfile[]>('https://api.dexscreener.com/token-profiles/latest/v1', {
    cacheMs: 45_000,
    timeoutMs: 8_000,
  }).then((list) => {
    for (const profile of list ?? []) {
      if (!profile.chainId || !profile.tokenAddress || !chains.includes(profile.chainId)) continue;
      const bucket = out.get(profile.chainId) ?? [];
      bucket.push(profile.tokenAddress);
      out.set(profile.chainId, bucket);
    }
  });
  tasks.push(profiles.catch(() => undefined));

  for (const chain of chains) {
    const network = geckoNetwork(chain);
    if (!network) continue;
    tasks.push(
      getJson<{ data?: { relationships?: { base_token?: { data?: { id?: string } } } }[] }>(
        `https://api.geckoterminal.com/api/v2/networks/${network}/new_pools?page=1`,
        { cacheMs: 50_000, timeoutMs: 8_000, headers: { accept: 'application/json' } },
      )
        .then((res) => {
          for (const pool of res?.data ?? []) {
            const id = pool.relationships?.base_token?.data?.id ?? '';
            const address = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id;
            if (!address) continue;
            const bucket = out.get(chain) ?? [];
            bucket.push(address);
            out.set(chain, bucket);
          }
        })
        .catch(() => undefined),
    );
  }

  if (chains.includes('solana')) {
    tasks.push(
      getJson<Array<Record<string, unknown>> | { coins?: Array<Record<string, unknown>> }>(
        'https://frontend-api-v3.pump.fun/coins?offset=0&limit=40&sort=last_trade_timestamp&order=DESC&includeNsfw=false',
        { cacheMs: 40_000, timeoutMs: 8_000 },
      )
        .then((res) => {
          const coins = Array.isArray(res) ? res : (res?.coins ?? []);
          const bucket = out.get('solana') ?? [];
          for (const coin of coins) {
            const mint = typeof coin.mint === 'string' ? coin.mint : typeof coin.coinMint === 'string' ? coin.coinMint : null;
            if (mint) bucket.push(mint);
          }
          out.set('solana', bucket);
        })
        .catch(() => undefined),
    );
  }

  await Promise.all(tasks);
  for (const [chain, addresses] of out) {
    out.set(chain, [...new Set(addresses.map((a) => a.trim()).filter(Boolean))].slice(0, 50));
  }
  return out;
}
