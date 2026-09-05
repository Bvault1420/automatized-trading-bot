import { clamp } from '../util/num.js';
import type { Position } from '../types.js';

/** Unter diesem Equity: eine Position, ein Exit, knappes Gas. */
export const MICRO_EQUITY_USD = 8;

/** Nach schwerem Verlust: Restkapital (~1 €) soll noch handelbar sein. */
export const RECOVERY_EQUITY_USD = 2.5;

export const MIN_TRADE_USD = 1;
export const MIN_TRADE_RECOVERY_USD = 0.55;

/**
 * SOL, die für einen Jupiter-Verkauf liegen bleiben müssen.
 * Kleiner als früher (0.008), reicht für eine Exit-Tx inkl. Priority-Fee.
 * Liegt weiter im Wallet – das ist kein Portfolioverlust.
 */
export const GAS_RESERVE_SOL_MICRO = 0.004;

/** Typische Priority+Base-Fee einer Jupiter-Tx (nicht das Maximum). */
export const SOL_TX_COST_SOL = 0.0012;
/** Mini-Konto: bewusst niedrigere Priority, sonst frisst Gas den TP. */
export const SOL_TX_COST_SOL_MICRO = 0.00055;
/** Miete für ein neues Associated Token Account, bis das Konto geschlossen wird. */
export const SOL_ATA_RENT_SOL = 0.00203928;
/** DEX-Swapgebühr pro Seite, grob 30 bp. */
export const AMM_FEE_PCT = 0.3;

export function isMicroAccount(equityUsd: number): boolean {
  return equityUsd > 0 && equityUsd <= MICRO_EQUITY_USD;
}

/** Konto stark unter Start – Drawdown-Halt lockern, kleinere Tickets erlauben. */
export function isRecoveryAccount(equityUsd: number, startEquityUsd: number): boolean {
  return equityUsd > 0 && equityUsd <= RECOVERY_EQUITY_USD && startEquityUsd > equityUsd * 1.3;
}

export function minTradeUsd(equityUsd: number, startEquityUsd: number): number {
  return isRecoveryAccount(equityUsd, startEquityUsd) ? MIN_TRADE_RECOVERY_USD : MIN_TRADE_USD;
}

export interface SwapCostInput {
  notionalUsd: number;
  nativePriceUsd: number;
  liquidityUsd?: number;
  /** Kauf legt oft ein Token-Konto an (~0.002 SOL), Verkauf kann es schließen. */
  includeAtaRent?: boolean;
  micro?: boolean;
}

export interface SwapCostEstimate {
  costUsd: number;
  costPct: number;
  txUsd: number;
  ataUsd: number;
  ammUsd: number;
  impactPct: number;
}

export function estimatePriceImpactPct(amountUsd: number, liquidityUsd: number): number {
  if (!(liquidityUsd > 0) || !(amountUsd > 0)) return 0;
  const ratio = amountUsd / (liquidityUsd / 2);
  return clamp((ratio / (1 + ratio)) * 100, 0, 100);
}

export function estimateSwapCostUsd(input: SwapCostInput): SwapCostEstimate {
  const price = input.nativePriceUsd > 0 ? input.nativePriceUsd : 100;
  const notional = Math.max(0, input.notionalUsd);
  const txSol = input.micro ? SOL_TX_COST_SOL_MICRO : SOL_TX_COST_SOL;
  const txUsd = txSol * price;
  const ataUsd = input.includeAtaRent ? SOL_ATA_RENT_SOL * price : 0;
  const impactPct = estimatePriceImpactPct(notional, input.liquidityUsd ?? 0);
  const ammUsd = notional * (AMM_FEE_PCT / 100);
  const impactUsd = notional * (impactPct / 100);
  const costUsd = txUsd + ataUsd + ammUsd + impactUsd;
  return {
    costUsd,
    costPct: notional > 0 ? (costUsd / notional) * 100 : 0,
    txUsd,
    ataUsd,
    ammUsd,
    impactPct,
  };
}

