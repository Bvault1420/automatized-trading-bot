export type TradingMode = 'paper' | 'live';
export type StrategyId = 'meanReversion' | 'trend' | 'grid' | 'breakout';
export type Regime = 'trend-up' | 'trend-down' | 'range' | 'breakout' | 'risk-off';

export interface TradePlan {
  instrumentId: string;
  display: string;
  venue: string;
  strategy: StrategyId;
  regime: Regime;
  side: 'long' | 'short';
  thesis: string;
  invalidation: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rewardToRisk: number;
  feePct: number;
  feeEur: number;
  riskEur: number;
  notionalEur: number;
  quality: number;
  reasons: string[];
}

export interface Position {
  id: string;
  source?: 'auto' | 'manual';
  display: string;
  venue: string;
  strategy: StrategyId;
  side: 'long' | 'short';
  remainingQty: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp1Filled: boolean;
  tp2Filled: boolean;
  plan: TradePlan;
  realizedEur: number;
}

export interface Trade {
  id: string;
  display: string;
  strategy: StrategyId;
  action: string;
  pnlEur: number;
  feeEur: number;
  rMultiple: number;
  at: number;
  note: string;
  quality: number;
}

export interface DashboardState {
  status: {
    running: boolean;
    mode: TradingMode;
    haltReason: string | null;
    lastTickAt: number | null;
    consecutiveLosses: number;
    cooldownUntil: number | null;
    regime: Regime;
    activeStrategyBias: StrategyId;
    cyclesCompleted: number;
  };
  settings: {
    tradingMode: TradingMode;
    paperStartEur: number;
    emailEveryTrade: boolean;
    alertEmail: string;
    liveArmed: boolean;
    allowStocks: boolean;
    allowCrypto: boolean;
    allowShorts: boolean;
  };
  rules: {
    minQuality: number;
    minRewardToRisk: number;
    riskPerTradePct: number;
    maxEntriesPerDay: number;
    maxOpenPositions: number;
    dailyLossLimitPct: number;
    strategyWeights: Record<string, number>;
    disabledStrategies: string[];
  };
  portfolio: {
    cashEur: number;
    equityEur: number;
    startEquityEur: number;
    dayPnlEur: number;
    dayPnlPct: number;
    totalPnlEur: number;
    totalPnlPct: number;
    drawdownPct: number;
  };
  positions: Position[];
  trades: Trade[];
  candidates: (TradePlan & { blocked?: string })[];
  markets: Array<{
    instrumentId: string;
    display: string;
    assetClass: string;
    price: number;
    changePct: number;
    rsi: number;
    adx: number;
    venue: string;
  }>;
  logs: Array<{ t: number; level: string; scope: string; message: string }>;
  equityCurve: Array<{ t: number; equityEur: number }>;
  ruleChanges: Array<{ id: string; at: number; title: string; detail: string }>;
  selfTest: {
    at: number;
    trades: number;
    winRate: number;
    expectancyEur: number;
    profitFactor: number;
    recommendation: string;
  } | null;
  live: { ready: boolean; blockers: string[] };
  email: { configured: boolean };
}
