import { bus } from '../util/bus.js';
import { createLogger } from '../util/logger.js';
import { bell, clamp, round, saturate } from '../util/num.js';
import { fetchFearGreed } from './fearGreed.js';
import { fetchMacro } from './macro.js';
import { fetchNews } from './news.js';
import { fetchSocial } from './social.js';
import type { IntelSignal, MarketIntel } from '../types.js';

const log = createLogger('intel');

let current: MarketIntel = emptyIntel();

function emptyIntel(): MarketIntel {
  return {
    updatedAt: 0,
    riskAppetite: 0.5,
    regime: 'neutral',
    signals: [],
    fearGreed: null,
    macro: null,
    news: { sentiment: 0, bullishCount: 0, bearishCount: 0, items: [] },
    social: { heat: 0, trendingTerms: [] },
    narrative: 'Marktdaten werden geladen …',
  };
}

function signal(
  key: string,
  label: string,
  score: number,
  confidence: number,
  detail: string,
  source: string,
): IntelSignal {
  return {
    key,
    label,
    score: clamp(score, -1, 1),
    confidence: clamp(confidence, 0, 1),
    detail,
    source,
    updatedAt: Date.now(),
  };
}

/**
 * Wandelt den Fear-&-Greed-Index in ein Momentum-Signal um.
 *
 * Bewusst NICHT linear: fuer kurzfristigen Memecoin-Handel braucht es
 * Aufmerksamkeit und Liquiditaet, die bei extremer Angst fehlen. Bei extremer
 * Gier (>85) steigt dagegen das Risiko, in die Spitze zu kaufen. Das Optimum
 * liegt im Bereich "Greed, aber noch nicht euphorisch".
 */
function fearGreedSignal(value: number, previous: number): number {
  const zone = bell(value, 68, 26) * 2 - 1;
  const euphoriaPenalty = value > 88 ? -0.5 : 0;
  const momentum = clamp((value - previous) / 15, -1, 1);
  // Gewichtete Mischung statt Addition: sonst erreicht schon die Zone allein
  // den Anschlag und die Richtungsaenderung geht verloren.
  return clamp(0.8 * zone + 0.2 * momentum + euphoriaPenalty, -1, 1);
}

function buildNarrative(intel: MarketIntel): string {
  const parts: string[] = [];
  const fg = intel.fearGreed;
  if (fg) {
    const trend = fg.value > fg.previous ? 'steigend' : fg.value < fg.previous ? 'fallend' : 'stabil';
    parts.push(`Fear & Greed bei ${fg.value} (${fg.classification}, ${trend})`);
  }
  if (intel.macro?.btc) {
    parts.push(`BTC ${intel.macro.btc.change24h >= 0 ? '+' : ''}${intel.macro.btc.change24h.toFixed(1)}% (24h)`);
  }
  if (intel.macro) {
    parts.push(
      `Gesamtmarkt ${intel.macro.marketCapChange24h >= 0 ? '+' : ''}${intel.macro.marketCapChange24h.toFixed(1)}%`,
    );
  }
  const newsWord =
    intel.news.sentiment > 0.15 ? 'positiv' : intel.news.sentiment < -0.15 ? 'negativ' : 'neutral';
  parts.push(`News ${newsWord} (${intel.news.bullishCount}↑ / ${intel.news.bearishCount}↓)`);
  parts.push(`Spekulations-Hitze ${Math.round(intel.social.heat * 100)}%`);

  const verdict =
    intel.regime === 'risk-on'
      ? 'Umfeld begünstigt aggressive, kurze Memecoin-Trades.'
      : intel.regime === 'risk-off'
        ? 'Defensives Umfeld – Bot handelt nur bei sehr starken Signalen.'
        : 'Gemischtes Umfeld – selektives Vorgehen mit reduzierter Positionsgröße.';

  return `${parts.join(' · ')}. ${verdict}`;
}

