import { bell, clamp, normalize, saturate } from '../util/num.js';
import type { MarketIntel, ScoreBreakdown, ScoredCandidate, SecurityReport, TokenCandidate } from '../types.js';

export interface ScoringContext {
  intel: MarketIntel;
  minLiquidityUsd: number;
  /** Chain auf der echte Swaps moeglich sind (im Live-Modus Pflicht). */
  liveChain: string | null;
  blacklist: Set<string>;
  cooldowns: Map<string, number>;
}

/** Harte Ausschlusskriterien – hier wird nicht abgewogen, sondern abgelehnt. */
function hardRejections(c: TokenCandidate, security: SecurityReport, ctx: ScoringContext): string[] {
  const reasons: string[] = [];
  const key = `${c.chain}:${c.tokenAddress.toLowerCase()}`;

  if (ctx.blacklist.has(key)) reasons.push('Auf der Sperrliste');
  const cooldownUntil = ctx.cooldowns.get(key);
  if (cooldownUntil && cooldownUntil > Date.now()) {
    reasons.push(`Cooldown noch ${Math.ceil((cooldownUntil - Date.now()) / 60_000)} Min.`);
  }

  if (security.isHoneypot) reasons.push('Honeypot – Verkauf nicht möglich');
  if (ctx.liveChain && !security.checked) {
    reasons.push('Sicherheitsprüfung nicht verfügbar – kein Live-Kauf');
  }
  if (!security.ok) reasons.push('Sicherheitsprüfung nicht bestanden');
  if (security.sellTaxPct > 12) reasons.push(`Verkaufssteuer zu hoch (${security.sellTaxPct.toFixed(1)}%)`);

  if (c.liquidityUsd < ctx.minLiquidityUsd) {
    reasons.push(`Liquidität zu gering ($${Math.round(c.liquidityUsd).toLocaleString('de-DE')})`);
  }
  if (c.volume.h1 < 5_000) reasons.push('Zu wenig Handelsvolumen (1h)');

  const txnsH1 = c.txns.h1.buys + c.txns.h1.sells;
  if (txnsH1 < 25) reasons.push('Zu wenige Transaktionen (1h)');

  if (c.ageHours < 0.25) reasons.push('Paar zu jung (< 15 Min.)');
  if (c.priceChange.m5 > 120) reasons.push('Parabolischer Anstieg – Einstieg zu spät');
  if (c.priceChange.h24 < -55) reasons.push('Token im freien Fall (24h)');

  // Hohe Marktkapitalisierung bei duenner Liquiditaet = kaum verkaufbar.
  if (c.liquidityUsd > 0 && c.marketCap / c.liquidityUsd > 80) {
    reasons.push('Marktkapitalisierung im Verhältnis zur Liquidität zu hoch');
  }

  return reasons;
}

function momentumScore(c: TokenCandidate): { value: number; detail: string } {
  // Kurzfristiges Momentum dominiert, laengere Fenster bestaetigen den Trend.
  const m5 = normalize(c.priceChange.m5, -3, 12);
  const h1 = normalize(c.priceChange.h1, -8, 35);
  const h6 = normalize(c.priceChange.h6, -20, 70);
  let value = 0.45 * m5 + 0.35 * h1 + 0.2 * h6;

  // Ueberhitzung bestrafen: wer 60%+ in 5 Minuten macht, ist meist ausgereizt.
  if (c.priceChange.m5 > 40) value *= 0.6;
  else if (c.priceChange.m5 > 25) value *= 0.8;

  // Trend soll intakt sein: 1h stark negativ trotz 5m-Pop ist ein Dead-Cat-Bounce.
  if (c.priceChange.h1 < -12 && c.priceChange.m5 > 0) value *= 0.7;

  return {
    value: clamp(value, 0, 1),
    detail: `5m ${c.priceChange.m5.toFixed(1)}% · 1h ${c.priceChange.h1.toFixed(1)}% · 6h ${c.priceChange.h6.toFixed(1)}%`,
  };
}

function buyPressureScore(c: TokenCandidate): { value: number; detail: string } {
  const m5Total = c.txns.m5.buys + c.txns.m5.sells;
  const h1Total = c.txns.h1.buys + c.txns.h1.sells;
  const m5Ratio = m5Total > 0 ? c.txns.m5.buys / m5Total : 0.5;
  const h1Ratio = h1Total > 0 ? c.txns.h1.buys / h1Total : 0.5;

  // Wenig 5m-Transaktionen sind statistisch unzuverlaessig -> Richtung 1h ziehen.
  const m5Weight = clamp(m5Total / 20, 0, 1) * 0.5;
  const blended = m5Ratio * m5Weight + h1Ratio * (1 - m5Weight);

  return {
    value: normalize(blended, 0.4, 0.72),
    detail: `1h ${c.txns.h1.buys} Käufe / ${c.txns.h1.sells} Verkäufe (${(h1Ratio * 100).toFixed(0)}% Kaufanteil)`,
  };
}

