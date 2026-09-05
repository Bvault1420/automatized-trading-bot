import { bell, clamp, normalize, saturate } from '../util/num.js';
import { mentionBoost } from '../intel/fresh.js';
import type { MarketIntel, ScoreBreakdown, ScoredCandidate, SecurityReport, TokenCandidate } from '../types.js';

export interface ScoringContext {
  intel: MarketIntel;
  minLiquidityUsd: number;
  /** Chain auf der echte Swaps moeglich sind (im Live-Modus Pflicht). */
  liveChain: string | null;
  blacklist: Set<string>;
  cooldowns: Map<string, number>;
}

const JUNK_NAME = /\b(test|scam|rug|airdrop|claim|free mint|honeypot)\b/i;

function buyRatio(buys: number, sells: number): number {
  const total = buys + sells;
  return total > 0 ? buys / total : 0.5;
}

/**
 * Harte Ausschlusskriterien – hier wird nicht abgewogen, sondern abgelehnt.
 * Ziel: Dump, Late-Chase und Thin-Tape gar nicht erst in den Einstieg lassen.
 */
export function hardRejections(c: TokenCandidate, security: SecurityReport, ctx: ScoringContext): string[] {
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
  if (security.score < 0.42 && security.checked) {
    reasons.push('Contract-Sicherheit unter Mindestqualität');
  }
  if (!security.ok) reasons.push('Sicherheitsprüfung nicht bestanden');
  if (security.sellTaxPct > 10) reasons.push(`Verkaufssteuer zu hoch (${security.sellTaxPct.toFixed(1)}%)`);
  if (security.top10HolderPct >= 75) {
    reasons.push(`Top-10-Wallets halten ${security.top10HolderPct.toFixed(0)}%`);
  }

  if (c.liquidityUsd < ctx.minLiquidityUsd) {
    reasons.push(`Liquidität zu gering ($${Math.round(c.liquidityUsd).toLocaleString('de-DE')})`);
  }
  if (c.volume.h1 < 2_500) reasons.push('Zu wenig Handelsvolumen (1h)');

  const txnsH1 = c.txns.h1.buys + c.txns.h1.sells;
  if (txnsH1 < 15) reasons.push('Zu wenige Transaktionen (1h)');

  if (c.ageHours < 0.15) reasons.push('Paar extrem jung (< 9 Min.) – Hohes Rug-Risiko');
  if (c.ageHours > 21 * 24 && c.volume.h1 < 25_000 && c.priceChange.h24 < 8) {
    reasons.push('Altes, ausgereiztes Paar ohne frische Nachfrage');
  }

  if (c.priceChange.m5 > 55) reasons.push('Parabolischer 5-Minuten-Anstieg – Einstieg zu spät');
  if (c.priceChange.h1 > 85 && c.priceChange.m5 > 18) reasons.push('Bewegung überhitzt – Late-Chase');
  if (c.priceChange.m5 < -8) reasons.push('Aktueller 5-Minuten-Dump');
  if (c.priceChange.h1 < -16) reasons.push('1h-Trend bereits gebrochen');
  if (c.priceChange.h24 < -40) reasons.push('Token im freien Fall (24h)');
  if (c.priceChange.h6 < -28 && c.priceChange.m5 > 2) {
    reasons.push('Dead-Cat-Bounce nach 6h-Abfall');
  }

  const h1Ratio = buyRatio(c.txns.h1.buys, c.txns.h1.sells);
  if (h1Ratio < 0.4) reasons.push(`Verkäufer dominieren 1h (${(h1Ratio * 100).toFixed(0)}% Käufe)`);

  const m5Total = c.txns.m5.buys + c.txns.m5.sells;
  if (m5Total >= 16 && c.txns.m5.sells > c.txns.m5.buys * 2) {
    reasons.push('Aktuelle Verteilung – mehr Verkäufe als Käufe');
  }

  if (c.liquidityUsd > 0 && c.marketCap / c.liquidityUsd > 140) {
    reasons.push('Marktkapitalisierung im Verhältnis zur Liquidität zu hoch');
  }

  if (c.volume.h24 > 0 && c.volume.h1 < c.volume.h24 / 60 && c.priceChange.m5 < -2) {
    reasons.push('Volumen stirbt ab');
  }

  if (JUNK_NAME.test(c.symbol) || JUNK_NAME.test(c.name)) {
    reasons.push('Name/Symbol wirkt unseriös');
  }

  return reasons;
}

