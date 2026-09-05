import { isMicroAccount, estimateSellCostUsd, netAfterEstimatedSell } from './fees.js';
import type { BotSettings, PairSnapshot, Position } from '../types.js';

export interface ExitDecision {
  fraction: number;
  reason: string;
  urgent: boolean;
}

export interface ExitCostContext {
  equityUsd?: number;
  nativePriceUsd?: number;
}

function sellCostUsd(position: Position, snapshot: PairSnapshot | null, ctx?: ExitCostContext): number {
  const notional = position.tokenAmount * position.lastPrice;
  const micro = isMicroAccount(ctx?.equityUsd ?? 0) || isMicroAccount(position.costUsd);
  return estimateSellCostUsd({
    notionalUsd: notional,
    nativePriceUsd: ctx?.nativePriceUsd ?? 100,
    liquidityUsd: snapshot?.liquidityUsd ?? 0,
    micro,
  }).costUsd;
}

function useSingleExit(position: Position, ctx?: ExitCostContext): boolean {
  return isMicroAccount(ctx?.equityUsd ?? 0) || isMicroAccount(position.costUsd);
}

function minNetProfitPct(settings: BotSettings): number {
  return Math.max(2, settings.takeProfitPct * 0.25);
}

/**
 * Ausstiegsregeln, bewusst defensiv: bei Memecoins entsteht der typische
 * Totalverlust durch Aussitzen, nicht durch zu frühes Mitnehmen.
 *
 * Reihenfolge: Notfall → Verlust begrenzen → These gebrochen → Gewinne sichern.
 *
 * Gewinnmitnahmen laufen erst, wenn das Plus nach geschätzten Verkaufskosten
 * (Jupiter-Impact, Swap-Fee, SOL-Tx) noch klar positiv ist. Auf Mini-Konten
 * ein Exit statt Teilverkäufen – jede Extra-Tx frisst sonst den Gewinn.
 *
 * Es gibt keine Garantie, dass Gas < Gewinn. Kurse können zwischen Ticks kippen.
 * Wir weigern uns nur, ein „grünes“ Plus zu verkaufen, das nach Fees rot wäre.
 */
