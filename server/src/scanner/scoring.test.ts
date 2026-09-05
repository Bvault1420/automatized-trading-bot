import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreCandidate, type ScoringContext } from './scoring.js';
import type { MarketIntel, SecurityReport, TokenCandidate } from '../types.js';

function intel(partial: Partial<MarketIntel> = {}): MarketIntel {
  return {
    updatedAt: Date.now(),
    riskAppetite: 0.55,
    regime: 'neutral',
    signals: [],
    fearGreed: { value: 62, classification: 'Greed', previous: 58 },
    macro: null,
    news: { sentiment: 0.1, bullishCount: 4, bearishCount: 2, items: [] },
    social: { heat: 0.5, trendingTerms: [], freshPosts: 0, freshWindowMinutes: 30 },
    narrative: 'test',
    ...partial,
  };
}

function security(partial: Partial<SecurityReport> = {}): SecurityReport {
  return {
    checked: true,
    ok: true,
    score: 0.86,
    isHoneypot: false,
    buyTaxPct: 0,
    sellTaxPct: 0,
    lpLocked: true,
    isMintable: false,
    isOpenSource: true,
    canTakeBackOwnership: false,
    holderCount: 800,
    top10HolderPct: 28,
    flags: [],
    source: 'test',
    ...partial,
  };
}

function candidate(partial: Partial<TokenCandidate> = {}): TokenCandidate {
  return {
    id: 'solana:pair',
    chain: 'solana',
    pairAddress: 'pair',
    tokenAddress: 'token',
    symbol: 'PEPE',
    name: 'Pepe',
    dex: 'raydium',
    url: 'https://dexscreener.com/solana/pair',
    priceUsd: 0.001,
    priceNative: 0.00001,
    liquidityUsd: 90_000,
    fdv: 2_200_000,
    marketCap: 2_200_000,
    volume: { m5: 8_000, h1: 42_000, h6: 180_000, h24: 420_000 },
    priceChange: { m5: 6.5, h1: 15, h6: 22, h24: 28 },
    txns: { m5: { buys: 40, sells: 22 }, h1: { buys: 220, sells: 150 } },
    pairCreatedAt: Date.now() - 18 * 3_600_000,
    ageHours: 18,
    boosts: 20,
    hasSocials: true,
    ...partial,
  };
}

function ctx(partial: Partial<ScoringContext> = {}): ScoringContext {
  return {
    intel: intel(),
    minLiquidityUsd: 40_000,
    liveChain: null,
    blacklist: new Set(),
    cooldowns: new Map(),
    ...partial,
  };
}

describe('scoreCandidate', () => {
  it('lässt ein gesundes Grind-Setup handelbar und relativ hoch bewerten', () => {
    const scored = scoreCandidate(candidate(), security(), ctx());
    assert.equal(scored.tradable, true);
    assert.ok(scored.score >= 50, `score ${scored.score}`);
    assert.ok(scored.breakdown.some((b) => b.label === 'Setup-Qualität'));
  });

  it('lehnt Dumps, Dead-Cat-Bounces und Late-Chases hart ab', () => {
    const dump = scoreCandidate(candidate({ priceChange: { m5: -11, h1: -4, h6: 2, h24: 10 } }), security(), ctx());
    assert.equal(dump.tradable, false);
    assert.ok(dump.rejections.some((r) => /Dump/i.test(r)));

    const bounce = scoreCandidate(candidate({ priceChange: { m5: 8, h1: 4, h6: -32, h24: -20 } }), security(), ctx());
    assert.equal(bounce.tradable, false);
    assert.ok(bounce.rejections.some((r) => /Dead-Cat/i.test(r)));

    const chase = scoreCandidate(candidate({ priceChange: { m5: 62, h1: 40, h6: 70, h24: 90 } }), security(), ctx());
    assert.equal(chase.tradable, false);
    assert.ok(chase.rejections.some((r) => /spät|überhitzt|parabol/i.test(r)));
  });

  it('bestraft Chase-Momentum gegenüber einem ruhigen Aufwärtstrend', () => {
    const grind = scoreCandidate(candidate(), security(), ctx());
    const extended = scoreCandidate(
      candidate({
        priceChange: { m5: 32, h1: 48, h6: 90, h24: 160 },
        txns: { m5: { buys: 80, sells: 70 }, h1: { buys: 400, sells: 380 } },
      }),
      security(),
      ctx(),
    );
    assert.ok(grind.rawScore > extended.rawScore, `${grind.rawScore} vs ${extended.rawScore}`);
  });

  it('lehnt Verkäuferdominanz und zu junge Paare ab', () => {
    const sellers = scoreCandidate(
      candidate({ txns: { m5: { buys: 8, sells: 20 }, h1: { buys: 80, sells: 140 } } }),
      security(),
      ctx(),
    );
    assert.equal(sellers.tradable, false);

    const newborn = scoreCandidate(candidate({ ageHours: 0.1 }), security(), ctx());
    assert.equal(newborn.tradable, false);
  });

  it('hält Honeypots und Blacklist-Token raus', () => {
    const pot = scoreCandidate(candidate(), security({ isHoneypot: true, ok: false, score: 0 }), ctx());
    assert.equal(pot.tradable, false);

    const blocked = scoreCandidate(
      candidate(),
      security(),
      ctx({ blacklist: new Set(['solana:token']) }),
    );
    assert.equal(blocked.tradable, false);
  });
});
