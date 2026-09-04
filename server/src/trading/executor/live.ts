import { erc20Abi, formatUnits, maxUint256, parseEther, parseUnits, type Address, type Hex } from 'viem';
import { config } from '../../config.js';
import { botWallet } from '../../chain/wallet.js';
import { hotWallet } from '../../chain/hot.js';
import { nativePriceUsd } from '../../chain/prices.js';
import { createLogger } from '../../util/logger.js';
import { clamp } from '../../util/num.js';
import { routeSwap } from './router.js';
import { executeSwap } from './jupiter.js';
import { readDeposits, sweepToNative } from '../../chain/deposits.js';
import {
  GAS_RESERVE_SOL,
  WSOL_MINT,
  isSolanaChain,
  tokenAmountForMint,
} from '../../chain/solana.js';
import { solanaWallet } from '../../chain/solanaWallet.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { Position, TokenCandidate } from '../../types.js';
import type { BuyResult, Executor, SellResult } from './types.js';

const log = createLogger('live');

/** Native-Reserve, damit immer genug fuer Gas (auch fuer den Exit) bleibt. */
export const GAS_RESERVE_ETH = 0.00025;

export function gasReserve(): number {
  return isSolanaChain() ? GAS_RESERVE_SOL : GAS_RESERVE_ETH;
}

function failBuy(error: string): BuyResult {
  return { ok: false, error, tokenAmount: 0, priceUsd: 0, spentUsd: 0, feeUsd: 0, slippagePct: 0 };
}

function failSell(error: string): SellResult {
  return { ok: false, error, tokenAmount: 0, priceUsd: 0, proceedsUsd: 0, feeUsd: 0, slippagePct: 0 };
}

/**
 * Fuehrt echte On-Chain-Swaps aus.
 *
 * Solana: Jupiter Lite API (kein Key noetig).
 * EVM: KyberSwap / LiFi (optional 0x).
 */
export class LiveExecutor implements Executor {
  readonly mode = 'live' as const;

  private decimalsCache = new Map<string, number>();

  async blockers(): Promise<string[]> {
    const reasons: string[] = [];
    const native = config.chain.nativeSymbol;
    if (!hotWallet.hasKeystore) reasons.push('Zuerst ein Bot-Wallet erstellen (rechte Seite, Passphrase vergeben)');
    else if (!hotWallet.unlocked) {
      reasons.push('Bot-Wallet ist gesperrt – Passphrase eingeben, damit der Bot Transaktionen signieren kann');
    }

    const snap = hotWallet.address
      ? await readDeposits()
      : { nativeBalance: 0, tokenUsd: 0, totalUsd: 0, nativeBalanceUsd: 0 };

    const reserve = gasReserve();
    if (snap.nativeBalance <= reserve && snap.tokenUsd < 1) {
      reasons.push(
        isSolanaChain()
          ? `Noch kein Guthaben: sende SOL oder USDC auf Solana an das Bot-Wallet`
          : `Noch kein Guthaben: sende ETH, USDC oder cbBTC auf ${config.chain.name} an das Bot-Wallet`,
      );
    } else if (snap.nativeBalance <= reserve && snap.tokenUsd >= 1) {
      reasons.push(
        `${snap.tokenUsd.toFixed(2)} $ in Tokens erkannt, aber es fehlt etwas ${native} als Gebühr für die Umwandlung`,
      );
    }
    return reasons;
  }

  async snapshotUsd(): Promise<{ availableUsd: number; walletUsd: number; reservedUsd: number }> {
    if (hotWallet.unlocked) {
      try {
        await sweepToNative();
      } catch {
        // Umwandlung fehlgeschlagen: dann mit dem zählen, was schon Native ist.
      }
    }
    const snap = await readDeposits();
    const reservedUsd = Math.min(snap.nativeBalance, gasReserve()) * snap.nativePriceUsd;
    const availableUsd = Math.max(0, snap.nativeBalance - gasReserve()) * snap.nativePriceUsd + snap.tokenUsd;
    return {
      availableUsd,
      walletUsd: snap.totalUsd,
      reservedUsd,
    };
  }

  async availableCashUsd(): Promise<number> {
    return (await this.snapshotUsd()).availableUsd;
  }

