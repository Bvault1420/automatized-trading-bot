import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkGlobalRisk, maxAllowedPositions, positionSizeUsd, type RiskContext } from './risk.js';
import type { BotSettings, MarketIntel, PortfolioState, ScoredCandidate, SecurityReport, TokenCandidate } from '../types.js';

const baseSettings: BotSettings = {
  tradingMode: 'live',
  maxOpenPositions: 3,
  riskPerTradePct: 75,
  stopLossPct: 8,
  takeProfitPct: 16,
  trailingStopPct: 7,
  maxHoldMinutes: 15,
  dailyLossLimitPct: 25,
  maxDrawdownPct: 35,
  minLiquidityUsd: 25_000,
  maxSlippagePct: 6,
  minEntryScore: 50,
  scanChains: ['solana'],
};

const baseIntel: MarketIntel = {
  updatedAt: Date.now(),
  riskAppetite: 0.55,
  regime: 'neutral',
  signals: [],
  fearGreed: null,
  macro: null,
  news: { sentiment: 0.1, bullishCount: 4, bearishCount: 2, items: [] },
  social: { heat: 0.5, trendingTerms: [], freshPosts: 0, freshWindowMinutes: 30 },
  narrative: 'test',
};

const baseState: PortfolioState = {
  mode: 'live',
  cashUsd: 5.0,
  walletUsd: 5.4,
  reservedUsd: 0.4,
  exposureUsd: 0,
  equityUsd: 5.4,
  startEquityUsd: 5.4,
  dayStartEquityUsd: 5.4,
  peakEquityUsd: 5.4,
  realizedPnlUsd: 0,
  unrealizedPnlUsd: 0,
  totalPnlPct: 0,
  dayPnlPct: 0,
  drawdownPct: 0,
  feesUsd: 0,
  estimatedExitCostUsd: 0,
};

function candidate(score = 55, rawScore = 60, secScore = 0.85): ScoredCandidate {
  const c: TokenCandidate = {
    id: 'solana:token',
    chain: 'solana',
    pairAddress: 'pair',
    tokenAddress: 'token',
    symbol: 'PEPE',
    name: 'Pepe',
    dex: 'raydium',
    url: '',
    priceUsd: 1,
    priceNative: 0.01,
    liquidityUsd: 50_000,
    fdv: 1_000_000,
    marketCap: 1_000_000,
    volume: { m5: 5_000, h1: 30_000, h6: 100_000, h24: 250_000 },
    priceChange: { m5: 5, h1: 12, h6: 18, h24: 22 },
    txns: { m5: { buys: 20, sells: 12 }, h1: { buys: 120, sells: 80 } },
    pairCreatedAt: Date.now(),
    ageHours: 10,
    boosts: 0,
    hasSocials: true,
  };
  const s: SecurityReport = {
    checked: true,
    ok: true,
    score: secScore,
    isHoneypot: false,
    buyTaxPct: 0,
    sellTaxPct: 0,
    lpLocked: true,
    isMintable: false,
    isOpenSource: true,
    canTakeBackOwnership: false,
    holderCount: 500,
    top10HolderPct: 30,
    flags: [],
    source: 'test',
  };
  return {
    candidate: c,
    security: s,
    score,
    rawScore,
    breakdown: [],
    rejections: [],
    tradable: true,
    scoredAt: Date.now(),
  };
}

describe('2 Trading-Lagen (Position Sizing & Risk)', () => {
  it('Lage 1: Bei mehreren guten Coins wird kleiner gesetzt und diversifiziert', () => {
    const ctx: RiskContext = {
      settings: baseSettings,
      intel: baseIntel,
      state: baseState,
      availableCashUsd: 5.0,
      consecutiveLosses: 0,
      cooldownUntil: null,
    };
    const cand = candidate(56, 60, 0.7);
    const multiSize = positionSizeUsd(cand, ctx, 3);
    assert.ok(multiSize > 0);
    // Sollte nicht das gesamte Kapital binden (< 50% Equity)
    assert.ok(multiSize <= ctx.state.equityUsd * 0.5, `size ${multiSize} too large for multi-coin`);
  });

  it('Lage 2: Bei einem herausragenden Top-Setup wird größer gesetzt aber rugpull-geschützt', () => {
    const ctx: RiskContext = {
      settings: baseSettings,
      intel: baseIntel,
      state: baseState,
      availableCashUsd: 5.0,
      consecutiveLosses: 0,
      cooldownUntil: null,
    };
    const topCand = candidate(66, 70, 0.9);
    const convictionSize = positionSizeUsd(topCand, ctx, 1);
    assert.ok(convictionSize > 0);
    // Größer als Lage 1, aber maximal 65% Equity (Handlungsfähigkeit bleibt erhalten)
    assert.ok(convictionSize <= ctx.state.equityUsd * 0.65, `size ${convictionSize} exceeds safe cap`);
    assert.ok(convictionSize >= ctx.state.equityUsd * 0.5, `size ${convictionSize} should be conviction size`);
  });

  it('erlaubt bei ausreichendem Guthaben 2 Positionen parallel', () => {
    const ctx: RiskContext = {
      settings: baseSettings,
      intel: baseIntel,
      state: baseState,
      availableCashUsd: 5.0,
      consecutiveLosses: 0,
      cooldownUntil: null,
    };
    const maxPos = maxAllowedPositions(ctx);
    assert.equal(maxPos, 2);
  });
});
