import type { Position, Side } from '../types.js';

export type ExitKind = 'none' | 'stop' | 'tp1' | 'tp2' | 'trail' | 'time';

export interface ExitDecision {
  kind: ExitKind;
  qty: number;
  reason: string;
  newStop?: number;
}

/** Teilverkäufe: 40 % bei TP1, 40 % bei TP2, Rest per Trailing. SL immer aktiv. */
export function decideExit(pos: Position, price: number, now = Date.now()): ExitDecision {
  const side = pos.side;
  const hitSl = side === 'long' ? price <= pos.stopLoss : price >= pos.stopLoss;
  if (hitSl) {
    return { kind: 'stop', qty: pos.remainingQty, reason: 'Stop-Loss ausgelöst' };
  }

  if (!pos.tp1Filled) {
    const hit = side === 'long' ? price >= pos.tp1 : price <= pos.tp1;
    if (hit) {
      const qty = pos.remainingQty * 0.4;
      return { kind: 'tp1', qty, reason: 'TP1 erreicht – 40 % sicher gemacht', newStop: pos.entry };
    }
  }

  if (pos.tp1Filled && !pos.tp2Filled) {
    const hit = side === 'long' ? price >= pos.tp2 : price <= pos.tp2;
    if (hit) {
      const qty = pos.remainingQty * (0.4 / 0.6);
      return { kind: 'tp2', qty, reason: 'TP2 erreicht – weitere 40 % geschlossen', newStop: trailFrom(pos, price) };
    }
  }

  if (pos.tp1Filled) {
    const trail = trailFrom(pos, price);
    const breach = side === 'long' ? price <= trail : price >= trail;
    if (breach && trail !== pos.stopLoss) {
      if (side === 'long' ? trail > pos.stopLoss : trail < pos.stopLoss) {
        // stop nachziehen, noch nicht raus
      }
    }
    const stopHit = side === 'long' ? price <= Math.max(pos.stopLoss, trail) : price >= Math.min(pos.stopLoss, trail);
    if (pos.tp2Filled && stopHit) {
      return { kind: 'trail', qty: pos.remainingQty, reason: 'Trailing-Stop am Runner' };
    }
  }

  const maxHold = 36 * 60 * 60_000;
  if (now - pos.openedAt > maxHold) {
    return { kind: 'time', qty: pos.remainingQty, reason: 'Maximale Haltedauer – Plan ungültig' };
  }

  return { kind: 'none', qty: 0, reason: 'Halten' };
}

export function trailFrom(pos: Position, price: number): number {
  if (pos.side === 'long') {
    const hw = Math.max(pos.highWater, price);
    return hw * (1 - pos.trailPct);
  }
  const lw = Math.min(pos.lowWater || price, price);
  return lw * (1 + pos.trailPct);
}

export function markToMarket(side: Side, entry: number, price: number, qty: number): number {
  if (side === 'long') return (price - entry) * qty;
  return (entry - price) * qty;
}
