import type { NewsItem } from '../types.js';

export type ImportanceTier = 'high' | 'medium' | 'low' | 'junk';

export interface ImportanceVerdict {
  score: number;
  tier: ImportanceTier;
  why: string;
  actors: string[];
}

const SOURCE_TRUST: { match: RegExp; trust: number; label: string }[] = [
  { match: /reuters|bloomberg|wsj|financial times|ft\.com/i, trust: 0.86, label: 'Leitmedium' },
  { match: /the block/i, trust: 0.78, label: 'The Block' },
  { match: /coindesk/i, trust: 0.76, label: 'CoinDesk' },
  { match: /bitcoin magazine/i, trust: 0.7, label: 'Bitcoin Magazine' },
  { match: /decrypt/i, trust: 0.62, label: 'Decrypt' },
  { match: /cointelegraph/i, trust: 0.58, label: 'Cointelegraph' },
  { match: /cryptoslate/i, trust: 0.55, label: 'CryptoSlate' },
  { match: /cryptopanic/i, trust: 0.5, label: 'CryptoPanic' },
  { match: /google news 1h/i, trust: 0.5, label: 'Google News Markt' },
  { match: /newsbtc/i, trust: 0.4, label: 'NewsBTC' },
  { match: /google news/i, trust: 0.34, label: 'Google News' },
  { match: /reddit/i, trust: 0.22, label: 'Reddit' },
  { match: /dexscreener/i, trust: 0.14, label: 'Token-Promo' },
];

/** Politik, Aufsicht, große Firmen, Fonds, Börsen, bekannte Trader. */
const ACTORS: { re: RegExp; label: string; boost: number }[] = [
  { re: /\b(sec|cftc|doj|fed|fomc|ecb|imf|treasury|white house|congress|senate|parliament)\b/i, label: 'Aufsicht/Politik', boost: 0.34 },
  { re: /\b(trump|biden|harris|powell|yellen|gensler|lutz|warren|macron|scholz|merz)\b/i, label: 'Politiker', boost: 0.32 },
  { re: /\b(blackrock|fidelity|vanguard|goldman|jpmorgan|jp morgan|morgan stanley|citadel|bridgewater)\b/i, label: 'Großfonds', boost: 0.34 },
  { re: /\b(microstrategy|strategy|saylor|tesla|apple|microsoft|google|nvidia|amazon|paypal|visa|mastercard)\b/i, label: 'Großfirma', boost: 0.3 },
  { re: /\b(binance|coinbase|kraken|okx|bybit|circle|tether|ishares|grayscale|galaxy|a16z|paradigm|jump trading|wintermute)\b/i, label: 'Krypto-Firma', boost: 0.28 },
  { re: /\b(cz|changpeng|zhao|arthur hayes|raoul pal|tom lee|cathie wood|novogratz|whale)\b/i, label: 'großer Trader', boost: 0.26 },
  { re: /\b(etf|spot etf|interest rate|rate cut|rate hike|ban|lawsuit|subpoena|hack|exploit|insolvency|bankruptcy)\b/i, label: 'Markt-Ereignis', boost: 0.22 },
];

const JUNK: { re: RegExp; label: string }[] = [
  { re: /\b(100x|1000x|10000x|to the moon|moonshot|easy profit|guaranteed|risk[- ]free)\b/i, label: 'Rendite-Clickbait' },
  { re: /\b(giveaway|airdrop claim|free mint|claim now|whitelisted|presale live)\b/i, label: 'Giveaway/Airdrop' },
  { re: /\b(join (our )?telegram|signal group|dm me|whatsapp group|paid promo|shill)\b/i, label: 'Promo-Kanal' },
  { re: /\b(next (pepe|bonk|doge|shib|wif)|this (coin|gem) will|secret alpha|leaked call)\b/i, label: 'Anonymer Hype' },
  { re: /\b(you won'?t believe|shocking|insane gains|must buy now|don'?t miss)\b/i, label: 'Clickbait' },
  { re: /\b(price prediction|targets? \$|buy signal|sell signal)\b/i, label: 'Wahrsager-Call' },
];

function sourceTrust(source: string): { trust: number; label: string } {
  for (const row of SOURCE_TRUST) {
    if (row.match.test(source)) return { trust: row.trust, label: row.label };
  }
  return { trust: 0.4, label: source || 'unbekannte Quelle' };
}

function findActors(title: string): { labels: string[]; boost: number } {
  const labels: string[] = [];
  let boost = 0;
  for (const actor of ACTORS) {
    if (!actor.re.test(title)) continue;
    labels.push(actor.label);
    boost += actor.boost;
  }
  return { labels: [...new Set(labels)], boost: Math.min(0.55, boost) };
}

function junkFlags(title: string): string[] {
  return JUNK.filter((row) => row.re.test(title)).map((row) => row.label);
}

function shoutScore(title: string): number {
  const letters = title.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 12) return 0;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.62 ? 0.18 : 0;
}

/**
 * Kleiner Heuristik-Filter: Quelle + benannte Akteure vs. Clickbait.
 * Das ist kein Fakten-Check – nur Gewichtung, damit Lärm das Sentiment nicht dreht.
 */
export function scoreImportance(title: string, source: string): ImportanceVerdict {
  const src = sourceTrust(source);
  const actors = findActors(title);
  const junk = junkFlags(title);
  const shout = shoutScore(title);

  let score = src.trust + actors.boost - junk.length * 0.28 - shout;
  if (actors.labels.length >= 2) score += 0.08;
  if (junk.length > 0 && actors.labels.length === 0) score -= 0.16;
  score = Math.max(0, Math.min(1, score));

  let tier: ImportanceTier;
  if ((junk.length > 0 && actors.labels.length === 0 && src.trust < 0.55) || score < 0.28) {
    tier = 'junk';
  } else if (score >= 0.68 || (actors.labels.length > 0 && src.trust >= 0.55)) {
    tier = score >= 0.68 ? 'high' : 'medium';
    if (actors.labels.length > 0 && src.trust >= 0.7 && score >= 0.55) tier = 'high';
  } else if (score >= 0.45) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  const whyParts: string[] = [src.label];
  if (actors.labels.length) whyParts.push(actors.labels.join(', '));
  if (junk.length) whyParts.push(`Lärm: ${junk.join(', ')}`);
  if (shout) whyParts.push('GROSSBUCHSTABEN');

  return {
    score: Number(score.toFixed(3)),
    tier,
    why: whyParts.join(' · '),
    actors: actors.labels,
  };
}

export function annotateNewsItem(item: NewsItem): NewsItem {
  const verdict = scoreImportance(item.title, item.source);
  return {
    ...item,
    importance: verdict.score,
    importanceTier: verdict.tier,
    importanceWhy: verdict.why,
  };
}

export function isJunkNews(item: NewsItem): boolean {
  return (item.importanceTier ?? scoreImportance(item.title, item.source).tier) === 'junk';
}

export function newsDisplayWeight(item: NewsItem): number {
  const tier = item.importanceTier ?? 'medium';
  if (tier === 'high') return 3;
  if (tier === 'medium') return 2;
  if (tier === 'low') return 1;
  return 0;
}
