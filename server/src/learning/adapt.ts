import { HARD_CAPS } from '../config.js';
import { uid } from '../util/num.js';
import type { AdaptiveRules, RuleChange, StrategyId, Trade } from '../types.js';

export const FACTORY_RULES: AdaptiveRules = {
  minQuality: 74,
  minRewardToRisk: 1.9,
  riskPerTradePct: 1.0,
  maxEntriesPerDay: 16,
  maxOpenPositions: 3,
  maxHoldMinutes: 36 * 60,
  dailyLossLimitPct: 4,
  maxDrawdownPct: 12,
  consecutiveLossPause: 4,
  strategyWeights: {
    meanReversion: 1.15,
    trend: 1.0,
    grid: 0.85,
    breakout: 0.8,
  },
  disabledStrategies: [],
  preferMeanReversion: true,
};

const LOCKED_RISK = FACTORY_RULES.riskPerTradePct;

export function clampRules(rules: AdaptiveRules): AdaptiveRules {
  return {
    ...rules,
    minQuality: clamp(rules.minQuality, HARD_CAPS.minQualityFloor, HARD_CAPS.minQualityCeiling),
    minRewardToRisk: clamp(rules.minRewardToRisk, HARD_CAPS.minRrFloor, HARD_CAPS.minRrCeiling),
    riskPerTradePct: Math.min(LOCKED_RISK, clamp(rules.riskPerTradePct, HARD_CAPS.riskPctFloor, HARD_CAPS.riskPctCeiling)),
    maxEntriesPerDay: clamp(rules.maxEntriesPerDay, HARD_CAPS.maxEntriesFloor, HARD_CAPS.maxEntriesCeiling),
    maxOpenPositions: clamp(rules.maxOpenPositions, 1, HARD_CAPS.maxOpenPositions),
    dailyLossLimitPct: clamp(rules.dailyLossLimitPct, 2, 6),
    maxDrawdownPct: clamp(rules.maxDrawdownPct, 6, 15),
    consecutiveLossPause: clamp(rules.consecutiveLossPause, 3, 6),
  };
}

export function adaptRules(
  current: AdaptiveRules,
  trades: Trade[],
  now = Date.now(),
): { rules: AdaptiveRules; changes: RuleChange[] } {
  const closed = trades.filter((t) => t.action !== 'open');
  if (closed.length < 8) return { rules: clampRules(current), changes: [] };

  const next = clampRules({ ...current, strategyWeights: { ...current.strategyWeights } });
  const changes: RuleChange[] = [];
  const record = (title: string, detail: string, before: Partial<AdaptiveRules>, after: Partial<AdaptiveRules>) => {
    changes.push({ id: uid('rule'), at: now, title, detail, before, after });
  };

  const winRate = closed.filter((t) => t.pnlEur > 0).length / closed.length;
  const pnl = closed.reduce((a, t) => a + t.pnlEur, 0);
  const recent = closed.slice(-15);
  const recentPnl = recent.reduce((a, t) => a + t.pnlEur, 0);
  const recentWins = recent.filter((t) => t.pnlEur > 0).length / Math.max(1, recent.length);

  if (recent.length >= 10 && recentWins < 0.32 && recentPnl < 0) {
    const before = next.minQuality;
    next.minQuality = Math.min(HARD_CAPS.minQualityCeiling, next.minQuality + 3);
    if (next.minQuality !== before) {
      record(
        'Qualität angehoben',
        `Viele kleine Verluste (Winrate ${(recentWins * 100).toFixed(0)} %). Bot wird wählerischer, Risiko bleibt ${next.riskPerTradePct} %.`,
        { minQuality: before },
        { minQuality: next.minQuality },
      );
    }
    const beforeCap = next.maxEntriesPerDay;
    next.maxEntriesPerDay = Math.max(HARD_CAPS.maxEntriesFloor, next.maxEntriesPerDay - 2);
    if (next.maxEntriesPerDay !== beforeCap) {
      record(
        'Weniger Trades',
        'Churn erkannt – weniger Einstiege pro Tag, dafür nur noch klare Pläne.',
        { maxEntriesPerDay: beforeCap },
        { maxEntriesPerDay: next.maxEntriesPerDay },
      );
    }
  }

  if (winRate > 0.48 && pnl > 0 && next.minQuality > HARD_CAPS.minQualityFloor + 2) {
    const before = next.minQuality;
    next.minQuality = Math.max(HARD_CAPS.minQualityFloor, next.minQuality - 1);
    if (next.minQuality !== before) {
      record(
        'Leicht gelockert',
        'Selbsttest positiv, Qualitätsschwelle minimal gesenkt – Risiko unverändert.',
        { minQuality: before },
        { minQuality: next.minQuality },
      );
    }
  }

  for (const id of Object.keys(next.strategyWeights) as StrategyId[]) {
    const subset = closed.filter((t) => t.strategy === id);
    if (subset.length < 6) continue;
    const exp = subset.reduce((a, t) => a + t.pnlEur, 0) / subset.length;
    if (exp < 0 && !next.disabledStrategies.includes(id) && id !== 'meanReversion') {
      next.disabledStrategies = [...next.disabledStrategies, id];
      next.strategyWeights[id] = 0;
      record(
        `${id} pausiert`,
        `Erwartungswert dieser Strategie ist negativ (${exp.toFixed(2)} €/Trade). Mean Reversion bleibt als Kern.`,
        {},
        { disabledStrategies: next.disabledStrategies },
      );
    } else if (exp > 0) {
      next.strategyWeights[id] = Math.min(1.3, (next.strategyWeights[id] || 0.5) + 0.05);
      if (next.disabledStrategies.includes(id)) {
        next.disabledStrategies = next.disabledStrategies.filter((x) => x !== id);
        record(`${id} wieder aktiv`, 'Selbsttest zeigt wieder positiven Erwartungswert.', {}, {});
      }
    }
  }

  next.riskPerTradePct = Math.min(LOCKED_RISK, next.riskPerTradePct);
  return { rules: clampRules(next), changes };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
