import type { Position, TokenCandidate, TradingMode } from '../../types.js';

export interface BuyResult {
  ok: boolean;
  error?: string;
  tokenAmount: number;
  /** Effektiver Ausfuehrungspreis inklusive Slippage. */
  priceUsd: number;
  /** Tatsaechlich eingesetztes Kapital in USD. */
  spentUsd: number;
  feeUsd: number;
  slippagePct: number;
  txHash?: string;
}

export interface SellResult {
  ok: boolean;
  error?: string;
  tokenAmount: number;
  priceUsd: number;
  proceedsUsd: number;
  feeUsd: number;
  slippagePct: number;
  txHash?: string;
}

export interface Executor {
  mode: TradingMode;
  /** Verfuegbares handelbares Kapital in USD. */
  availableCashUsd(): Promise<number>;
  buy(candidate: TokenCandidate, amountUsd: number, maxSlippagePct: number): Promise<BuyResult>;
  sell(position: Position, fraction: number, maxSlippagePct: number): Promise<SellResult>;
  /** Gruende die echten Handel derzeit verhindern (leer = bereit). */
  blockers(): Promise<string[]>;
}
