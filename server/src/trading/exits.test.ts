import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideExit } from './exits.js';
import type { BotSettings, PairSnapshot, Position } from '../types.js';

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

function position(partial: Partial<Position> = {}): Position {
  const entry = 1;
  const last = partial.lastPrice ?? 1;
  return {
    id: 'p1',
    chain: 'solana',
    pairAddress: 'pair',
    tokenAddress: 'token',
    symbol: 'PEPE',
    name: 'Pepe',
    url: '',
    status: 'open',
    mode: 'paper',
    openedAt: Date.now() - 3 * 60_000,
    entryPrice: entry,
    entryScore: 70,
    entryReason: 'test',
    tokenAmount: 10,
    initialTokenAmount: 10,
    costUsd: 10,
    realizedUsd: 0,
    feesUsd: 0.05,
    lastPrice: last,
    peakPrice: Math.max(entry, last, partial.peakPrice ?? last),
    stopLossPrice: 0.89,
    takeProfitPrice: 1.2,
    trailingArmed: false,
    partialsTaken: 0,
    unrealizedPnlUsd: (last - entry) * 10,
    pnlUsd: (last - entry) * 10,
    pnlPct: (last - entry) * 100,
    fills: [],
    ...partial,
  };
}

function snap(partial: Partial<PairSnapshot> = {}): PairSnapshot {
  return {
    priceUsd: 1,
    liquidityUsd: 80_000,
    priceChangeM5: 2,
    priceChangeH1: 8,
    volumeM5: 4_000,
    buysM5: 20,
    sellsM5: 12,
    ...partial,
  };
}

describe('decideExit', () => {
  it('schneidet Verlierer beim Stop-Loss und bei gebrochener These', () => {
    const sl = decideExit(position({ lastPrice: 0.88, pnlPct: -12 }), settings, snap());
    assert.ok(sl);
    assert.equal(sl.fraction, 1);
    assert.match(sl.reason, /Stop-Loss/);

    const thesis = decideExit(position({ lastPrice: 0.99, pnlPct: -1 }), settings, snap({ priceChangeM5: -8 }));
    assert.ok(thesis);
    assert.match(thesis.reason, /These|Dump/i);
  });

  it('nimmt Gewinne früher und grösser mit als zuvor', () => {
    const tp = decideExit(position({ lastPrice: 1.22, pnlPct: 22, peakPrice: 1.22 }), settings, snap());
    assert.ok(tp);
    assert.equal(tp.fraction, 0.65);
    assert.match(tp.reason, /Teilgewinn/);
  });

  it('beendet gescheiterte Einstiege, bevor der Stop-Loss greift', () => {
    const failed = decideExit(
      position({
        openedAt: Date.now() - 12 * 60_000,
        lastPrice: 0.95,
        pnlPct: -5,
        peakPrice: 1.01,
      }),
      settings,
      snap({ priceChangeM5: -1 }),
    );
    assert.ok(failed);
    assert.match(failed.reason, /Gescheiterter Einstieg/);
  });

  it('sichert gedrehtes Momentum und gibt abgegebene Gewinne nicht zurück', () => {
    const flip = decideExit(position({ lastPrice: 1.07, pnlPct: 7, peakPrice: 1.08 }), settings, snap({ priceChangeM5: -7 }));
    assert.ok(flip);
    assert.match(flip.reason, /Momentum/);

    const giveback = decideExit(
      position({ lastPrice: 1.01, pnlPct: 1, peakPrice: 1.16 }),
      settings,
      snap(),
    );
    assert.ok(giveback);
    assert.match(giveback.reason, /abgegeben|Trailing/);
  });

  it('hält eine frische, ruhige Position', () => {
    const hold = decideExit(position({ lastPrice: 1.03, pnlPct: 3, peakPrice: 1.04 }), settings, snap());
    assert.equal(hold, null);
  });
});