function momentumScore(c: TokenCandidate): { value: number; detail: string } {
  // Sweet Spot: gesunde Bewegung, kein Chase in die Spitze.
  const m5 = bell(c.priceChange.m5, 7, 9);
  const h1 = bell(c.priceChange.h1, 16, 18);
  const h6 = normalize(c.priceChange.h6, -8, 36);
  let value = 0.42 * m5 + 0.38 * h1 + 0.2 * h6;

  if (c.priceChange.h1 < 0 && c.priceChange.m5 > 0) value *= 0.4;
  if (c.priceChange.m5 > 28) value *= 0.45;
  else if (c.priceChange.m5 > 18) value *= 0.75;
  if (c.priceChange.h24 > 140) value *= 0.7;
  if (c.priceChange.h1 < -8) value *= 0.55;

  return {
    value: clamp(value, 0, 1),
    detail: `5m ${c.priceChange.m5.toFixed(1)}% · 1h ${c.priceChange.h1.toFixed(1)}% · 6h ${c.priceChange.h6.toFixed(1)}%`,
  };
}

function buyPressureScore(c: TokenCandidate): { value: number; detail: string } {
  const m5Total = c.txns.m5.buys + c.txns.m5.sells;
  const h1Total = c.txns.h1.buys + c.txns.h1.sells;
  const m5Ratio = buyRatio(c.txns.m5.buys, c.txns.m5.sells);
  const h1Ratio = buyRatio(c.txns.h1.buys, c.txns.h1.sells);
  const m5Weight = clamp(m5Total / 18, 0, 1) * 0.45;
  const blended = m5Ratio * m5Weight + h1Ratio * (1 - m5Weight);

  return {
    value: normalize(blended, 0.48, 0.7),
    detail: `1h ${c.txns.h1.buys} Käufe / ${c.txns.h1.sells} Verkäufe (${(h1Ratio * 100).toFixed(0)}% Kaufanteil)`,
  };
}

function volumeScore(c: TokenCandidate): { value: number; detail: string } {
  const turnover = c.liquidityUsd > 0 ? c.volume.h1 / c.liquidityUsd : 0;
  const turnoverScore = saturate(turnover, 0.7);
  const projectedHour = c.volume.m5 * 12;
  const acceleration = c.volume.h1 > 0 ? projectedHour / c.volume.h1 : 0;
  const accelScore = saturate(acceleration, 1.05);
  const persistence = c.volume.h6 > 0 ? saturate(c.volume.h1 / (c.volume.h6 / 6), 1.1) : 0.45;

  return {
    value: clamp(0.5 * turnoverScore + 0.3 * accelScore + 0.2 * persistence, 0, 1),
    detail: `1h-Volumen $${Math.round(c.volume.h1).toLocaleString('de-DE')} · Umschlag ${(turnover * 100).toFixed(0)}% · Beschleunigung ${acceleration.toFixed(2)}×`,
  };
}

function liquidityScore(c: TokenCandidate): { value: number; detail: string } {
  return {
    value: saturate(c.liquidityUsd, 80_000),
    detail: `$${Math.round(c.liquidityUsd).toLocaleString('de-DE')} Pool-Liquidität`,
  };
}

function ageScore(c: TokenCandidate): { value: number; detail: string } {
  const hours = c.ageHours;
  let value: number;
  if (hours < 3) value = 0.32;
  else if (hours < 72) value = 0.5 + 0.5 * bell(hours, 18, 22);
  else value = clamp(0.65 - (hours - 72) / 1800, 0.18, 0.65);

  const label = hours < 24 ? `${hours.toFixed(1)} Std.` : `${(hours / 24).toFixed(1)} Tage`;
  return { value: clamp(value, 0, 1), detail: `Paar-Alter ${label}` };
}

