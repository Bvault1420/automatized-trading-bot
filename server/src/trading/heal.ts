import { createLogger } from '../util/logger.js';
import { nativePriceUsd } from '../chain/prices.js';
import {
  isSolanaChain,
  splBalances,
  tokenAmountForMint,
  USDC_MINT,
  USDT_MINT,
  WSOL_MINT,
} from '../chain/solana.js';
import { solanaWallet } from '../chain/solanaWallet.js';
import { executeSwap } from './executor/jupiter.js';
import { portfolio } from './portfolio.js';
import { reconcileGhostPosition, reconcileOpenPositions } from './reconcile.js';
import type { TokenCandidate } from '../types.js';

const log = createLogger('heal');
const STABLE_MINTS = new Set([USDC_MINT, USDT_MINT]);
let lastFullHealAt = 0;
const FULL_HEAL_MS = 45_000;

export interface HealReport {
  unstuck: number;
  synced: number;
  ghostsClosed: number;
  orphansSold: number;
  buysRecovered: number;
}

/** Läuft jeden Tick – repariert blockierte Käufe/Verkäufe automatisch. */
export async function healLiveTrading(): Promise<HealReport> {
  const report: HealReport = { unstuck: 0, synced: 0, ghostsClosed: 0, orphansSold: 0, buysRecovered: 0 };
  if (!isSolanaChain() || !solanaWallet.unlocked) return report;

  const unstuckIds = portfolio.unstuckClosing();
  report.unstuck = unstuckIds.length;
  if (unstuckIds.length > 0) {
    log.warn(`${unstuckIds.length} hängende Position(en) aus closing-Status befreit`);
  }

  for (const id of unstuckIds) {
    const pos = portfolio.findPosition(id);
    if (pos) await reconcileGhostPosition(pos);
  }

  if (Date.now() - lastFullHealAt < FULL_HEAL_MS) return report;
  lastFullHealAt = Date.now();

  report.synced = await syncOpenPositionBalances();
  report.ghostsClosed = await reconcileOpenPositions('live');
  report.orphansSold = await sellOrphanTokens();

  if (report.ghostsClosed > 0) {
    log.warn(`${report.ghostsClosed} Geister-Position(en) automatisch bereinigt`);
  }
  if (report.orphansSold > 0) {
    log.info(`${report.orphansSold} verwaiste Token-Bestände in SOL umgetauscht`);
  }

  return report;
}

/** DB-Tokenmenge mit On-Chain-Guthaben abgleichen. */
async function syncOpenPositionBalances(): Promise<number> {
  const owner = solanaWallet.requireKeypair().publicKey;
  let synced = 0;
  for (const position of portfolio.openPositions('live')) {
    const held = await tokenAmountForMint(owner, position.tokenAddress);
    if (!held || held.amount <= 0n) continue;
    const onChain = held.uiAmount;
    if (portfolio.syncTokenAmount(position.id, onChain)) synced += 1;
  }
  return synced;
}

/** Tokens in der Wallet ohne offene Position → verkaufen, damit Kapital frei wird. */
async function sellOrphanTokens(): Promise<number> {
  const owner = solanaWallet.requireKeypair().publicKey;
  const openMints = new Set(
    portfolio.openPositions('live').map((p) => p.tokenAddress.toLowerCase()),
  );
  const held = await splBalances(owner);
  let sold = 0;

  for (const row of held) {
    if (STABLE_MINTS.has(row.mint) || openMints.has(row.mint.toLowerCase())) continue;
    if (row.uiAmount * 0.01 < 0.15) continue; // zu klein für Swap

    try {
      const solPrice = await nativePriceUsd('SOL');
      const solBefore = await solanaWallet.nativeBalance();
      const result = await executeSwap(row.mint, WSOL_MINT, row.amount, 8, {
        maxLamports: 500_000,
        priorityLevel: 'medium',
      });
      const solAfter = await solanaWallet.nativeBalance();
      const proceedsUsd = Math.max(0, solAfter - solBefore) * solPrice;
      log.trade(
        `Verwaister Token ${row.mint.slice(0, 8)}… automatisch verkauft für ~$${proceedsUsd.toFixed(2)} – ${result.signature}`,
      );
      sold += 1;
    } catch (err) {
      log.warn(`Verwaister Token ${row.mint.slice(0, 8)}… konnte nicht verkauft werden: ${(err as Error).message}`);
    }
  }
  return sold;
}

/**
 * Kauf ist fehlgeschlagen, aber Tokens sind on-chain angekommen (z. B. Neustart
 * direkt nach Jupiter-Swap) → Position nachträglich anlegen.
 */
export async function recoverMissedBuy(
  candidate: TokenCandidate,
  amountUsd: number,
): Promise<boolean> {
  if (!isSolanaChain() || !solanaWallet.unlocked) return false;
  if (portfolio.hasOpenPosition('live', candidate.chain, candidate.tokenAddress)) return false;

  const owner = solanaWallet.requireKeypair().publicKey;
  const held = await tokenAmountForMint(owner, candidate.tokenAddress);
  if (!held || held.amount <= 0n || held.uiAmount <= 0) return false;

  const costUsd = Math.min(amountUsd, held.uiAmount * (candidate.priceUsd || 0.0001));
  const entryPrice = candidate.priceUsd > 0 ? candidate.priceUsd : costUsd / held.uiAmount;

  portfolio.openPosition({
    mode: 'live',
    chain: candidate.chain,
    pairAddress: candidate.pairAddress,
    tokenAddress: candidate.tokenAddress,
    symbol: candidate.symbol,
    name: candidate.name,
    url: candidate.url,
    entryPrice,
    tokenAmount: held.uiAmount,
    costUsd: costUsd > 0 ? costUsd : amountUsd,
    feeUsd: 0,
    entryScore: 0,
    entryReason: 'Auto-Reparatur: Kauf on-chain erkannt',
    entryLiquidityUsd: candidate.liquidityUsd,
    entryVolumeM5: candidate.volume.m5,
    stopLossPct: 8,
    takeProfitPct: 16,
  });

  log.warn(
    `${candidate.symbol}: Verpassten Kauf repariert – ${held.uiAmount.toFixed(4)} Tokens on-chain gefunden (~$${(held.uiAmount * entryPrice).toFixed(2)})`,
  );
  return true;
}

/** Bei fehlgeschlagenem Verkauf sofort reparieren statt endlos zu wiederholen. */
export async function healFailedSell(positionId: string): Promise<boolean> {
  const position = portfolio.findPosition(positionId);
  if (!position || position.status === 'closed') return false;
  const result = await reconcileGhostPosition(position);
  return result.closed;
}
