import { clamp } from '../util/num.js';
import type { BotSettings, MarketIntel, PairSnapshot, TokenCandidate, Trade } from '../types.js';

export interface TapeVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Letzter Blick auf den Live-Tape, bevor Kapital gebunden wird.
 * Der Scan-Score ist ein paar Sekunden alt – hier werden Dump, Spike und
 * Liquiditätsloch zwischen Scan und Order abgefangen.
 */
export function confirmLiveTape(
  candidate: TokenCandidate,
  snapshot: PairSnapshot | null,
  settings: BotSettings,
): TapeVerdict {
  if (!snapshot) {
    return { ok: false, reason: 'Kein aktueller Kurs – Einstieg abgebrochen' };
  }

  if (snapshot.priceUsd <= 0) {
    return { ok: false, reason: 'Ungültiger Live-Preis' };
  }

  if (snapshot.liquidityUsd > 0 && snapshot.liquidityUsd < settings.minLiquidityUsd * 0.85) {
    return {
      ok: false,
      reason: `Liquidität seit dem Scan gefallen ($${Math.round(snapshot.liquidityUsd).toLocaleString('de-DE')})`,
    };
  }

  if (candidate.priceUsd > 0) {
    const movePct = ((snapshot.priceUsd - candidate.priceUsd) / candidate.priceUsd) * 100;
    if (movePct <= -6) {
      return { ok: false, reason: `Kurs seit Scan ${movePct.toFixed(1)}% – Dump nicht hinterherlaufen` };
    }
    if (movePct >= 12) {
      return { ok: false, reason: `Kurs seit Scan +${movePct.toFixed(1)}% – Spike nicht jagen` };
    }
  }

  if (snapshot.priceChangeM5 <= -3) {
    return { ok: false, reason: `5-Minuten-Tape negativ (${snapshot.priceChangeM5.toFixed(1)}%)` };
  }

  if (snapshot.priceChangeH1 <= -12) {
    return { ok: false, reason: `1h-Trend bereits gebrochen (${snapshot.priceChangeH1.toFixed(1)}%)` };
  }

  const tapeTotal = snapshot.buysM5 + snapshot.sellsM5;
  if (tapeTotal >= 12 && snapshot.sellsM5 > snapshot.buysM5 * 1.5) {
    return { ok: false, reason: 'Verkäufer dominieren den aktuellen Tape' };
  }

  return { ok: true, reason: 'Tape bestätigt' };
}

/**
 * Effektive Einstiegsschwelle: Basis-Score plus Aufschläge, wenn der Markt
 * oder die eigene jüngste Trefferquote gegen neue Trades spricht.
 */
export function effectiveMinScore(
  settings: BotSettings,
  intel: MarketIntel,
  recentTrades: Trade[],
  consecutiveLosses: number,
): number {
  let min = settings.minEntryScore;

  if (intel.regime === 'risk-off') min += 10;
  else if (intel.regime === 'neutral') min += 3;

  const btc = intel.macro?.btc;
  if (btc) {
    if (btc.change24h <= -8) min += 14;
    else if (btc.change24h <= -4) min += 7;
    else if (btc.change24h <= -2) min += 3;
  }

  if (consecutiveLosses >= 3) min += 8;
  else if (consecutiveLosses >= 2) min += 5;

  const window = recentTrades.slice(-8);
  if (window.length >= 5) {
    const wins = window.filter((t) => t.pnlUsd > 0).length;
    const wr = wins / window.length;
    if (wr < 0.3) min += 8;
    else if (wr < 0.4) min += 4;
  }

  return clamp(min, 0, 92);
}

/** BTC-Crash: neue Einstiege pausieren, offene Positionen bleiben geschützt. */
export function marketEntryBlocked(intel: MarketIntel): string | null {
  const btc = intel.macro?.btc;
  if (!btc) return null;
  if (btc.change24h <= -8 && btc.change7d <= -4) {
    return `BTC-Crash (${btc.change24h.toFixed(1)}% / 24h) – keine neuen Einstiege`;
  }
  return null;
}