  private async decimals(token: Address): Promise<number> {
    const key = token.toLowerCase();
    const cached = this.decimalsCache.get(key);
    if (cached !== undefined) return cached;
    const value = await botWallet.publicClient().readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    });
    this.decimalsCache.set(key, Number(value));
    return Number(value);
  }

  private async sendAndWait(tx: { to: Address; data: Hex; value: bigint; gasLimit?: bigint }): Promise<Hex> {
    const account = botWallet.requireAccount();
    const hash = await botWallet.walletClient().sendTransaction({
      account,
      chain: botWallet.chain,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      ...(tx.gasLimit ? { gas: (tx.gasLimit * 130n) / 100n } : {}),
    });
    const receipt = await botWallet.publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error(`Transaktion fehlgeschlagen (${hash})`);
    return hash;
  }

  private async ensureAllowance(token: Address, spender: Address, amount: bigint): Promise<void> {
    const account = botWallet.requireAccount();
    const current = await botWallet.publicClient().readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, spender],
    });
    if (current >= amount) return;

    const approveHash = await botWallet.walletClient().writeContract({
      account,
      chain: botWallet.chain,
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, maxUint256],
    });
    await botWallet.publicClient().waitForTransactionReceipt({ hash: approveHash, timeout: 120_000 });
    log.info(`Freigabe erteilt für ${token} an ${spender} – ${approveHash}`);
  }

  private async buySolana(candidate: TokenCandidate, amountUsd: number, maxSlippagePct: number): Promise<BuyResult> {
    const solPrice = await nativePriceUsd('SOL');
    if (solPrice <= 0) return failBuy('SOL-Preis nicht verfügbar');

    const sellSol = amountUsd / solPrice;
    const balance = await solanaWallet.nativeBalance();
    if (balance - GAS_RESERVE_SOL < sellSol) return failBuy('Guthaben im Bot-Wallet reicht nicht');

    const lamports = BigInt(Math.floor(sellSol * LAMPORTS_PER_SOL));
    if (lamports <= 0n) return failBuy('Betrag zu klein für einen Swap');

    const result = await executeSwap(WSOL_MINT, candidate.tokenAddress, lamports, maxSlippagePct);
    const tokenAmount = Number(result.outAmount) / 10 ** result.outDecimals;
    const spentSol = Number(result.inAmount) / LAMPORTS_PER_SOL;
    const spentUsd = spentSol * solPrice;
    if (tokenAmount <= 0) return failBuy('Jupiter lieferte eine Menge von 0');

    log.trade(
      `GEKAUFT ${candidate.symbol}: ${tokenAmount.toFixed(4)} für $${spentUsd.toFixed(2)} über Jupiter – ${result.signature}`,
    );
    return {
      ok: true,
      tokenAmount,
      priceUsd: tokenAmount > 0 ? spentUsd / tokenAmount : 0,
      spentUsd,
      feeUsd: 0,
      slippagePct: 0,
      txHash: result.signature,
    };
  }

  private async sellSolana(position: Position, fraction: number, maxSlippagePct: number): Promise<SellResult> {
    const owner = solanaWallet.requireKeypair().publicKey;
    const held = await tokenAmountForMint(owner, position.tokenAddress);
    if (!held || held.amount <= 0n) return failSell('Kein Token-Guthaben zum Verkaufen');

    const sellRaw =
      fraction >= 0.999
        ? held.amount
        : (held.amount * BigInt(Math.round(clamp(fraction, 0, 1) * 10_000))) / 10_000n;
    if (sellRaw <= 0n) return failSell('Kein Token-Guthaben zum Verkaufen');

    const solPrice = await nativePriceUsd('SOL');
    const result = await executeSwap(position.tokenAddress, WSOL_MINT, sellRaw, Math.min(50, maxSlippagePct * 2));
    const solOut = Number(result.outAmount) / LAMPORTS_PER_SOL;
    const proceedsUsd = solOut * solPrice;
    const tokenAmount = Number(sellRaw) / 10 ** held.decimals;

    log.trade(
      `VERKAUFT ${position.symbol}: ${tokenAmount.toFixed(4)} für $${proceedsUsd.toFixed(2)} über Jupiter – ${result.signature}`,
    );
    return {
      ok: true,
      tokenAmount,
      priceUsd: tokenAmount > 0 ? proceedsUsd / tokenAmount : 0,
      proceedsUsd,
      feeUsd: 0,
      slippagePct: 0,
      txHash: result.signature,
    };
  }

  async buy(candidate: TokenCandidate, amountUsd: number, maxSlippagePct: number): Promise<BuyResult> {
    if (candidate.chain !== config.chain.dexscreenerId) {
      return failBuy(`Live-Handel ist nur auf ${config.chain.name} konfiguriert`);
    }

    try {
      if (isSolanaChain()) return await this.buySolana(candidate, amountUsd, maxSlippagePct);

      const ethPrice = await nativePriceUsd(config.chain.nativeSymbol);
      if (ethPrice <= 0) return failBuy('Native-Preis nicht verfügbar');

      const sellEth = amountUsd / ethPrice;
      const balance = await botWallet.nativeBalance();
      if (balance - GAS_RESERVE_ETH < sellEth) return failBuy('Guthaben im Bot-Wallet reicht nicht');

      const sellAmount = parseEther(sellEth.toFixed(18));
      const quote = await routeSwap({
        sellToken: 'native',
        buyToken: candidate.tokenAddress as Address,
        sellAmount,
        taker: botWallet.requireAccount().address,
        slippagePct: maxSlippagePct,
      });

      const decimals = await this.decimals(candidate.tokenAddress as Address);
      const tokenAmount = Number(formatUnits(quote.buyAmount, decimals));
      if (tokenAmount <= 0) return failBuy('Router lieferte eine Menge von 0');

      const hash = await this.sendAndWait(quote);

      const spentEth = Number(formatUnits(quote.value || sellAmount, 18));
      const spentUsd = spentEth * ethPrice;
      const priceUsd = tokenAmount > 0 ? spentUsd / tokenAmount : 0;

      log.trade(
        `GEKAUFT ${candidate.symbol}: ${tokenAmount.toFixed(4)} für $${spentUsd.toFixed(2)} über ${quote.source} – ${hash}`,
      );
      return {
        ok: true,
        tokenAmount,
        priceUsd,
        spentUsd,
        feeUsd: 0,
        slippagePct: 0,
        txHash: hash,
      };
    } catch (err) {
      return failBuy((err as Error).message);
    }
  }

  async sell(position: Position, fraction: number, maxSlippagePct: number): Promise<SellResult> {
    try {
      if (isSolanaChain()) return await this.sellSolana(position, fraction, maxSlippagePct);

      const account = botWallet.requireAccount();
      const token = position.tokenAddress as Address;
      const decimals = await this.decimals(token);

      const onChainBalance = await botWallet.publicClient().readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address],
      });

      const sellRaw =
        fraction >= 0.999
          ? onChainBalance
          : (onChainBalance * BigInt(Math.round(clamp(fraction, 0, 1) * 10_000))) / 10_000n;
      if (sellRaw <= 0n) return failSell('Kein Token-Guthaben zum Verkaufen');

      const ethPrice = await nativePriceUsd(config.chain.nativeSymbol);
      const quote = await routeSwap({
        sellToken: token,
        buyToken: 'native',
        sellAmount: sellRaw,
        taker: account.address,
        slippagePct: Math.min(50, maxSlippagePct * 2),
      });

      if (quote.spender) await this.ensureAllowance(token, quote.spender, sellRaw);

      const hash = await this.sendAndWait(quote);

      const ethOut = Number(formatUnits(quote.buyAmount, 18));
      const proceedsUsd = ethOut * ethPrice;
      const tokenAmount = Number(formatUnits(sellRaw, decimals));

      log.trade(
        `VERKAUFT ${position.symbol}: ${tokenAmount.toFixed(4)} für $${proceedsUsd.toFixed(2)} über ${quote.source} – ${hash}`,
      );
      return {
        ok: true,
        tokenAmount,
        priceUsd: tokenAmount > 0 ? proceedsUsd / tokenAmount : 0,
        proceedsUsd,
        feeUsd: 0,
        slippagePct: 0,
        txHash: hash,
      };
    } catch (err) {
      return failSell((err as Error).message);
    }
  }
}

export const parseTokenAmount = (amount: string, decimals: number): bigint => parseUnits(amount, decimals);
