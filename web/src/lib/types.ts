export type TradingMode = 'paper' | 'live';
export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error' | 'trade';

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
}

export interface IntelSignal {
  key: string;
  label: string;
  score: number;
  confidence: number;
  detail: string;
  source: string;
  updatedAt: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: number;
  matchedTerms: string[];
}

export interface MarketIntel {
  updatedAt: number;
  riskAppetite: number;
  regime: 'risk-on' | 'neutral' | 'risk-off';
  signals: IntelSignal[];
  fearGreed: { value: number; classification: string; previous: number } | null;
  macro: {
    totalMarketCapUsd: number;
    marketCapChange24h: number;
    btcDominance: number;
    btc: { price: number; change24h: number; change7d: number } | null;
    eth: { price: number; change24h: number; change7d: number } | null;
    sol: { price: number; change24h: number; change7d: number } | null;
  } | null;
  news: { sentiment: number; bullishCount: number; bearishCount: number; items: NewsItem[] };
  social: { heat: number; trendingTerms: { term: string; mentions: number }[] };
  narrative: string;
}

export interface TokenCandidate {
  id: string;
  chain: string;
  pairAddress: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  dex: string;
  url: string;
  priceUsd: number;
  liquidityUsd: number;
  fdv: number;
  marketCap: number;
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  txns: { m5: { buys: number; sells: number }; h1: { buys: number; sells: number } };
  ageHours: number;
  boosts: number;
  imageUrl?: string;
}

export interface SecurityReport {
  checked: boolean;
  ok: boolean;
  score: number;
  isHoneypot: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  lpLocked: boolean;
  holderCount: number;
  top10HolderPct: number;
  flags: string[];
  source: string;
}

export interface ScoredCandidate {
  candidate: TokenCandidate;
  security: SecurityReport;
  score: number;
  rawScore: number;
  breakdown: { label: string; weight: number; value: number; detail: string }[];
  rejections: string[];
  tradable: boolean;
  scoredAt: number;
}

export interface Position {
  id: string;
  chain: string;
  symbol: string;
  name: string;
  url: string;
  status: 'open' | 'closing' | 'closed';
  mode: TradingMode;
  openedAt: number;
  entryPrice: number;
  entryScore: number;
  entryReason: string;
  tokenAmount: number;
  costUsd: number;
  realizedUsd: number;
  feesUsd: number;
  lastPrice: number;
  peakPrice: number;
  partialsTaken: number;
  unrealizedPnlUsd: number;
  pnlUsd: number;
  pnlPct: number;
  exitReason?: string;
}

export interface Trade {
  id: string;
  symbol: string;
  chain: string;
  url: string;
  mode: TradingMode;
  openedAt: number;
  closedAt: number;
  holdSeconds: number;
  entryPrice: number;
  exitPrice: number;
  costUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
  pnlPct: number;
  entryScore: number;
  entryReason: string;
  exitReason: string;
}

export interface EquityPoint {
  ts: number;
  equity: number;
  cash: number;
  exposure: number;
}

export interface BotSettings {
  tradingMode: TradingMode;
  maxOpenPositions: number;
  riskPerTradePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  minLiquidityUsd: number;
  maxSlippagePct: number;
  minEntryScore: number;
  scanChains: string[];
}

export interface PortfolioState {
  mode: TradingMode;
  cashUsd: number;
  exposureUsd: number;
  equityUsd: number;
  startEquityUsd: number;
  peakEquityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlPct: number;
  dayPnlPct: number;
  drawdownPct: number;
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
}

export interface DepositAsset {
  symbol: string;
  name: string;
  address: string | null;
  decimals: number;
  kind: 'native' | 'stable' | 'btc' | 'wrapped';
  balance: number;
  balanceUsd: number;
  priceUsd: number;
}

export interface WalletState {
  family: 'solana' | 'evm';
  ownerAddress: string | null;
  botAddress: string | null;
  chain: string;
  chainId: number;
  explorer: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeBalanceUsd: number;
  nativePriceUsd: number;
  hasKeystore: boolean;
  unlocked: boolean;
  liveReady: boolean;
  liveBlockers: string[];
  assets: DepositAsset[];
  tokenUsd: number;
  totalUsd: number;
}

export interface Stats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  bestTradePct: number;
  worstTradePct: number;
  avgHoldSeconds: number;
  expectancyPct: number;
}

export interface FullState {
  status: BotStatus;
  settings: BotSettings;
  portfolio: PortfolioState;
  positions: Position[];
  closedPositions: Position[];
  trades: Trade[];
  stats: Stats;
  equityCurve: EquityPoint[];
  intel: MarketIntel;
  candidates: ScoredCandidate[];
  wallet: WalletState;
  logs: LogEntry[];
  meta: {
    chain: string;
    chainId: number;
    family?: 'solana' | 'evm';
    nativeSymbol: string;
    explorer: string;
    scanChains: string[];
  };
}