function sizeScore(c: TokenCandidate): { value: number; detail: string } {
  const mcap = c.marketCap > 0 ? c.marketCap : c.fdv;
  if (mcap <= 0) return { value: 0.35, detail: 'Marktkapitalisierung unbekannt' };
  const value = bell(Math.log10(mcap), Math.log10(2_400_000), 1.05);
  return {
    value: clamp(0.22 + 0.78 * value, 0, 1),
    detail: `Marktkapitalisierung $${Math.round(mcap).toLocaleString('de-DE')}`,
  };
}

function structureScore(c: TokenCandidate): { value: number; detail: string } {
  const h1Ratio = buyRatio(c.txns.h1.buys, c.txns.h1.sells);
  const grind = bell(c.priceChange.m5, 6, 8) * bell(c.priceChange.h1, 14, 16);
  const notExtended = c.priceChange.h24 < 80 ? 1 : c.priceChange.h24 < 130 ? 0.6 : 0.25;
  const social = c.hasSocials ? 0.08 : 0;
  const value = clamp(0.55 * grind + 0.35 * normalize(h1Ratio, 0.5, 0.68) + 0.1 * notExtended + social, 0, 1);

  return {
    value,
    detail: c.hasSocials
      ? 'Gesunde Struktur, Projekt mit Socials/Website'
      : 'Struktur ohne nachweisbare Socials',
  };
}

function hypeScore(c: TokenCandidate, intel: MarketIntel): { value: number; detail: string } {
  const raw = saturate(c.boosts, 180);
  const paid = c.boosts > 250 ? raw * 0.55 : raw;
  const mentions = intel.social.trendingTerms.map((t) => ({
    term: t.term,
    mentions: t.mentions,
    newestAgeMin: 12,
  }));
  const tape = mentionBoost(c.symbol, mentions);
  const value = clamp(paid * 0.65 + tape * 2.2, 0, 1);
  const parts: string[] = [];
  if (c.boosts > 0) parts.push(`${Math.round(c.boosts)} DexScreener-Boosts`);
  if (tape > 0) parts.push(`frisch erwähnt ($${c.symbol.toUpperCase()})`);
  return {
    value,
    detail: parts.length > 0 ? parts.join(' · ') : 'Keine frische Retail-Erwähnung',
  };
}

const WEIGHTS = {
  momentum: 0.17,
  buyPressure: 0.16,
  volume: 0.14,
  liquidity: 0.1,
  security: 0.2,
  age: 0.07,
  size: 0.05,
  structure: 0.09,
  hype: 0.02,
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
    security: {
      value: security.score,
      detail: security.flags.length > 0 ? security.flags.join(' · ') : 'Keine Auffälligkeiten',
    },
    age: ageScore(candidate),
    size: sizeScore(candidate),
    structure: structureScore(candidate),
    hype: hypeScore(candidate, ctx.intel),
  };

  const labels: Record<keyof typeof WEIGHTS, string> = {
    momentum: 'Preis-Momentum',
    buyPressure: 'Kaufdruck',
    volume: 'Volumen & Beschleunigung',
    liquidity: 'Liquidität',
    security: 'Contract-Sicherheit',
    age: 'Paar-Alter',
    size: 'Marktkapitalisierung',
    structure: 'Setup-Qualität',
    hype: 'Sichtbarkeit / Hype',
  };

  const breakdown: ScoreBreakdown[] = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => ({
    label: labels[key],
    weight: WEIGHTS[key],
    value: clamp(parts[key].value, 0, 1),
    detail: parts[key].detail,
  }));

  const rawScore = breakdown.reduce((sum, part) => sum + part.value * part.weight, 0) * 100;
  const macroMultiplier = 0.72 + 0.32 * ctx.intel.riskAppetite;
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
