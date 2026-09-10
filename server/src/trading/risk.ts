import { HARD_CAPS } from '../config.js';
import { nowDayStamp } from '../util/num.js';
import type { AccountSlice, AdaptiveRules, PortfolioState, Position, Trade, TradingMode } from '../types.js';

export interface GlobalRiskInput {
  rules: AdaptiveRules;
  account: AccountSlice;
  equityEur: number;
  open: Position[];
  recent: Trade[];
  consecutiveLosses: number;
  cooldownUntil: number | null;
  now?: number;
}

export interface RiskVerdict {
  allowed: boolean;
  reason: string;
}

export function checkGlobalRisk(input: GlobalRiskInput): RiskVerdict {
  const now = input.now ?? Date.now();
  const { rules, account, equityEur } = input;
  const dayPnlPct = account.dayStartEquityEur
    ? ((equityEur - account.dayStartEquityEur) / account.dayStartEquityEur) * 100
    : 0;
  const dd = account.peakEquityEur ? ((account.peakEquityEur - equityEur) / account.peakEquityEur) * 100 : 0;

  if (dayPnlPct <= -Math.abs(rules.dailyLossLimitPct)) {
    return { allowed: false, reason: `Tagesverlust ${dayPnlPct.toFixed(1)} % – keine neuen Einstiege` };
  }
  if (dd >= Math.abs(rules.maxDrawdownPct)) {
    return { allowed: false, reason: `Drawdown ${dd.toFixed(1)} % – Schutzmodus` };
  }
  if (input.cooldownUntil && input.cooldownUntil > now) {
    const min = Math.ceil((input.cooldownUntil - now) / 60_000);
    return { allowed: false, reason: `Verlustserie – Pause noch ${min} Min.` };
  }
  if (input.open.length >= Math.min(rules.maxOpenPositions, HARD_CAPS.maxOpenPositions)) {
    return { allowed: false, reason: 'Maximale Anzahl offener Positionen' };
  }
  const stamp = nowDayStamp(now);
  const entries = account.entriesDayStamp === stamp ? account.entriesToday : 0;
  if (entries >= Math.min(rules.maxEntriesPerDay, HARD_CAPS.maxEntriesCeiling)) {
    return { allowed: false, reason: `Tageslimit ${entries} Einstiege – Qualität vor Menge` };
  }
  if (input.consecutiveLosses >= rules.consecutiveLossPause) {
    return { allowed: false, reason: `${input.consecutiveLosses} Verluste in Folge – Pause` };
  }

  const last = input.recent.slice(-12);
  if (last.length >= 10) {
    const wins = last.filter((t) => t.action !== 'open' && t.pnlEur > 0).length;
    const closed = last.filter((t) => t.action !== 'open');
    const pnl = closed.reduce((a, t) => a + t.pnlEur, 0);
    if (closed.length >= 8 && pnl < 0 && wins / closed.length < 0.28) {
      return {
        allowed: false,
        reason: 'Letzte Trades negativ (viele kleine Verluste) – Bot handelt erst nach Selbsttest weiter',
      };
    }
  }

  return { allowed: true, reason: 'Risiko ok' };
}

export function portfolioFrom(
  mode: TradingMode,
  account: AccountSlice,
  open: Position[],
  mtmEur: number,
): PortfolioState {
  const equityEur = account.cashEur + mtmEur;
  const dayPnlEur = equityEur - account.dayStartEquityEur;
  const totalPnlEur = equityEur - account.startEquityEur;
  const drawdownPct = account.peakEquityEur
    ? ((account.peakEquityEur - equityEur) / account.peakEquityEur) * 100
    : 0;
  return {
    mode,
    cashEur: account.cashEur,
    equityEur,
    startEquityEur: account.startEquityEur,
    dayPnlEur,
    dayPnlPct: account.dayStartEquityEur ? (dayPnlEur / account.dayStartEquityEur) * 100 : 0,
    totalPnlEur,
    totalPnlPct: account.startEquityEur ? (totalPnlEur / account.startEquityEur) * 100 : 0,
    drawdownPct,
    openRiskEur: 0,
  };
}

export function consecutiveLosses(trades: Trade[]): number {
  const closed = trades.filter((t) => t.action !== 'open').slice().reverse();
  let n = 0;
  for (const t of closed) {
    if (t.pnlEur < 0) n += 1;
    else break;
  }
  return n;
}