/** Holt alle Quellen und verdichtet sie zu einem Risikoappetit (0..1). */
export async function refreshIntel(): Promise<MarketIntel> {
  const [fearGreed, macro, news, social] = await Promise.all([
    fetchFearGreed().catch(() => null),
    fetchMacro().catch(() => null),
    fetchNews().catch(() => ({ sentiment: 0, bullishCount: 0, bearishCount: 0, items: [], memeTerms: [] })),
    fetchSocial().catch(() => ({
      heat: 0,
      trendingTerms: [],
      smallCapShare: 0,
      trendingAvgChange24h: 0,
      boostVolume: 0,
      detail: 'nicht verfügbar',
    })),
  ]);

  const signals: IntelSignal[] = [];

  if (fearGreed) {
    signals.push(
      signal(
        'fear_greed',
        'Fear & Greed Index',
        fearGreedSignal(fearGreed.value, fearGreed.previous),
        0.85,
        `${fearGreed.value}/100 – ${fearGreed.classification} (Vortag ${fearGreed.previous}, Vorwoche ${fearGreed.weekAgo})`,
        'alternative.me',
      ),
    );
  }

  if (macro) {
    if (macro.btc) {
      const trend = clamp(macro.btc.change24h / 5, -1, 1) * 0.7 + clamp(macro.btc.change7d / 15, -1, 1) * 0.3;
      signals.push(
        signal(
          'btc_trend',
          'Bitcoin-Trend',
          trend,
          0.9,
          `24h ${macro.btc.change24h.toFixed(2)}% · 7d ${macro.btc.change7d.toFixed(2)}% · $${macro.btc.price.toLocaleString('de-DE')}`,
          'CoinGecko',
        ),
      );
    }

    signals.push(
      signal(
        'market_breadth',
        'Gesamtmarkt',
        // Tagesbewegungen von 4 % sind normal – ein engerer Nenner wuerde das
        // Signal fast dauerhaft am Anschlag halten.
        clamp(macro.marketCapChange24h / 7, -1, 1),
        0.75,
        `Marktkapitalisierung ${macro.marketCapChange24h.toFixed(2)}% (24h) · BTC-Dominanz ${macro.btcDominance.toFixed(1)}%`,
        'CoinGecko',
      ),
    );

    // Rotieren Alts staerker als BTC, fliesst Kapital in die Risikokurve.
    if (macro.btc && (macro.eth || macro.sol)) {
      const altChange = ((macro.eth?.change24h ?? 0) + (macro.sol?.change24h ?? 0)) / (macro.sol ? 2 : 1);
      const rotation = clamp((altChange - macro.btc.change24h) / 3, -1, 1);
      signals.push(
        signal(
          'alt_rotation',
          'Altcoin-Rotation',
          rotation,
          0.7,
          `ETH ${(macro.eth?.change24h ?? 0).toFixed(2)}% · SOL ${(macro.sol?.change24h ?? 0).toFixed(2)}% vs BTC ${macro.btc.change24h.toFixed(2)}%`,
          'CoinGecko',
        ),
      );
    }

    signals.push(
      signal(
        'liquidity',
        'Marktaktivität',
        clamp((macro.turnover - 0.05) / 0.06, -1, 1),
        0.55,
        `24h-Volumen/Marktkapitalisierung: ${(macro.turnover * 100).toFixed(1)}%`,
        'CoinGecko',
      ),
    );
  }

  signals.push(
    signal(
      'news',
      'News-Sentiment',
      news.sentiment,
      news.items.length > 10 ? 0.75 : 0.4,
      `${news.items.length} Schlagzeilen · ${news.bullishCount} bullisch / ${news.bearishCount} bärisch`,
      'CoinDesk, Cointelegraph, Decrypt, Google News',
    ),
  );

  signals.push(
    signal(
      'social',
      'Spekulations-Hitze',
      social.heat * 2 - 1,
      0.6,
      social.detail,
      'CoinGecko Trending, DexScreener Boosts',
    ),
  );

  const memeBuzz = news.memeTerms.reduce((sum, t) => sum + t.mentions, 0);
  signals.push(
    signal(
      'meme_buzz',
      'Memecoin-Aufmerksamkeit',
      // Da ein eigener Memecoin-Newsfeed mitlaeuft, liegt die Grundlast bei rund
      // einem Dutzend Erwaehnungen – dort liegt der neutrale Punkt.
      saturate(memeBuzz, 12) * 2 - 1,
      0.5,
      memeBuzz > 0
        ? `${memeBuzz} Meme-Erwähnungen: ${news.memeTerms.map((t) => t.term).slice(0, 4).join(', ')}`
        : 'Keine nennenswerten Meme-Erwähnungen in den News',
      'News-Textanalyse',
    ),
  );

  const weightTotal = signals.reduce((sum, s) => sum + s.confidence, 0);
  const weighted = signals.reduce((sum, s) => sum + s.score * s.confidence, 0);
  const composite = weightTotal > 0 ? weighted / weightTotal : 0;
  const riskAppetite = clamp((composite + 1) / 2, 0, 1);

  const intel: MarketIntel = {
    updatedAt: Date.now(),
    riskAppetite,
    regime: riskAppetite > 0.6 ? 'risk-on' : riskAppetite < 0.4 ? 'risk-off' : 'neutral',
    signals,
    fearGreed: fearGreed
      ? { value: fearGreed.value, classification: fearGreed.classification, previous: fearGreed.previous }
      : null,
    macro: macro
      ? {
          totalMarketCapUsd: macro.totalMarketCapUsd,
          marketCapChange24h: macro.marketCapChange24h,
          btcDominance: macro.btcDominance,
          btc: macro.btc,
          eth: macro.eth,
          sol: macro.sol,
        }
      : null,
    news: {
      sentiment: news.sentiment,
      bullishCount: news.bullishCount,
      bearishCount: news.bearishCount,
      items: news.items.slice(0, 25),
    },
    social: { heat: social.heat, trendingTerms: social.trendingTerms },
    narrative: '',
  };
  intel.narrative = buildNarrative(intel);

  current = intel;
  bus.emitEvent('intel', intel);
  log.info(
    `Marktbild aktualisiert · Risikoappetit ${round(riskAppetite * 100)}% (${intel.regime}) aus ${signals.length} Signalen`,
  );
  return intel;
}

export function getIntel(): MarketIntel {
  return current;
}
