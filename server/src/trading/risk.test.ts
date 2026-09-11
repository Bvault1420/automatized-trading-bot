import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkGlobalRisk } from './risk.js';
import { FACTORY_RULES } from '../learning/adapt.js';
import type { AccountSlice, Trade } from '../types.js';

const account: AccountSlice = {
  cashEur: 90,
  startEquityEur: 100,
  dayStartEquityEur: 100,
  dayStartedAt: Date.now(),
  peakEquityEur: 100,
  realizedPnlEur: 0,
  entriesToday: 2,
  entriesDayStamp: new Date().toISOString().slice(0, 10),
};

describe('checkGlobalRisk', () => {
  it('stoppt neue Einstiege nach Tagesverlustlimit', () => {
    const v = checkGlobalRisk({
      rules: FACTORY_RULES,
      account: { ...account, dayStartEquityEur: 100 },
      equityEur: 95,
      open: [],
      recent: [],
      consecutiveLosses: 0,
      cooldownUntil: null,
    });
    assert.equal(v.allowed, false);
    assert.match(v.reason, /Tagesverlust/);
  });

  it('lässt einen normalen Tag durch', () => {
    const v = checkGlobalRisk({
      rules: FACTORY_RULES,
      account,
      equityEur: 100.4,
      open: [],
      recent: [],
      consecutiveLosses: 0,
      cooldownUntil: null,
    });
    assert.equal(v.allowed, true);
  });

  it('erkennt die alte Verlustserie (ein Gewinn, viele Verluste)', () => {
    const recent: Trade[] = [];
    for (let i = 0; i < 10; i++) {
      recent.push({
        id: `t${i}`,
        positionId: 'p',
        mode: 'paper',
        instrumentId: 'ETHUSDT',
        display: 'ETH',
        venue: 'binance',
        strategy: 'trend',
        regime: 'range',
        side: 'long',
        action: 'stop',
        qty: 1,
        price: 1,
        pnlEur: i === 0 ? 0.4 : -0.35,
        feeEur: 0.04,
        rMultiple: -0.4,
        quality: 60,
        at: Date.now(),
        note: '',
      });
    }
    const v = checkGlobalRisk({
      rules: FACTORY_RULES,
      account,
      equityEur: 100,
      open: [],
      recent,
      consecutiveLosses: 3,
      cooldownUntil: null,
    });
    assert.equal(v.allowed, false);
  });
});
