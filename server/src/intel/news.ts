import { XMLParser } from 'fast-xml-parser';
import { getJson, getText } from '../util/http.js';
import { analyzeSentiment, countMemeMentions } from './sentiment.js';
import { config } from '../config.js';
import type { NewsItem } from '../types.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const FEEDS: { url: string; source: string }[] = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
  { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  { url: 'https://bitcoinmagazine.com/feed', source: 'Bitcoin Magazine' },
  { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
  { url: 'https://www.newsbtc.com/feed/', source: 'NewsBTC' },
  { url: 'https://www.theblock.co/rss.xml', source: 'The Block' },
  { url: 'https://news.google.com/rss/search?q=crypto+market+when:1h&hl=en-US&gl=US&ceid=US:en', source: 'Google News 1h' },
  {
    url: 'https://news.google.com/rss/search?q=memecoin+OR+%22meme+coin%22+OR+pump.fun+when:1h&hl=en-US&gl=US&ceid=US:en',
    source: 'Google News Memes 1h',
  },
  {
    url: 'https://news.google.com/rss/search?q=solana+memecoin+when:1h&hl=en-US&gl=US&ceid=US:en',
    source: 'Google News Solana',
  },
];

interface RssItem {
  title?: string | { '#text'?: string };
  link?: string | { '@_href'?: string };
  pubDate?: string;
  published?: string;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

function linkOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj['@_href'] ?? obj['#text'] ?? '');
  }
  return '';
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  const xml = await getText(url, { cacheMs: 90_000, timeoutMs: 10_000 });
  if (!xml) return [];
  try {
    const parsed = parser.parse(xml) as Record<string, any>;
    const rawItems: RssItem[] = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return items.slice(0, 25).flatMap((item) => {
      const title = textOf(item.title).trim();
      if (!title) return [];
      const dateRaw = item.pubDate ?? item.published;
      const publishedAt = dateRaw ? new Date(String(dateRaw)).getTime() : Date.now();
      const { score, matchedTerms } = analyzeSentiment(title);
      return [
        {
          title,
          url: linkOf(item.link),
          source,
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now(),
          sentiment: score,
          matchedTerms,
        },
      ];
    });
  } catch {
    return [];
  }
}

interface CryptoPanicResponse {
  results?: { title: string; url: string; published_at: string; votes?: Record<string, number> }[];
}

async function fetchCryptoPanic(): Promise<NewsItem[]> {
  if (!config.cryptoPanicKey) return [];
  const res = await getJson<CryptoPanicResponse>(
    `https://cryptopanic.com/api/v1/posts/?auth_token=${config.cryptoPanicKey}&public=true&kind=news`,
    { cacheMs: 90_000 },
  );
  return (res?.results ?? []).slice(0, 25).map((post) => {
    const { score, matchedTerms } = analyzeSentiment(post.title);
    // CryptoPanic-Community-Votes ueberschreiben das Lexikon, wenn vorhanden.
    const positive = (post.votes?.positive ?? 0) + (post.votes?.important ?? 0);
    const negative = (post.votes?.negative ?? 0) + (post.votes?.toxic ?? 0);
    const voteScore = positive + negative > 0 ? (positive - negative) / (positive + negative) : null;
    return {
      title: post.title,
      url: post.url,
      source: 'CryptoPanic',
      publishedAt: new Date(post.published_at).getTime() || Date.now(),
      sentiment: voteScore ?? score,
      matchedTerms,
    };
  });
}

export interface NewsIntel {
  sentiment: number;
  bullishCount: number;
  bearishCount: number;
  items: NewsItem[];
  memeTerms: { term: string; mentions: number }[];
}

/**
 * Aggregiertes Nachrichten-Sentiment. Frische Meldungen werden staerker
 * gewichtet (Halbwertszeit ~6h), damit alte Schlagzeilen das Bild nicht
 * dominieren.
 */
export async function fetchNews(): Promise<NewsIntel> {
  const results = await Promise.all([
    ...FEEDS.map((feed) => fetchFeed(feed.url, feed.source)),
    fetchCryptoPanic(),
  ]);

  const seen = new Set<string>();
  const items = results
    .flat()
    .filter((item) => {
      const key = item.title.toLowerCase().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 60);

  const now = Date.now();
  let weightedSum = 0;
  let weightTotal = 0;
  let bullishCount = 0;
  let bearishCount = 0;

  for (const item of items) {
    const ageHours = Math.max(0, (now - item.publishedAt) / 3_600_000);
    // Sehr frische Meldungen (Minuten) dominieren, aeltere klingen in ~2h ab.
    const weight = Math.exp(-ageHours / 2);
    if (item.sentiment !== 0) {
      weightedSum += item.sentiment * weight;
      weightTotal += weight;
    }
    if (item.sentiment > 0.15) bullishCount++;
    else if (item.sentiment < -0.15) bearishCount++;
  }

  return {
    sentiment: weightTotal > 0 ? Math.max(-1, Math.min(1, weightedSum / weightTotal)) : 0,
    bullishCount,
    bearishCount,
    items,
    memeTerms: countMemeMentions(items.map((i) => i.title)),
  };
}
