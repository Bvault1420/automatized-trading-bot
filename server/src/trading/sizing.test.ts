import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sizePosition } from './sizing.js';
import { FACTORY_RULES } from '../learning/adapt.js';

describe('sizePosition', () => {
  it('lässt nach dem Trade genug Cash für Gebühren und den nächsten Trade', () => {
    const r = sizePosition({
      equityEur: 100,
      cashEur: 100,
      rules: FACTORY_RULES,
      entry: 50,
      stopLoss: 49.4,
      side: 'long',
      venue: 'binance',
      openCount: 0,
    });
    assert.equal(r.ok, true);
    assert.ok(r.cashAfter >= 18, `cashAfter ${r.cashAfter}`);
    assert.ok(r.notionalEur <= 36 + 1e-6);
    assert.ok(r.riskEur <= 2.5);
  });

  it('lehnt Trades ohne echten Stop ab', () => {
    const r = sizePosition({
      equityEur: 100,
      cashEur: 100,
      rules: FACTORY_RULES,
      entry: 50,
      stopLoss: 50,
      side: 'long',
      venue: 'binance',
      openCount: 0,
    });
    assert.equal(r.ok, false);
  });

  it('handelt nicht, wenn nur noch der Puffer da ist', () => {
    const r = sizePosition({
      equityEur: 100,
      cashEur: 20,
      rules: FACTORY_RULES,
      entry: 50,
      stopLoss: 49.4,
      side: 'long',
      venue: 'binance',
      openCount: 0,
    });
    assert.equal(r.ok, false);
  });
});
