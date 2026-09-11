import type { Instrument, VenueId } from '../types.js';

export const VENUE_FEES: Record<VenueId, { takerFeePct: number; slippagePct: number }> = {
  binance: { takerFeePct: 0.001, slippagePct: 0.0004 },
  bybit: { takerFeePct: 0.001, slippagePct: 0.0005 },
  kraken: { takerFeePct: 0.0026, slippagePct: 0.0006 },
  coinbase: { takerFeePct: 0.006, slippagePct: 0.0008 },
  alpaca: { takerFeePct: 0, slippagePct: 0.0004 },
  paper: { takerFeePct: 0.001, slippagePct: 0.0005 },
};

export const UNIVERSE: Instrument[] = [
  crypto('BTCUSDT', 'Bitcoin', 'BTC', 'binance', 'BTCUSDT'),
  crypto('ETHUSDT', 'Ethereum', 'ETH', 'binance', 'ETHUSDT'),
  crypto('SOLUSDT', 'Solana', 'SOL', 'binance', 'SOLUSDT'),
  crypto('BNBUSDT', 'BNB', 'BNB', 'binance', 'BNBUSDT'),
  crypto('XRPUSDT', 'XRP', 'XRP', 'binance', 'XRPUSDT'),
  crypto('ADAUSDT', 'Cardano', 'ADA', 'binance', 'ADAUSDT'),
  crypto('AVAXUSDT', 'Avalanche', 'AVAX', 'binance', 'AVAXUSDT'),
  crypto('LINKUSDT', 'Chainlink', 'LINK', 'binance', 'LINKUSDT'),
  crypto('DOTUSDT', 'Polkadot', 'DOT', 'binance', 'DOTUSDT'),
  crypto('LTCUSDT', 'Litecoin', 'LTC', 'binance', 'LTCUSDT'),
  crypto('ATOMUSDT', 'Cosmos', 'ATOM', 'binance', 'ATOMUSDT'),
  crypto('NEARUSDT', 'NEAR', 'NEAR', 'binance', 'NEARUSDT'),
  crypto('APTUSDT', 'Aptos', 'APT', 'binance', 'APTUSDT'),
  crypto('SUIUSDT', 'Sui', 'SUI', 'binance', 'SUIUSDT'),
  crypto('AAVEUSDT', 'Aave', 'AAVE', 'binance', 'AAVEUSDT'),
  crypto('UNIUSDT', 'Uniswap', 'UNI', 'binance', 'UNIUSDT'),
  crypto('TRXUSDT', 'TRON', 'TRX', 'binance', 'TRXUSDT'),
  crypto('BCHUSDT', 'Bitcoin Cash', 'BCH', 'binance', 'BCHUSDT'),
  stock('SPY', 'S&P 500 ETF', 'etf'),
  stock('QQQ', 'Nasdaq 100 ETF', 'etf'),
  stock('IWM', 'Russell 2000 ETF', 'etf'),
  stock('AAPL', 'Apple', 'stock'),
  stock('MSFT', 'Microsoft', 'stock'),
  stock('NVDA', 'Nvidia', 'stock'),
  stock('AMZN', 'Amazon', 'stock'),
  stock('GOOGL', 'Alphabet', 'stock'),
  stock('META', 'Meta', 'stock'),
  stock('TSLA', 'Tesla', 'stock'),
  stock('GLD', 'Gold ETF', 'etf'),
];

function crypto(
  id: string,
  display: string,
  base: string,
  venue: VenueId,
  binance: string,
): Instrument {
  return {
    id,
    symbol: id,
    display,
    assetClass: 'crypto',
    base,
    quote: 'USDT',
    venues: ['binance', 'bybit', 'kraken'],
    binance,
    bybit: id,
  };
}

function stock(symbol: string, display: string, assetClass: 'stock' | 'etf'): Instrument {
  return {
    id: symbol,
    symbol,
    display,
    assetClass,
    base: symbol,
    quote: 'USD',
    venues: ['alpaca', 'paper'],
    yahoo: symbol,
    alpaca: symbol,
  };
}

export function instrumentById(id: string): Instrument | undefined {
  return UNIVERSE.find((x) => x.id === id);
}

export function cryptoUniverse(): Instrument[] {
  return UNIVERSE.filter((x) => x.assetClass === 'crypto');
}

export function stockUniverse(): Instrument[] {
  return UNIVERSE.filter((x) => x.assetClass !== 'crypto');
}