function volumeScore(c: TokenCandidate): { value: number; detail: string } {
  const turnover = c.liquidityUsd > 0 ? c.volume.h1 / c.liquidityUsd : 0;
  const turnoverScore = saturate(turnover, 0.8);

  // Beschleunigung: laeuft die letzte 5-Minuten-Rate ueber dem 1h-Schnitt?
  const projectedHour = c.volume.m5 * 12;
  const acceleration = c.volume.h1 > 0 ? projectedHour / c.volume.h1 : 0;
  const accelScore = saturate(acceleration, 1.1);

  return {
    value: clamp(0.6 * turnoverScore + 0.4 * accelScore, 0, 1),
    detail: `1h-Volumen $${Math.round(c.volume.h1).toLocaleString('de-DE')} · Umschlag ${(turnover * 100).toFixed(0)}% · Beschleunigung ${acceleration.toFixed(2)}×`,
  };
}

function liquidityScore(c: TokenCandidate): { value: number; detail: string } {
  // Halbwert bei 60k: fuer Positionen im einstelligen Dollarbereich ist ein
  // 60k-Pool bereits reichlich, mehr Liquiditaet bringt kaum Zusatznutzen.
  return {
    value: saturate(c.liquidityUsd, 60_000),
    detail: `$${Math.round(c.liquidityUsd).toLocaleString('de-DE')} Pool-Liquidität`,
  };
}

function ageScore(c: TokenCandidate): { value: number; detail: string } {
  // Sweet Spot: alt genug um kein Instant-Rug zu sein, jung genug fuer Bewegung.
  const hours = c.ageHours;
  let value: number;
  if (hours < 1) value = 0.35;
  else if (hours < 72) value = 0.55 + 0.45 * bell(hours, 18, 30);
  else value = clamp(0.7 - (hours - 72) / 2000, 0.2, 0.7);

  const label =
    hours < 24 ? `${hours.toFixed(1)} Std.` : `${(hours / 24).toFixed(1)} Tage`;
  return { value: clamp(value, 0, 1), detail: `Paar-Alter ${label}` };
}

function sizeScore(c: TokenCandidate): { value: number; detail: string } {
  // Logarithmische Glocke: Optimum bei ca. 3 Mio. USD Marktkapitalisierung –
  // gross genug fuer Aufmerksamkeit, klein genug fuer Vervielfachung.
  const mcap = c.marketCap > 0 ? c.marketCap : c.fdv;
  if (mcap <= 0) return { value: 0.4, detail: 'Marktkapitalisierung unbekannt' };
  const value = bell(Math.log10(mcap), Math.log10(3_000_000), 1.15);
  return {
    value: clamp(0.25 + 0.75 * value, 0, 1),
    detail: `Marktkapitalisierung $${Math.round(mcap).toLocaleString('de-DE')}`,
  };
}

function hypeScore(c: TokenCandidate): { value: number; detail: string } {
  const value = saturate(c.boosts, 120);
  return {
    value,
    detail: c.boosts > 0 ? `${Math.round(c.boosts)} DexScreener-Boosts aktiv` : 'Keine bezahlten Boosts',
  };
}

const WEIGHTS = {
  momentum: 0.22,
  buyPressure: 0.15,
  volume: 0.16,
  liquidity: 0.11,
  security: 0.16,
  age: 0.09,
  size: 0.06,
  hype: 0.05,
} as const;

/**
 * Bewertet einen Kandidaten auf 0–100.
 *
 * Der Rohscore beschreibt die Qualitaet des Setups selbst. Erst danach wird das
 * Gesamtmarktbild als Multiplikator angelegt: dasselbe Setup ist in einem
 * risk-off-Markt objektiv weniger wert.
 */
export function scoreCandidate(
  candidate: TokenCandidate,
  security: SecurityReport,
  ctx: ScoringContext,
): ScoredCandidate {
  const parts = {
    momentum: momentumScore(candidate),
    buyPressure: buyPressureScore(candidate),
    volume: volumeScore(candidate),
    liquidity: liquidityScore(candidate),
    security: { value: security.score, detail: security.flags.length > 0 ? security.flags.join(' · ') : 'Keine Auffälligkeiten' },
    age: ageScore(candidate),
    size: sizeScore(candidate),
    hype: hypeScore(candidate),
  };

  const labels: Record<keyof typeof WEIGHTS, string> = {
    momentum: 'Preis-Momentum',
    buyPressure: 'Kaufdruck',
    volume: 'Volumen & Beschleunigung',
    liquidity: 'Liquidität',
    security: 'Contract-Sicherheit',
    age: 'Paar-Alter',
    size: 'Marktkapitalisierung',
    hype: 'Sichtbarkeit / Hype',
  };

  const breakdown: ScoreBreakdown[] = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => ({
    label: labels[key],
    weight: WEIGHTS[key],
    value: clamp(parts[key].value, 0, 1),
    detail: parts[key].detail,
  }));

  const rawScore = breakdown.reduce((sum, part) => sum + part.value * part.weight, 0) * 100;

  // Das Marktumfeld daempft oder verstaerkt das Setup, loescht es aber nicht aus:
  // auch in schwachen Phasen laufen einzelne Memecoins stark.
  const macroMultiplier = 0.7 + 0.35 * ctx.intel.riskAppetite;
  const rejections = hardRejections(candidate, security, ctx);

  if (ctx.liveChain && candidate.chain !== ctx.liveChain) {
    rejections.push(`Im Live-Modus nur ${ctx.liveChain} handelbar`);
  }

  return {
    candidate,
    security,
    rawScore,
    score: clamp(rawScore * macroMultiplier, 0, 100),
    breakdown,
    rejections,
    tradable: rejections.length === 0,
    scoredAt: Date.now(),
  };
}
