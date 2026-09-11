export type TradingMode = 'paper' | 'live';
export type Side = 'long' | 'short';
export type AssetClass = 'crypto' | 'stock' | 'etf';
export type StrategyId = 'meanReversion' | 'trend' | 'grid' | 'breakout';
export type Regime = 'trend-up' | 'trend-down' | 'range' | 'breakout' | 'risk-off';
export type VenueId = 'binance' | 'bybit' | 'kraken' | 'coinbase' | 'alpaca' | 'paper';
export type PositionStatus = 'open' | 'partial';

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Instrument {
  id: string;
  symbol: string;
  display: string;
  assetClass: AssetClass;
  base: string;
  quote: string;
  venues: VenueId[];
  binance?: string;
  bybit?: string;
  yahoo?: string;
  alpaca?: string;
}

export interface VenueQuote {
  venue: VenueId;
  price: number;
  takerFeePct: number;
  slippagePct: number;
  liquid: boolean;
}

export interface TradePlan {
  instrumentId: string;
  display: string;
  venue: VenueId;
  strategy: StrategyId;
  regime: Regime;
  side: Side;
  thesis: string;
  invalidation: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  runnerTrailPct: number;
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
  mode: TradingMode;
  source?: 'auto' | 'manual';
  instrumentId: string;
  display: string;
  assetClass: AssetClass;
  venue: VenueId;
  strategy: StrategyId;
  regime: Regime;
  side: Side;
  status: PositionStatus;
  qty: number;
  entry: number;
  remainingQty: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp1Filled: boolean;
  tp2Filled: boolean;
  trailPct: number;
  highWater: number;
  lowWater: number;
  openedAt: number;
  plan: TradePlan;
  feesPaidEur: number;
  realizedEur: number;
}

export interface Trade {
  id: string;
  positionId: string;
  mode: TradingMode;
  instrumentId: string;
  display: string;
  venue: VenueId;
  strategy: StrategyId;
  regime: Regime;
  side: Side;
  action: 'open' | 'tp1' | 'tp2' | 'stop' | 'trail' | 'time' | 'manual' | 'halt';
  qty: number;
  price: number;
  pnlEur: number;
  feeEur: number;
  rMultiple: number;
  quality: number;
  at: number;
  note: string;
}

export interface EquityPoint {
  t: number;
  equityEur: number;
  mode: TradingMode;
}

export interface AdaptiveRules {
  minQuality: number;
  minRewardToRisk: number;
  riskPerTradePct: number;
  maxEntriesPerDay: number;
  maxOpenPositions: number;
  maxHoldMinutes: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  consecutiveLossPause: number;
  strategyWeights: Record<StrategyId, number>;
  disabledStrategies: StrategyId[];
  preferMeanReversion: boolean;
}

export interface BotSettings {
  tradingMode: TradingMode;
  paperStartEur: number;
  emailEveryTrade: boolean;
  alertEmail: string;
  liveArmed: boolean;
  allowStocks: boolean;
  allowCrypto: boolean;
  allowShorts: boolean;
  tickSeconds: number;
}

export interface AccountSlice {
  cashEur: number;
  startEquityEur: number;
  dayStartEquityEur: number;
  dayStartedAt: number;
  peakEquityEur: number;
  realizedPnlEur: number;
  entriesToday: number;
  entriesDayStamp: string;
}

export interface RuleChange {
  id: string;
  at: number;
  title: string;
  detail: string;
  before: Partial<AdaptiveRules>;
  after: Partial<AdaptiveRules>;
}

export interface LogEntry {
  t: number;
  level: 'info' | 'warn' | 'error' | 'success';
  scope: string;
  message: string;
}

export interface MarketSnapshot {
  instrumentId: string;
  display: string;
  assetClass: AssetClass;
  price: number;
  venue: VenueId;
  changePct: number;
  atrPct: number;
  rsi: number;
  adx: number;
  updatedAt: number;
}

export interface Candidate extends TradePlan {
  blocked?: string;
}

export interface PortfolioState {
  mode: TradingMode;
  cashEur: number;
  equityEur: number;
  startEquityEur: number;
  dayPnlEur: number;
  dayPnlPct: number;
  totalPnlEur: number;
  totalPnlPct: number;
  drawdownPct: number;
  openRiskEur: number;
}

export interface BotStatus {
  running: boolean;
  mode: TradingMode;
  haltReason: string | null;
  startedAt: number | null;
  lastTickAt: number | null;
  lastScanAt: number | null;
  cyclesCompleted: number;
  consecutiveLosses: number;
  cooldownUntil: number | null;
  regime: Regime;
  activeStrategyBias: StrategyId;
  paperDefault: true;
}

export interface SelfTestReport {
  at: number;
  trades: number;
  winRate: number;
  expectancyEur: number;
  maxDrawdownPct: number;
  profitFactor: number;
  recommendation: string;
  applied: boolean;
}

export interface DashboardState {
  status: BotStatus;
  settings: BotSettings;
  rules: AdaptiveRules;
  portfolio: PortfolioState;
  positions: Position[];
  trades: Trade[];
  candidates: Candidate[];
  markets: MarketSnapshot[];
  logs: LogEntry[];
  equityCurve: EquityPoint[];
  ruleChanges: RuleChange[];
  selfTest: SelfTestReport | null;
  live: {
    ready: boolean;
    blockers: string[];
  };
  email: {
    configured: boolean;
  };
}