export function estimateSellCostUsd(input: Omit<SwapCostInput, 'includeAtaRent'>): SwapCostEstimate {
  const raw = estimateSwapCostUsd({ ...input, includeAtaRent: false });
  const price = input.nativePriceUsd > 0 ? input.nativePriceUsd : 100;
  // Exit-Hürde bewusst nicht zu billig: Priority-Fees schwanken, Mini-Plus sonst im Gas.
  const floorTx = price * SOL_TX_COST_SOL;
  const costUsd = Math.max(raw.costUsd, floorTx);
  const notional = Math.max(0, input.notionalUsd);
  return {
    ...raw,
    costUsd,
    txUsd: Math.max(raw.txUsd, floorTx),
    costPct: notional > 0 ? (costUsd / notional) * 100 : 0,
  };
}

export function estimateRoundTripCostUsd(input: SwapCostInput): SwapCostEstimate {
  const buy = estimateSwapCostUsd({ ...input, includeAtaRent: input.includeAtaRent ?? true });
  const sell = estimateSwapCostUsd({ ...input, includeAtaRent: false });
  const costUsd = buy.costUsd + sell.costUsd;
  const notional = Math.max(0, input.notionalUsd);
  return {
    costUsd,
    costPct: notional > 0 ? (costUsd / notional) * 100 : 0,
    txUsd: buy.txUsd + sell.txUsd,
    ataUsd: buy.ataUsd,
    ammUsd: buy.ammUsd + sell.ammUsd,
    impactPct: buy.impactPct + sell.impactPct,
  };
}

/**
 * Einstieg ablehnen, wenn geschätzte Hin- und Rückkosten den Take-Profit
 * größtenteils auffressen. Keine Garantie, dass Gas < Gewinn – Memecoins
 * können zwischen zwei Ticks dumpfen.
 */
export function roundTripAllowsEntry(
  notionalUsd: number,
  takeProfitPct: number,
  rt: SwapCostEstimate,
  recovery = false,
): { ok: boolean; reason: string } {
  if (!(notionalUsd > 0)) return { ok: false, reason: 'Positionsgröße ungültig' };

  if (recovery) {
    const maxCostPct = 38;
    if (rt.costPct <= maxCostPct) {
      return { ok: true, reason: 'Recovery: Round-Trip-Kosten tragbar' };
    }
    return {
      ok: false,
      reason: `Recovery: Round-Trip ~$${rt.costUsd.toFixed(2)} (${rt.costPct.toFixed(1)}%) frisst zu viel vom Restkapital`,
    };
  }

  const tpUsd = notionalUsd * (Math.abs(takeProfitPct) / 100);
  const maxCostShare = 0.55;
  if (rt.costUsd >= tpUsd * maxCostShare) {
    return {
      ok: false,
      reason: `Round-Trip ~$${rt.costUsd.toFixed(2)} (${rt.costPct.toFixed(1)}%) würde den ${takeProfitPct}% Take-Profit größtenteils auffressen`,
    };
  }
  return { ok: true, reason: 'Round-Trip-Kosten tragbar' };
}

export function netAfterEstimatedSell(
  position: Pick<Position, 'costUsd' | 'tokenAmount' | 'lastPrice' | 'realizedUsd' | 'feesUsd'>,
  sellCostUsd: number,
): { netUsd: number; netPct: number; value: number; sellCostUsd: number } {
  const value = position.tokenAmount * position.lastPrice;
  const netUsd = position.realizedUsd + value - position.costUsd - position.feesUsd - Math.max(0, sellCostUsd);
  const netPct = position.costUsd > 0 ? (netUsd / position.costUsd) * 100 : 0;
  return { netUsd, netPct, value, sellCostUsd: Math.max(0, sellCostUsd) };
}

export function decoratePosition<T extends Position>(
  position: T,
  nativePriceUsd: number,
  liquidityUsd = 0,
): T & { estimatedExitCostUsd: number; netPnlUsd: number; netPnlPct: number } {
  const micro = isMicroAccount(position.costUsd) || position.costUsd <= MICRO_EQUITY_USD;
  const sell = estimateSellCostUsd({
    notionalUsd: position.tokenAmount * position.lastPrice,
    nativePriceUsd,
    liquidityUsd,
    micro,
  });
  const net = netAfterEstimatedSell(position, sell.costUsd);
  return {
    ...position,
    estimatedExitCostUsd: sell.costUsd,
    netPnlUsd: net.netUsd,
    netPnlPct: net.netPct,
  };
}
