import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmLiveTape, effectiveMinScore, marketEntryBlocked } from './entry.js';
import type { BotSettings, MarketIntel, TokenCandidate, Trade } from '../types.js';

const settings: BotSettings = {
  tradingMode: 'paper',
  maxOpenPositions: 2,
  riskPerTradePct: 14,
  stopLossPct: 11,
  takeProfitPct: 20,
  trailingStopPct: 8,
  maxHoldMinutes: 25,
  dailyLossLimitPct: 18,
  maxDrawdownPct: 32,
  minLiquidityUsd: 40_000,
  maxSlippagePct: 5,
  minEntryScore: 64,
  scanChains: ['solana'],
};

function candidate(partial: Partial<TokenCandidate> = {}): TokenCandidate {
  return {
    id: 'solana:pair',
    chain: 'solana',
    pairAddress: 'pair',
    tokenAddress: 'token',
    symbol: 'PEPE',
    name: 'Pepe',
    dex: 'raydium',
    url: '',
    priceUsd: 1,
    priceNative: 1,
    liquidityUsd: 90_000,
    fdv: 2_000_000,
    marketCap: 2_000_000,
    volume: { m5: 5_000, h1: 30_000, h6: 100_000, h24: 250_000 },
    priceChange: { m5: 5, h1: 12, h6: 18, h24: 22 },
    txns: { m5: { buys: 20, sells: 12 }, h1: { buys: 120, sells: 80 } },
    pairCreatedAt: Date.now(),
    ageHours: 10,
    boosts: 0,
    hasSocials: true,
    ...partial,
  };
}

function intel(partial: Partial<MarketIntel> = {}): MarketIntel {
  return {
    updatedAt: Date.now(),
    riskAppetite: 0.55,
    regime: 'neutral',
    signals: [],
    fearGreed: null,
    macro: {
      totalMarketCapUsd: 2e12,
      marketCapChange24h: 1,
      btcDominance: 54,
      btc: { price: 90_000, change24h: 0.5, change7d: 2 },
      eth: null,
      sol: null,
    },
    news: { sentiment: 0, bullishCount: 0, bearishCount: 0, items: [] },
    social: { heat: 0.4, trendingTerms: [], freshPosts: 0, freshWindowMinutes: 30 },
    narrative: '',
    ...partial,
  };
}

describe('confirmLiveTape', () => {
  it('lehnt fehlenden Kurs, Dumps und Spikes ab', () => {
    assert.equal(confirmLiveTape(candidate(), null, settings).ok, false);
    assert.equal(
      confirmLiveTape(candidate(), {
        priceUsd: 0.93,
        liquidityUsd: 90_000,
        priceChangeM5: 1,
        priceChangeH1: 4,
        volumeM5: 2_000,
        buysM5: 10,
        sellsM5: 8,
      }, settings).ok,
      false,
    );
    assert.equal(
      confirmLiveTape(candidate(), {
        priceUsd: 1.15,
        liquidityUsd: 90_000,
        priceChangeM5: 14,
        priceChangeH1: 20,
        volumeM5: 8_000,
        buysM5: 40,
        sellsM5: 10,
      }, settings).ok,
      false,
    );
  });

  it('lässt einen stabilen Tape durch', () => {
    const verdict = confirmLiveTape(candidate(), {
      priceUsd: 1.02,
      liquidityUsd: 88_000,
      priceChangeM5: 2,
      priceChangeH1: 9,
      volumeM5: 3_000,
      buysM5: 18,
      sellsM5: 11,
    }, settings);
    assert.equal(verdict.ok, true);
  });
});

describe('effectiveMinScore', () => {
  it('hebt die Schwelle in Risk-off, nach Verlusten und bei schlechter Trefferquote', () => {
    const base = effectiveMinScore(settings, intel({ regime: 'risk-on', riskAppetite: 0.75 }), [], 0);
    const defensive = effectiveMinScore(settings, intel({ regime: 'risk-off', riskAppetite: 0.25 }), [], 0);
    assert.ok(defensive > base);

    const afterLosses = effectiveMinScore(settings, intel({ regime: 'risk-on' }), [], 3);
    assert.ok(afterLosses > base);

    const trades = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      symbol: 'X',
      chain: 'solana',
      tokenAddress: 't',
      url: '',
      mode: 'paper' as const,
      openedAt: 1,
      closedAt: 2,
      holdSeconds: 60,
      entryPrice: 1,
      exitPrice: 0.9,
      costUsd: 2,
      proceedsUsd: 1.8,
      feesUsd: 0.05,
      pnlUsd: -0.2,
      pnlPct: -10,
      entryScore: 60,
      entryReason: '',
      exitReason: '',
    })) satisfies Trade[];
    const cold = effectiveMinScore(settings, intel({ regime: 'risk-on' }), trades, 0);
    assert.ok(cold > base);
  });
});

describe('marketEntryBlocked', () => {
  it('blockiert Einstiege nur bei einem echten BTC-Crash', () => {
    assert.equal(marketEntryBlocked(intel()), null);
    const blocked = marketEntryBlocked(
      intel({
        macro: {
          totalMarketCapUsd: 2e12,
          marketCapChange24h: -9,
          btcDominance: 58,
          btc: { price: 80_000, change24h: -9, change7d: -6 },
          eth: null,
          sol: null,
        },
      }),
    );
    assert.ok(blocked);
    assert.match(blocked, /BTC-Crash/);
  });
});
