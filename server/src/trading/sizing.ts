import { HARD_CAPS } from '../config.js';
import { VENUE_FEES } from '../market/universe.js';
import { round } from '../util/num.js';
import type { AdaptiveRules, Side, VenueId } from '../types.js';

export function roundTripCostPct(venue: VenueId): number {
  const f = VENUE_FEES[venue];
  return f.takerFeePct * 2 + f.slippagePct * 2;
}

export function feeEur(notionalEur: number, feePct: number): number {
  return round(Math.abs(notionalEur) * feePct, 4);
}

export interface SizeInput {
  equityEur: number;
  cashEur: number;
  rules: AdaptiveRules;
  entry: number;
  stopLoss: number;
  side: Side;
  venue: VenueId;
  openCount: number;
  requestedNotionalEur?: number;
}

export interface SizeResult {
  ok: boolean;
  reason: string;
  notionalEur: number;
  qty: number;
  riskEur: number;
  feeEur: number;
  cashAfter: number;
}

/**
 * Größe so, dass (1) SL-Verlust + Gebühren ins Risiko passen,
 * (2) nach dem Trade noch Cash für Gebühren und den nächsten Trade bleibt.
 */
export function sizePosition(input: SizeInput): SizeResult {
  const { equityEur, cashEur, rules, entry, stopLoss, side, venue } = input;
  const slDist = side === 'long' ? entry - stopLoss : stopLoss - entry;
  if (entry <= 0 || slDist <= 0) {
    return fail('Ungültiger Stop – kein Trade ohne klaren SL');
  }
  const slPct = slDist / entry;
  const rt = roundTripCostPct(venue);
  const oneWay = rt / 2;
  const buffer = Math.max(equityEur * HARD_CAPS.cashBufferPct, 8);
  const usable = cashEur - buffer;
  if (usable < 8) {
    return fail(`Cash-Puffer: nur ${cashEur.toFixed(2)} € frei, ${buffer.toFixed(2)} € müssen bleiben`);
  }

  const riskBudget = equityEur * (rules.riskPerTradePct / 100);
  const denom = slPct + rt;
  let notional = riskBudget / denom;
  notional = Math.min(notional, equityEur * HARD_CAPS.maxNotionalPct, usable);
  if (input.requestedNotionalEur && input.requestedNotionalEur > 0) {
    if (input.requestedNotionalEur > usable + 1e-9) {
      return fail(
        `Gewünschte Größe ${input.requestedNotionalEur.toFixed(2)} € übersteigt verfügbares Cash (${usable.toFixed(2)} € nach Puffer)`,
      );
    }
    notional = Math.min(input.requestedNotionalEur, equityEur * HARD_CAPS.maxNotionalPct, usable);
  }
  if (input.openCount >= 1) {
    notional = Math.min(notional, usable / Math.max(1, HARD_CAPS.maxOpenPositions - input.openCount + 0.35));
  }

  if (notional < 8) {
    return fail(`Positionsgröße ${notional.toFixed(2)} € zu klein nach Gebühren und Puffer`);
  }

  const qty = notional / entry;
  const entryFee = notional * oneWay;
  const riskEur = notional * slPct + notional * rt;
  const cashAfter = cashEur - notional - entryFee;

  if (cashAfter < buffer * 0.85) {
    return fail('Nach Einstieg bliebe zu wenig Kapital für Gebühren/nächsten Trade');
  }
  if (riskEur > equityEur * 0.025) {
    return fail('Risiko inkl. Gebühren wäre über 2,5 % – Trade verworfen');
  }

  return {
    ok: true,
    reason: 'Größe ok',
    notionalEur: round(notional, 2),
    qty: qty,
    riskEur: round(riskEur, 4),
    feeEur: round(entryFee, 4),
    cashAfter: round(cashAfter, 2),
  };
}

function fail(reason: string): SizeResult {
  return { ok: false, reason, notionalEur: 0, qty: 0, riskEur: 0, feeEur: 0, cashAfter: 0 };
}

export function minEdgePct(venue: VenueId, minRr: number): number {
  return roundTripCostPct(venue) * Math.max(2.4, minRr);
}
