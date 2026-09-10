import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideExit } from './exits.js';
import type { Position } from '../types.js';
import { FACTORY_RULES } from '../learning/adapt.js';

function pos(over: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    mode: 'paper',
    instrumentId: 'BTCUSDT',
    display: 'Bitcoin',
    assetClass: 'crypto',
    venue: 'binance',
    strategy: 'meanReversion',
    regime: 'range',
    side: 'long',
    status: 'open',
    qty: 1,
    entry: 100,
    remainingQty: 1,
    stopLoss: 98.8,
    tp1: 101.32,
    tp2: 102.64,
    tp1Filled: false,
    tp2Filled: false,
    trailPct: 0.008,
    highWater: 100,
    lowWater: 100,
    openedAt: Date.now(),
    plan: {
      instrumentId: 'BTCUSDT',
      display: 'Bitcoin',
      venue: 'binance',
      strategy: 'meanReversion',
      regime: 'range',
      side: 'long',
      thesis: 'test',
      invalidation: 'sl',
      entry: 100,
      stopLoss: 98.8,
      tp1: 101.32,
      tp2: 102.64,
      runnerTrailPct: 0.008,
      rewardToRisk: 2.1,
      feePct: 0.0028,
      feeEur: 0.05,
      riskEur: 1,
      notionalEur: 30,
      quality: 80,
      reasons: [],
    },
    feesPaidEur: 0.05,
    realizedEur: 0,
    ...over,
  };
}

describe('decideExit', () => {
  it('zieht immer den Stop vor TP', () => {
    const d = decideExit(pos(), 98.7);
    assert.equal(d.kind, 'stop');
    assert.equal(d.qty, 1);
  });

  it('nimmt TP1 teilweise mit und setzt Stop auf Einstieg', () => {
    const d = decideExit(pos(), 101.4);
    assert.equal(d.kind, 'tp1');
    assert.ok(Math.abs(d.qty - 0.4) < 1e-9);
    assert.equal(d.newStop, 100);
  });

  it('nimmt TP2 nach TP1', () => {
    const d = decideExit(pos({ tp1Filled: true, remainingQty: 0.6, stopLoss: 100 }), 102.7);
    assert.equal(d.kind, 'tp2');
  });
});

void FACTORY_RULES;
