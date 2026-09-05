import { isMicroAccount, estimateSellCostUsd, netAfterEstimatedSell } from './fees.js';
import type { BotSettings, MarketIntel, PairSnapshot, Position } from '../types.js';

export interface ExitDecision {
  fraction: number;
  reason: string;
  urgent: boolean;
}

export interface ExitCostContext {
  equityUsd?: number;
  nativePriceUsd?: number;
  intel?: MarketIntel;
  entryLiquidityUsd?: number;
  entryVolumeM5?: number;
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

function entryLiquidity(position: Position, ctx?: ExitCostContext): number {
  return ctx?.entryLiquidityUsd ?? position.entryLiquidityUsd ?? 0;
}

function entryVolume(position: Position, ctx?: ExitCostContext): number {
  return ctx?.entryVolumeM5 ?? position.entryVolumeM5 ?? 0;
}

function symbolNegativeNews(symbol: string, intel?: MarketIntel): string | null {
  if (!intel) return null;
  const sym = symbol.toUpperCase();
  for (const item of intel.news.items) {
    if (item.sentiment >= -0.18) continue;
    const hit =
      item.matchedTerms.some((t) => t.toUpperCase() === sym) ||
      item.title.toUpperCase().includes(sym);
    if (hit) return item.title.slice(0, 72);
  }
  return null;
}

/**
 * Ausstiegsregeln, bewusst defensiv: bei Memecoins entsteht der typische
 * Totalverlust durch Aussitzen, nicht durch zu frühes Mitnehmen.
 *
 * Reihenfolge: Notfall (Liq/News/Tape) → Verlust begrenzen → These gebrochen → Gewinne sichern.
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
  const intel = costs?.intel;
  const liqAtEntry = entryLiquidity(position, costs);
  const volAtEntry = entryVolume(position, costs);

  // --- Absoluter Hard-Stop-Loss: Bei -20% (oder tiefer) bedingungsloser Sofortausstieg ---
  if (pnlPct <= -20) {
    return { fraction: 1, reason: `Maximalverlust erreicht (${pnlPct.toFixed(1)}%) – Hard-Exit`, urgent: true };
  }

  // --- Notfall: Liquidität, Volumen, News, Makro ---
  if (snapshot && snapshot.liquidityUsd > 0 && snapshot.liquidityUsd < settings.minLiquidityUsd * 0.75) {
    return { fraction: 1, reason: 'Liquidität eingebrochen – Sofort-Verkauf', urgent: true };
  }

  if (snapshot && liqAtEntry > 0 && snapshot.liquidityUsd > 0) {
    const liqDropPct = ((liqAtEntry - snapshot.liquidityUsd) / liqAtEntry) * 100;
    if (liqDropPct >= 18) {
      return {
        fraction: 1,
        reason: `Pool-Liquidität −${liqDropPct.toFixed(0)}% seit Einstieg – Notausstieg`,
        urgent: true,
      };
    }
  }

  if (snapshot && volAtEntry > 400) {
    const volRatio = snapshot.volumeM5 / volAtEntry;
    if (volRatio < 0.32 && (snapshot.priceChangeM5 <= -2 || pnlPct < 5)) {
      return { fraction: 1, reason: 'Handelsvolumen eingebrochen – Ausstieg', urgent: true };
    }
  }

  if (snapshot && snapshot.volumeM5 > 0 && snapshot.volumeM5 < 350 && snapshot.priceChangeM5 <= -4 && ageMinutes >= 1) {
    return { fraction: 1, reason: 'Dünner Tape + fallender Kurs – Ausstieg', urgent: true };
  }

  const badHeadline = symbolNegativeNews(position.symbol, intel);
  if (badHeadline) {
    return { fraction: 1, reason: `Negative News – ${badHeadline}`, urgent: true };
  }

  if (intel) {
    if (
      intel.news.sentiment < -0.26 &&
      intel.news.bearishCount > intel.news.bullishCount + 1 &&
      pnlPct < 8
    ) {
      return { fraction: 1, reason: 'Bärisches News-Umfeld – defensive Schließung', urgent: true };
    }

    const btc = intel.macro?.btc;
    if (btc && btc.change24h <= -5.5 && pnlPct < 5) {
      return {
        fraction: 1,
        reason: `BTC unter Druck (${btc.change24h.toFixed(1)}%) – Position geschlossen`,
        urgent: true,
      };
    }

    if (intel.regime === 'risk-off' && pnlPct < 2 && snapshot && snapshot.priceChangeM5 <= -3) {
      return { fraction: 1, reason: 'Risk-off Markt + schwacher Tape – Ausstieg', urgent: true };
    }
  }

  if (micro && pnlPct <= -12) {
    return { fraction: 1, reason: `Kapitalschutz bei ${pnlPct.toFixed(1)}%`, urgent: true };
  }

  if (pnlPct <= -Math.abs(settings.stopLossPct)) {
    return { fraction: 1, reason: `Stop-Loss bei ${pnlPct.toFixed(1)}%`, urgent: true };
  }

  if (snapshot && snapshot.priceChangeM5 <= -5 && pnlPct < 6) {
    return {
      fraction: 1,
      reason: `These gebrochen – 5m ${snapshot.priceChangeM5.toFixed(1)}% bei ${pnlPct.toFixed(1)}%`,
      urgent: true,
    };
  }

  if (snapshot && snapshot.priceChangeM5 <= -10) {
    return {
      fraction: 1,
      reason: `Abrupter Dump (${snapshot.priceChangeM5.toFixed(1)}% in 5m)`,
      urgent: true,
    };
  }

  const tapeSells = snapshot ? snapshot.sellsM5 : 0;
  const tapeBuys = snapshot ? snapshot.buysM5 : 0;
  if (snapshot && tapeSells + tapeBuys >= 6 && tapeSells > tapeBuys * 1.45 && pnlPct < 10) {
    return { fraction: 1, reason: 'Verkäufer dominieren den Tape – Ausstieg', urgent: true };
  }

  if (ageMinutes >= 5 && pnlPct <= -3.5 && (!snapshot || snapshot.priceChangeM5 <= 0)) {
    return {
      fraction: 1,
      reason: `Gescheiterter Einstieg nach ${Math.round(ageMinutes)} Min. (${pnlPct.toFixed(1)}%)`,
      urgent: true,
    };
  }

  if (ageMinutes >= 4 && pnlPct < -1.5 && snapshot && snapshot.priceChangeH1 <= -6) {
    return { fraction: 1, reason: `1h-Trend gegen die Position (${snapshot.priceChangeH1.toFixed(1)}%)`, urgent: true };
  }

  const netEnough = net.netPct >= minNetProfitPct(settings);

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

  // Für Micro-Konten: Schneller Gewinnmitnahme bei +8% – kleine Konten können sich kein Zurückgeben leisten
  if (micro && pnlPct >= 8 && net.netPct >= 3) {
    return {
      fraction: 1,
      reason: `Quick-Profit bei +${pnlPct.toFixed(1)}% (netto +${net.netPct.toFixed(1)}%)`,
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

  if (pnlPct > 4 && snapshot && snapshot.priceChangeM5 <= -5) {
    if (net.netUsd <= 0) return null;
    return { fraction: 1, reason: 'Momentum gedreht – Gewinn gesichert', urgent: true };
  }

  if (peakPnlPct >= settings.takeProfitPct * 0.65 && pnlPct < 2.5 && drawdownFromPeak >= 5) {
    return {
      fraction: 1,
      reason: `Gewinn abgegeben – Hoch +${peakPnlPct.toFixed(1)}%, jetzt ${pnlPct.toFixed(1)}%`,
      urgent: true,
    };
  }

  if (ageMinutes >= settings.maxHoldMinutes && pnlPct < 8) {
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
