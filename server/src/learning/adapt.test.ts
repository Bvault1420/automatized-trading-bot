import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptRules, FACTORY_RULES } from './adapt.js';
import type { Trade } from '../types.js';

function loss(i: number): Trade {
  return {
    id: `t${i}`,
    positionId: 'p',
    mode: 'paper',
    instrumentId: 'ETHUSDT',
    display: 'ETH',
    venue: 'binance',
    strategy: 'breakout',
    regime: 'range',
    side: 'long',
    action: 'stop',
    qty: 1,
    price: 1,
    pnlEur: -0.4,
    feeEur: 0.05,
    rMultiple: -0.5,
    quality: 70,
    at: Date.now(),
    note: '',
  };
}

describe('adaptRules', () => {
  it('darf das Risiko nie erhöhen', () => {
    const trades = Array.from({ length: 12 }, (_, i) => loss(i));
    const { rules } = adaptRules({ ...FACTORY_RULES, riskPerTradePct: 1 }, trades);
    assert.ok(rules.riskPerTradePct <= FACTORY_RULES.riskPerTradePct);
    assert.ok(rules.minQuality >= FACTORY_RULES.minQuality);
  });

  it('pausiert eine klar negative Nebenstrategie, nicht Mean Reversion', () => {
    const trades = Array.from({ length: 8 }, (_, i) => loss(i));
    const { rules } = adaptRules(FACTORY_RULES, trades);
    assert.ok(rules.disabledStrategies.includes('breakout'));
    assert.equal(rules.disabledStrategies.includes('meanReversion'), false);
  });
});
