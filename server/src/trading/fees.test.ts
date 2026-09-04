import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateRoundTripCostUsd,
  estimateSellCostUsd,
  isMicroAccount,
  netAfterEstimatedSell,
  roundTripAllowsEntry,
} from './fees.js';

describe('fees', () => {
  it('erkennt Mini-Konten', () => {
    assert.equal(isMicroAccount(4), true);
    assert.equal(isMicroAccount(8), true);
    assert.equal(isMicroAccount(8.01), false);
    assert.equal(isMicroAccount(0), false);
  });

  it('schätzt Round-Trip auf einem Mini-Ticket in der Größenordnung echter Jupiter-Kosten', () => {
    const rt = estimateRoundTripCostUsd({
      notionalUsd: 2.5,
      nativePriceUsd: 100,
      liquidityUsd: 40_000,
      micro: true,
    });
    assert.ok(rt.costUsd > 0.15, `zu niedrig: ${rt.costUsd}`);
    assert.ok(rt.costUsd < 0.7, `zu hoch: ${rt.costUsd}`);
    assert.ok(rt.costPct > 6);
    assert.ok(rt.ataUsd > 0.15);
  });

  it('lehnt Einstiege ab, deren Round-Trip den Take-Profit auffrisst', () => {
    const expensive = estimateRoundTripCostUsd({
      notionalUsd: 2.4,
      nativePriceUsd: 100,
      liquidityUsd: 15_000,
      micro: false,
    });
    const blocked = roundTripAllowsEntry(2.4, 16, expensive);
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason, /Take-Profit|auffressen/i);

    const cheap = estimateRoundTripCostUsd({
      notionalUsd: 3.2,
      nativePriceUsd: 100,
      liquidityUsd: 80_000,
      micro: true,
      includeAtaRent: false,
    });
    const allowed = roundTripAllowsEntry(3.2, 16, cheap);
    assert.equal(allowed.ok, true);
  });

  it('macht ein kleines Kursplus nach Verkaufskosten zum Netto-Minus', () => {
    const sell = estimateSellCostUsd({
      notionalUsd: 2.7,
      nativePriceUsd: 100,
      liquidityUsd: 40_000,
      micro: true,
    });
    const net = netAfterEstimatedSell(
      {
        costUsd: 2.61,
        tokenAmount: 196,
        lastPrice: 2.7 / 196,
        realizedUsd: 0,
        feesUsd: 0,
      },
      sell.costUsd,
    );
    assert.ok(net.netUsd < 0, `erwartet Netto-Verlust, war ${net.netUsd}`);
  });
});