export function decideExit(
  position: Position,
  settings: BotSettings,
  snapshot: PairSnapshot | null,
  now = Date.now(),
  costs?: ExitCostContext,
): ExitDecision | null {
  const pnlPct = position.pnlPct;
  const ageMinutes = (now - position.openedAt) / 60_000;
  const drawdownFromPeak =
    position.peakPrice > 0 ? ((position.peakPrice - position.lastPrice) / position.peakPrice) * 100 : 0;
  const peakPnlPct =
    position.entryPrice > 0 ? ((position.peakPrice - position.entryPrice) / position.entryPrice) * 100 : 0;
  const micro = useSingleExit(position, costs);
  const exitCost = sellCostUsd(position, snapshot, costs);
  const net = netAfterEstimatedSell(position, exitCost);

  if (snapshot && snapshot.liquidityUsd > 0 && snapshot.liquidityUsd < settings.minLiquidityUsd * 0.55) {
    return { fraction: 1, reason: 'Liquidität eingebrochen – Notausstieg', urgent: true };
  }

  if (micro && pnlPct <= -12) {
    return { fraction: 1, reason: `Kapitalschutz bei ${pnlPct.toFixed(1)}%`, urgent: true };
  }

  if (pnlPct <= -Math.abs(settings.stopLossPct)) {
    return { fraction: 1, reason: `Stop-Loss bei ${pnlPct.toFixed(1)}%`, urgent: true };
  }

  // These gebrochen: der Tape dreht, bevor der Stop-Loss greift.
  if (snapshot && snapshot.priceChangeM5 <= -7 && pnlPct < 4) {
    return {
      fraction: 1,
      reason: `These gebrochen – 5m ${snapshot.priceChangeM5.toFixed(1)}% bei ${pnlPct.toFixed(1)}%`,
      urgent: true,
    };
  }

  if (snapshot && snapshot.priceChangeM5 <= -12) {
    return {
      fraction: 1,
      reason: `Abrupter Dump (${snapshot.priceChangeM5.toFixed(1)}% in 5m)`,
      urgent: true,
    };
  }

  const tapeSells = snapshot ? snapshot.sellsM5 : 0;
  const tapeBuys = snapshot ? snapshot.buysM5 : 0;
  if (snapshot && tapeSells + tapeBuys >= 10 && tapeSells > tapeBuys * 1.7 && pnlPct < 8 && ageMinutes >= 3) {
    return { fraction: 1, reason: 'Verkäufer dominieren den Tape – Ausstieg', urgent: true };
  }

  // Gescheiterter Einstieg: nicht auf den Stop-Loss warten.
  if (ageMinutes >= 8 && pnlPct <= -4 && (!snapshot || snapshot.priceChangeM5 <= 0)) {
    return {
      fraction: 1,
      reason: `Gescheiterter Einstieg nach ${Math.round(ageMinutes)} Min. (${pnlPct.toFixed(1)}%)`,
      urgent: true,
    };
  }

  if (ageMinutes >= 6 && pnlPct < -2 && snapshot && snapshot.priceChangeH1 <= -8) {
    return { fraction: 1, reason: `1h-Trend gegen die Position (${snapshot.priceChangeH1.toFixed(1)}%)`, urgent: true };
  }

  const netEnough = net.netPct >= minNetProfitPct(settings);

  // Gewinnmitnahme: Mini-Konto verkauft komplett, größere Konten dürfen staffeln.
  if (position.partialsTaken === 0 && pnlPct >= settings.takeProfitPct) {
    if (!netEnough) return null;
    return {
      fraction: micro ? 1 : 0.65,
      reason: micro
        ? `Gewinnmitnahme bei +${pnlPct.toFixed(1)}% (netto ~${net.netPct.toFixed(1)}% nach Fees)`
        : `Teilgewinn bei +${pnlPct.toFixed(1)}%`,
      urgent: false,
    };
  }

  if (!micro && position.partialsTaken >= 1 && pnlPct >= settings.takeProfitPct * 1.8) {
    if (!netEnough) return null;
    return { fraction: 0.5, reason: `Zweiter Teilgewinn bei +${pnlPct.toFixed(1)}%`, urgent: false };
  }

  const trailingArmed = position.partialsTaken > 0 || pnlPct >= settings.takeProfitPct * 0.45;
  const trailWidth =
    peakPnlPct >= settings.takeProfitPct * 1.4 ? settings.trailingStopPct : Math.max(5, settings.trailingStopPct * 0.75);
  if (trailingArmed && drawdownFromPeak >= trailWidth) {
    if (net.netUsd <= 0 && pnlPct > 0) return null;
    return {
      fraction: 1,
      reason: `Trailing-Stop – ${drawdownFromPeak.toFixed(1)}% vom Hoch zurück`,
      urgent: true,
    };
  }

  // Gewinn sichern, sobald Momentum kippt – nicht erst tief im Plus.
  if (pnlPct > 5 && snapshot && snapshot.priceChangeM5 <= -6) {
    if (net.netUsd <= 0) return null;
    return { fraction: 1, reason: 'Momentum gedreht – Gewinn gesichert', urgent: true };
  }

  // Gewinne, die schon wieder fast weg sind, nicht in einen Verlust laufen lassen.
  if (peakPnlPct >= settings.takeProfitPct * 0.7 && pnlPct < 2 && drawdownFromPeak >= 6) {
    return {
      fraction: 1,
      reason: `Gewinn abgegeben – Hoch +${peakPnlPct.toFixed(1)}%, jetzt ${pnlPct.toFixed(1)}%`,
      urgent: true,
    };
  }

  if (ageMinutes >= settings.maxHoldMinutes && pnlPct < 8) {
    // Mini-Grün nach Fees oft rot: nicht per Zeitstopp verschenken, SL/TP bleiben.
    if (net.netUsd <= 0 && pnlPct > -2) {
      // weiter halten bis echter TP, SL oder harte Haltedauer
    } else {
      return {
        fraction: 1,
        reason: `Zeitstopp nach ${Math.round(ageMinutes)} Min. (${pnlPct.toFixed(1)}%)`,
        urgent: false,
      };
    }
  }

  if (ageMinutes >= settings.maxHoldMinutes * 2.5) {
    return { fraction: 1, reason: `Maximale Haltedauer erreicht (${pnlPct.toFixed(1)}%)`, urgent: false };
  }

  return null;
}
