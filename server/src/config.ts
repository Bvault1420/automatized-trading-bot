import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..', '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(key: string, fallback = ''): string {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

/**
 * Chains auf denen der Bot handeln kann. `dexscreenerId` ist der Slug der
 * DexScreener-API, `goplusId` die numerische Chain-ID der GoPlus-Security-API.
 */
export const CHAINS = {
  base: {
    id: 8453,
    name: 'Base',
    dexscreenerId: 'base',
    goplusId: '8453',
    nativeSymbol: 'ETH',
    wrappedNative: '0x4200000000000000000000000000000000000006',
    defaultRpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
  ethereum: {
    id: 1,
    name: 'Ethereum',
    dexscreenerId: 'ethereum',
    goplusId: '1',
    nativeSymbol: 'ETH',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    defaultRpc: 'https://eth.llamarpc.com',
    explorer: 'https://etherscan.io',
  },
  bsc: {
    id: 56,
    name: 'BNB Chain',
    dexscreenerId: 'bsc',
    goplusId: '56',
    nativeSymbol: 'BNB',
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    defaultRpc: 'https://bsc-dataseed.binance.org',
    explorer: 'https://bscscan.com',
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum',
    dexscreenerId: 'arbitrum',
    goplusId: '42161',
    nativeSymbol: 'ETH',
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
  },
} as const;

export type ChainKey = keyof typeof CHAINS;

const chainKey = str('CHAIN', 'base') as ChainKey;

export const config = {
  port: num('PORT', 8787),
  corsOrigins: str('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Chain fuer echte Swaps. */
  chainKey: CHAINS[chainKey] ? chainKey : ('base' as ChainKey),
  get chain() {
    return CHAINS[this.chainKey];
  },
  rpcUrl: str('RPC_URL'),
  walletPassphrase: str('WALLET_PASSPHRASE'),
  zeroExApiKey: str('ZEROX_API_KEY'),
  cryptoPanicKey: str('CRYPTOPANIC_API_KEY'),

  /** Chains die der Scanner nach Kandidaten durchsucht. */
  scanChains: ['base', 'solana', 'bsc', 'ethereum'] as string[],

  intervals: {
    /** Makro-/News-/Stimmungsdaten (langsam veraenderlich). */
    intel: 90_000,
    /** Suche nach neuen Handelskandidaten. */
    scan: 25_000,
    /** Preis-Update offener Positionen + Exit-Pruefung. */
    tick: 6_000,
  },

  defaults: {
    tradingMode: str('TRADING_MODE', 'paper') === 'live' ? 'live' : 'paper',
    paperStartBalance: num('PAPER_START_BALANCE', 11),
    maxOpenPositions: num('MAX_OPEN_POSITIONS', 3),
    riskPerTradePct: num('RISK_PER_TRADE_PCT', 22),
    stopLossPct: num('STOP_LOSS_PCT', 18),
    takeProfitPct: num('TAKE_PROFIT_PCT', 35),
    trailingStopPct: num('TRAILING_STOP_PCT', 14),
    maxHoldMinutes: num('MAX_HOLD_MINUTES', 45),
    dailyLossLimitPct: num('DAILY_LOSS_LIMIT_PCT', 25),
    maxDrawdownPct: num('MAX_DRAWDOWN_PCT', 40),
    minLiquidityUsd: num('MIN_LIQUIDITY_USD', 25_000),
    maxSlippagePct: num('MAX_SLIPPAGE_PCT', 6),
    /**
     * Mindest-Score (0-100) fuer einen Einstieg. Empirisch kalibriert: solide
     * Setups landen bei 45-55, wirklich starke bei 60+. Hoeher = weniger, aber
     * selektivere Trades.
     */
    minEntryScore: num('MIN_ENTRY_SCORE', 55),
    /** Gebuehren-Annahme im Paper-Modus (DEX-Fee pro Seite, in Prozent). */
    paperFeePct: num('PAPER_FEE_PCT', 0.3),
  },
} as const;

export type BotDefaults = typeof config.defaults;
