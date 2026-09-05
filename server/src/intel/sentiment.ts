/**
 * Leichtgewichtige Sentiment-Analyse fuer Krypto-Schlagzeilen.
 *
 * Statt eines externen Modells nutzen wir ein domaenenspezifisches Lexikon:
 * generische Sentiment-Modelle bewerten Krypto-Vokabular ("rug", "halving",
 * "ETF inflow") systematisch falsch, ein handgepflegtes Lexikon ist hier
 * deutlich treffsicherer und kostet keine Latenz.
 */

const POSITIVE: Record<string, number> = {
  surge: 2, surges: 2, surged: 2, soar: 2.5, soars: 2.5, soared: 2.5, rally: 2, rallies: 2,
  rallied: 2, breakout: 2, bullish: 2.5, bull: 1.5, gain: 1.5, gains: 1.5, jump: 1.5,
  jumps: 1.5, jumped: 1.5, climb: 1.2, climbs: 1.2, rise: 1.2, rises: 1.2, rose: 1.2,
  soaring: 2.5, skyrocket: 3, skyrockets: 3, moon: 2, mooning: 2.5, pump: 1.5, pumping: 2,
  approval: 2.5, approved: 2.5, adoption: 2, partnership: 1.8, upgrade: 1.5, launch: 1,
  inflow: 2, inflows: 2, accumulate: 1.5, accumulation: 1.5, buy: 1, buying: 1.2,
  record: 1.5, high: 1, ath: 2.5, milestone: 1.5, institutional: 1.2, etf: 1.5,
  optimism: 2, optimistic: 2, confidence: 1.5, recovery: 2, rebound: 2, rebounds: 2,
  boost: 1.5, boosted: 1.5, support: 1, backing: 1.2, integration: 1.2, listing: 2,
  listed: 1.5, burn: 1.2, staking: 0.8, halving: 1.5, greenlight: 2, legalize: 2,
  win: 1.5, wins: 1.5, victory: 1.8, breakthrough: 2, momentum: 1.5, outperform: 2,
  demand: 1.2, whale: 0.5, treasury: 1.2, reserve: 1.2, rate: 0, cut: 0.5, dovish: 2,
};

const NEGATIVE: Record<string, number> = {
  crash: -3, crashes: -3, crashed: -3, plunge: -2.5, plunges: -2.5, plunged: -2.5,
  plummet: -3, tumble: -2, tumbles: -2, slump: -2, slumps: -2, drop: -1.5, drops: -1.5,
  dropped: -1.5, fall: -1.5, falls: -1.5, fell: -1.5, decline: -1.5, declines: -1.5,
  bearish: -2.5, bear: -1.5, loss: -1.5, losses: -1.5, sell: -1, selloff: -2.5,
  dump: -2, dumping: -2.5, correction: -1.5, liquidation: -2.5, liquidated: -2.5,
  hack: -3, hacked: -3, exploit: -3, exploited: -3, breach: -2.5, stolen: -2.5,
  scam: -3, fraud: -3, rug: -3, rugpull: -3, ponzi: -3, lawsuit: -2, sue: -2, sued: -2,
  sec: -0.8, ban: -2.5, banned: -2.5, crackdown: -2.5, regulation: -1, regulatory: -0.8,
  investigation: -2, probe: -1.8, arrest: -2.5, arrested: -2.5, bankruptcy: -3,
  bankrupt: -3, insolvent: -3, collapse: -3, collapsed: -3, halt: -1.5, halted: -1.5,
  outflow: -2, outflows: -2, fear: -2, panic: -2.5, capitulation: -2.5, warning: -1.5,
  risk: -1, risks: -1, concern: -1.2, concerns: -1.2, doubt: -1.2, uncertainty: -1.5,
  delay: -1.5, delayed: -1.5, reject: -2.5, rejected: -2.5, denial: -2, denied: -2,
  low: -1, lows: -1.2, weak: -1.5, weakness: -1.5, struggle: -1.5, hawkish: -2,
  inflation: -1, recession: -2.5, downturn: -2, bleed: -2, bleeding: -2.2,
};

const NEGATORS = new Set(['no', 'not', 'never', 'without', 'nothing', 'none', 'fails', 'fail', 'avoid']);
const INTENSIFIERS: Record<string, number> = {
  very: 1.5, extremely: 1.8, massive: 1.7, massively: 1.7, huge: 1.6, major: 1.4,
  significant: 1.4, sharply: 1.5, heavily: 1.5, record: 1.4, historic: 1.5,
  slightly: 0.5, marginally: 0.5, slight: 0.5, minor: 0.6,
};

export interface SentimentResult {
  /** -1 .. +1 */
  score: number;
  matchedTerms: string[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s$]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function analyzeSentiment(text: string): SentimentResult {
  const tokens = tokenize(text);
  const matched: string[] = [];
  let total = 0;
  let hits = 0;

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const base = POSITIVE[word] ?? NEGATIVE[word];
    if (base === undefined || base === 0) continue;

    let value = base;
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (prev && INTENSIFIERS[prev] !== undefined) value *= INTENSIFIERS[prev];
    if ((prev && NEGATORS.has(prev)) || (prev2 && NEGATORS.has(prev2))) value *= -0.8;

    total += value;
    hits++;
    matched.push(word);
  }

  if (hits === 0) return { score: 0, matchedTerms: [] };

  // Durchschnitt statt Summe, damit lange Titel nicht automatisch extremer wirken.
  const avg = total / Math.sqrt(hits);
  return { score: Math.max(-1, Math.min(1, avg / 3)), matchedTerms: matched.slice(0, 5) };
}

const MEME_TERMS = [
  'memecoin', 'meme coin', 'dogecoin', 'doge', 'shiba', 'shib', 'pepe', 'bonk', 'wif',
  'floki', 'pump.fun', 'pumpfun', 'degen', 'brett', 'mog', 'popcat', 'moodeng', 'fartcoin',
  'trump coin', 'solana meme', 'base meme', 'altcoin season', 'altseason',
];

/** Zaehlt Meme-/Hype-Begriffe – Proxy fuer die Aufmerksamkeit im Memecoin-Sektor. */
export function countMemeMentions(texts: string[]): { term: string; mentions: number }[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const term of MEME_TERMS) {
      if (lower.includes(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([term, mentions]) => ({ term, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 8);
}
