import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildManualPlan, buildPlan } from './plan.js';
import { FACTORY_RULES } from '../learning/adapt.js';
import type { Instrument } from '../types.js';

const btc: Instrument = {
  id: 'BTCUSDT',
  symbol: 'BTCUSDT',
  display: 'Bitcoin',
  assetClass: 'crypto',
  base: 'BTC',
  quote: 'USDT',
  venues: ['binance'],
};

describe('buildPlan', () => {
  it('erzeugt SL, TP1 und TP2 und verwirft zu knappes R:R nach Gebühren', () => {
    const plan = buildPlan({
      instrument: btc,
      venue: 'binance',
      price: 100,
      regime: 'range',
      signal: {
        strategy: 'meanReversion',
        side: 'long',
        strength: 80,
        reasons: ['RSI tief'],
        slPctHint: 0.012,
        tp1R: 1.1,
        tp2R: 2.1,
      },
      rules: FACTORY_RULES,
    });
    assert.ok(plan);
    assert.ok(plan!.stopLoss < plan!.entry);
    assert.ok(plan!.tp1 > plan!.entry);
    assert.ok(plan!.tp2 > plan!.tp1);
    assert.ok(plan!.thesis.includes('TP1'));
  });

  it('baut keinen Plan ohne ausreichendes R:R', () => {
    const plan = buildPlan({
      instrument: btc,
      venue: 'binance',
      price: 100,
      regime: 'range',
      signal: {
        strategy: 'meanReversion',
        side: 'long',
        strength: 80,
        reasons: ['x'],
        slPctHint: 0.012,
        tp1R: 0.4,
        tp2R: 0.8,
      },
      rules: FACTORY_RULES,
    });
    assert.equal(plan, null);
  });
});

describe('buildManualPlan', () => {
  it('liefert Long mit SL unter Entry und TP1/TP2 darüber', () => {
    const plan = buildManualPlan({
      instrument: btc,
      venue: 'binance',
      price: 100,
      regime: 'range',
      side: 'long',
      atrPct: 0.01,
    });
    assert.ok(plan.stopLoss < plan.entry);
    assert.ok(plan.tp1 > plan.entry);
    assert.ok(plan.tp2 > plan.tp1);
    assert.ok(plan.thesis.includes('Manuell'));
    assert.ok(plan.thesis.includes('Bot übernimmt'));
  });

  it('liefert Short mit SL über Entry und TPs darunter', () => {
    const plan = buildManualPlan({
      instrument: btc,
      venue: 'binance',
      price: 100,
      regime: 'trend-down',
      side: 'short',
      atrPct: 0.012,
    });
    assert.ok(plan.stopLoss > plan.entry);
    assert.ok(plan.tp1 < plan.entry);
    assert.ok(plan.tp2 < plan.tp1);
    assert.equal(plan.side, 'short');
  });
});
