import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createLogger } from '../util/logger.js';
import { nativePriceUsd } from '../chain/prices.js';
import { isSolanaChain, solanaConnection, tokenAmountForMint } from '../chain/solana.js';
import { solanaWallet } from '../chain/solanaWallet.js';
import { portfolio } from './portfolio.js';
import type { Position } from '../types.js';

const log = createLogger('reconcile');
const reconciling = new Set<string>();

export interface ReconcileResult {
  closed: boolean;
  reason: string;
  proceedsUsd?: number;
  txHash?: string;
}

function accountKey(keys: Array<{ pubkey: PublicKey } | PublicKey | string>, index: number): string {
  const key = keys[index];
  if (key instanceof PublicKey) return key.toBase58();
  if (typeof key === 'string') return key;
  return key.pubkey.toBase58();
}

/** Sucht eine kürzliche On-Chain-Verkaufstransaktion für einen Mint nach dem Einstieg. */
export async function findRecentSellTx(
  owner: PublicKey,
  mint: string,
  afterMs: number,
): Promise<{ signature: string; solDelta: number; tokenSold: number; decimals: number } | null> {
  const conn = solanaConnection();
  const ownerStr = owner.toBase58();
  const sigs = await conn.getSignaturesForAddress(owner, { limit: 50 });

  for (const sig of sigs) {
    if (!sig.blockTime) continue;
    if (sig.blockTime * 1000 < afterMs - 5_000) break;
    if (sig.err) continue;

    const tx = await conn.getParsedTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta) continue;

    const pre = tx.meta.preTokenBalances?.find((b) => b.mint === mint && b.owner === ownerStr);
    const post = tx.meta.postTokenBalances?.find((b) => b.mint === mint && b.owner === ownerStr);
    const preAmt = BigInt(pre?.uiTokenAmount?.amount ?? '0');
    const postAmt = BigInt(post?.uiTokenAmount?.amount ?? '0');
    if (preAmt <= postAmt) continue;

    const keys = tx.transaction.message.accountKeys;
    const idx = keys.findIndex((k) => {
      const pk = k instanceof PublicKey ? k : k.pubkey;
      return pk.toBase58() === ownerStr;
    });
    if (idx < 0) continue;

    const solDelta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / LAMPORTS_PER_SOL;
    const decimals = Number(pre?.uiTokenAmount?.decimals ?? post?.uiTokenAmount?.decimals ?? 9);

    return {
      signature: sig.signature,
      solDelta,
      tokenSold: Number(preAmt - postAmt) / 10 ** decimals,
      decimals,
    };
  }

  return null;
}

/**
 * Schliesst eine Position, wenn die Tokens on-chain fehlen (z. B. nach Neustart
 * während eines Verkaufs oder RPC-Lag nach dem Kauf).
 */
export async function reconcileGhostPosition(position: Position): Promise<ReconcileResult> {
  if (!isSolanaChain() || !solanaWallet.unlocked || position.mode !== 'live') {
    return { closed: false, reason: 'Abgleich nur im entsperrten Solana-Live-Modus' };
  }

  const current = portfolio.findPosition(position.id);
  if (!current || current.status === 'closed') {
    return { closed: false, reason: 'Bereits geschlossen' };
  }
  if (reconciling.has(position.id)) {
    return { closed: false, reason: 'Abgleich läuft bereits' };
  }

  reconciling.add(position.id);
  try {
    const owner = solanaWallet.requireKeypair().publicKey;
    const held = await tokenAmountForMint(owner, position.tokenAddress);
    if (held && held.amount > 0n) {
      return { closed: false, reason: 'Token-Guthaben vorhanden' };
    }

    const sellTx = await findRecentSellTx(owner, position.tokenAddress, position.openedAt);
    const solPrice = await nativePriceUsd('SOL');
    const priceUsd = position.lastPrice > 0 ? position.lastPrice : position.entryPrice;

    if (sellTx && sellTx.solDelta > 0) {
      const proceedsUsd = sellTx.solDelta * solPrice;
      const exitPrice = sellTx.tokenSold > 0 ? proceedsUsd / sellTx.tokenSold : priceUsd;
      portfolio.applySell({
        positionId: position.id,
        tokenAmount: position.tokenAmount,
        priceUsd: exitPrice,
        proceedsUsd,
        feeUsd: 0,
        reason: 'On-Chain-Abgleich: Verkauf bereits ausgeführt',
        txHash: sellTx.signature,
      });
      log.warn(
        `${position.symbol}: Geister-Position geschlossen – Verkauf ${sellTx.signature.slice(0, 10)}… bereits on-chain`,
      );
      return { closed: true, reason: 'Verkauf on-chain gefunden', proceedsUsd, txHash: sellTx.signature };
    }

    portfolio.applySell({
      positionId: position.id,
      tokenAmount: position.tokenAmount,
      priceUsd,
      proceedsUsd: 0,
      feeUsd: 0,
      reason: 'On-Chain-Abgleich: Kein Token-Guthaben – Position bereinigt',
    });
    log.warn(`${position.symbol}: Geister-Position ohne On-Chain-Guthaben bereinigt`);
    return { closed: true, reason: 'Kein Guthaben – Position bereinigt', proceedsUsd: 0 };
  } finally {
    reconciling.delete(position.id);
  }
}

export async function reconcileOpenPositions(mode: 'live' | 'paper'): Promise<number> {
  if (mode !== 'live' || !isSolanaChain() || !solanaWallet.unlocked) return 0;

  let closed = 0;
  for (const position of portfolio.openPositions(mode)) {
    const result = await reconcileGhostPosition(position);
    if (result.closed) closed += 1;
  }
  return closed;
}
