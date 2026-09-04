import { erc20Abi, formatUnits, parseEther, parseUnits, type Address, type Hex } from 'viem';
import { config } from '../../config.js';
import { botWallet } from '../../chain/wallet.js';
import { nativePriceUsd } from '../../chain/prices.js';
import { createLogger } from '../../util/logger.js';
import { getJson } from '../../util/http.js';
import { clamp } from '../../util/num.js';
import type { Position, TokenCandidate } from '../../types.js';
import type { BuyResult, Executor, SellResult } from './types.js';

const log = createLogger('live');

/** 0x-Pseudoadresse fuer den Native-Coin der jeweiligen Chain. */
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address;
const ZEROX_API = 'https://api.0x.org/swap/allowance-holder';

/** Native-Reserve, damit immer genug fuer Gas (auch fuer den Exit) bleibt. */
const GAS_RESERVE_ETH = 0.00025;

interface ZeroExQuote {
  liquidityAvailable?: boolean;
  buyAmount?: string;
  sellAmount?: string;
  minBuyAmount?: string;
  totalNetworkFee?: string;
  issues?: {
    allowance?: { actual: string; spender: Address } | null;
    balance?: { token: Address; actual: string; expected: string } | null;
    simulationIncomplete?: boolean;
  };
  transaction?: { to: Address; data: Hex; gas?: string; gasPrice?: string; value?: string };
}

/**
 * Fuehrt echte On-Chain-Swaps aus.
 *
 * Das Routing uebernimmt die 0x-Swap-API: sie aggregiert alle relevanten DEXes
 * einer Chain, was bei Memecoins entscheidend ist, da Liquiditaet sich ueber
 * Uniswap v2/v3/v4, Aerodrome und andere Pools verteilt.
 */
export class LiveExecutor implements Executor {
  readonly mode = 'live' as const;

  private decimalsCache = new Map<string, number>();

  async blockers(): Promise<string[]> {
    const reasons: string[] = [];
    if (!botWallet.hasKeystore) reasons.push('Kein Bot-Wallet erstellt');
    else if (!botWallet.unlocked) reasons.push('Bot-Wallet ist gesperrt (Passphrase erforderlich)');
    if (!config.zeroExApiKey) reasons.push('ZEROX_API_KEY fehlt – ohne Swap-Router sind keine echten Trades möglich');

    if (botWallet.address && botWallet.unlocked) {
      const balance = await botWallet.nativeBalance();
      if (balance <= GAS_RESERVE_ETH) {
        reasons.push(`Bot-Wallet nicht ausreichend finanziert (${balance.toFixed(6)} ${config.chain.nativeSymbol})`);
      }
    }
    return reasons;
  }

  async availableCashUsd(): Promise<number> {
    const [balance, price] = await Promise.all([
      botWallet.nativeBalance(),
      nativePriceUsd(config.chain.nativeSymbol),
    ]);
    return Math.max(0, balance - GAS_RESERVE_ETH) * price;
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

  private async quote(params: Record<string, string>): Promise<ZeroExQuote | null> {
    const query = new URLSearchParams({ chainId: String(config.chain.id), ...params }).toString();
    return getJson<ZeroExQuote>(`${ZEROX_API}/quote?${query}`, {
      headers: { '0x-api-key': config.zeroExApiKey, '0x-version': 'v2' },
      timeoutMs: 20_000,
      retries: 1,
    });
  }

  private async sendAndWait(tx: NonNullable<ZeroExQuote['transaction']>): Promise<Hex> {
    const account = botWallet.requireAccount();
    const hash = await botWallet.walletClient().sendTransaction({
      account,
      chain: botWallet.chain,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value ?? '0'),
      ...(tx.gas ? { gas: (BigInt(tx.gas) * 130n) / 100n } : {}),
    });
    const receipt = await botWallet.publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error(`Transaktion fehlgeschlagen (${hash})`);
    return hash;
  }

  async buy(candidate: TokenCandidate, amountUsd: number, maxSlippagePct: number): Promise<BuyResult> {
    const fail = (error: string): BuyResult => ({
      ok: false, error, tokenAmount: 0, priceUsd: 0, spentUsd: 0, feeUsd: 0, slippagePct: 0,
    });

    if (candidate.chain !== config.chain.dexscreenerId) {
      return fail(`Live-Handel ist nur auf ${config.chain.name} konfiguriert`);
    }

    try {
      const ethPrice = await nativePriceUsd(config.chain.nativeSymbol);
      if (ethPrice <= 0) return fail('Native-Preis nicht verfügbar');

      const sellEth = amountUsd / ethPrice;
      const balance = await botWallet.nativeBalance();
      if (balance - GAS_RESERVE_ETH < sellEth) return fail('Guthaben im Bot-Wallet reicht nicht');

      const sellAmount = parseEther(sellEth.toFixed(18));
      const quote = await this.quote({
        sellToken: NATIVE,
        buyToken: candidate.tokenAddress,
        sellAmount: sellAmount.toString(),
        taker: botWallet.requireAccount().address,
        slippageBps: String(Math.round(clamp(maxSlippagePct, 0.1, 50) * 100)),
      });

      if (!quote) return fail('Keine Antwort vom Swap-Router');
      if (quote.liquidityAvailable === false) return fail('Keine ausreichende Liquidität für die Route');
      if (!quote.transaction) return fail('Router lieferte keine ausführbare Transaktion');

      const decimals = await this.decimals(candidate.tokenAddress as Address);
      const tokenAmount = Number(formatUnits(BigInt(quote.buyAmount ?? '0'), decimals));
      if (tokenAmount <= 0) return fail('Router lieferte eine Menge von 0');

      const hash = await this.sendAndWait(quote.transaction);

      const gasUsd = Number(formatUnits(BigInt(quote.totalNetworkFee ?? '0'), 18)) * ethPrice;
      const spentUsd = sellEth * ethPrice;
      const priceUsd = spentUsd / tokenAmount;

      log.trade(`GEKAUFT ${candidate.symbol}: ${tokenAmount.toFixed(4)} für $${spentUsd.toFixed(2)} – ${hash}`);
      return {
        ok: true,
        tokenAmount,
        priceUsd,
        spentUsd: spentUsd + gasUsd,
        feeUsd: gasUsd,
        slippagePct: 0,
        txHash: hash,
      };
    } catch (err) {
      return fail((err as Error).message);
    }
  }

  async sell(position: Position, fraction: number, maxSlippagePct: number): Promise<SellResult> {
    const fail = (error: string): SellResult => ({
      ok: false, error, tokenAmount: 0, priceUsd: 0, proceedsUsd: 0, feeUsd: 0, slippagePct: 0,
    });

    try {
      const account = botWallet.requireAccount();
      const token = position.tokenAddress as Address;
      const decimals = await this.decimals(token);

      // Immer den echten On-Chain-Bestand verkaufen: bei Token mit Transfer-Steuer
      // weicht der tatsaechliche Saldo von der erwarteten Menge ab.
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
      if (sellRaw <= 0n) return fail('Kein Token-Guthaben zum Verkaufen');

      const ethPrice = await nativePriceUsd(config.chain.nativeSymbol);

      const quote = await this.quote({
        sellToken: token,
        buyToken: NATIVE,
        sellAmount: sellRaw.toString(),
        taker: account.address,
        slippageBps: String(Math.round(clamp(maxSlippagePct * 2, 1, 50) * 100)),
      });

      if (!quote) return fail('Keine Antwort vom Swap-Router');
      if (quote.liquidityAvailable === false) return fail('Keine Liquidität für den Verkauf');

      // Freigabe fuer den AllowanceHolder-Contract, falls noch nicht erteilt.
      const allowance = quote.issues?.allowance;
      if (allowance && allowance.spender) {
        const approveHash = await botWallet.walletClient().writeContract({
          account,
          chain: botWallet.chain,
          address: token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [allowance.spender, sellRaw],
        });
        await botWallet.publicClient().waitForTransactionReceipt({ hash: approveHash, timeout: 120_000 });
        log.info(`Freigabe erteilt für ${position.symbol} – ${approveHash}`);
      }

      // Nach der Freigabe neu quoten, damit die Route aktuell ist.
      const finalQuote = allowance
        ? await this.quote({
            sellToken: token,
            buyToken: NATIVE,
            sellAmount: sellRaw.toString(),
            taker: account.address,
            slippageBps: String(Math.round(clamp(maxSlippagePct * 2, 1, 50) * 100)),
          })
        : quote;

      if (!finalQuote?.transaction) return fail('Router lieferte keine ausführbare Transaktion');

      const hash = await this.sendAndWait(finalQuote.transaction);

      const ethOut = Number(formatUnits(BigInt(finalQuote.buyAmount ?? '0'), 18));
      const gasUsd = Number(formatUnits(BigInt(finalQuote.totalNetworkFee ?? '0'), 18)) * ethPrice;
      const proceedsUsd = ethOut * ethPrice;
      const tokenAmount = Number(formatUnits(sellRaw, decimals));

      log.trade(
        `VERKAUFT ${position.symbol}: ${tokenAmount.toFixed(4)} für $${proceedsUsd.toFixed(2)} – ${hash}`,
      );
      return {
        ok: true,
        tokenAmount,
        priceUsd: tokenAmount > 0 ? proceedsUsd / tokenAmount : 0,
        proceedsUsd: Math.max(0, proceedsUsd - gasUsd),
        feeUsd: gasUsd,
        slippagePct: 0,
        txHash: hash,
      };
    } catch (err) {
      return fail((err as Error).message);
    }
  }

  /** Hilfsfunktion fuer die UI: wie viel Native-Coin haelt das Bot-Wallet. */
  async tokenBalance(token: Address): Promise<number> {
    const account = botWallet.address;
    if (!account) return 0;
    const [raw, decimals] = await Promise.all([
      botWallet.publicClient().readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      }),
      this.decimals(token),
    ]);
    return Number(formatUnits(raw, decimals));
  }
}

export const parseTokenAmount = (amount: string, decimals: number): bigint => parseUnits(amount, decimals);
