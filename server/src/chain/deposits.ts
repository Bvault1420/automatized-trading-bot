import { erc20Abi, formatUnits, type Address } from 'viem';
import { config } from '../config.js';
import { botWallet } from './wallet.js';
import { nativePriceUsd } from './prices.js';
import { getJson } from '../util/http.js';
import { createLogger } from '../util/logger.js';
import { round, safeNumber } from '../util/num.js';
import { routeSwap } from '../trading/executor/router.js';
import type { DepositAsset } from '../types.js';

const log = createLogger('deposit');
const GAS_RESERVE_ETH = 0.00025;

export interface DepositToken {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  kind: DepositAsset['kind'];
  geckoId?: string;
  stable?: boolean;
}

/**
 * Tokens die der Bot als Einzahlung akzeptiert und selbststaendig in den
 * Native-Coin der Handelschain (auf Base: ETH) umwandelt.
 *
 * Native Bitcoin oder Solana koennen an diese EVM-Adresse nicht ankommen –
 * dafuer gibt es cbBTC (Bitcoin auf Base) bzw. man wechselt vorher bei einer
 * Boerse in ETH/USDC auf Base.
 */
const ACCEPTED: Record<string, DepositToken[]> = {
  base: [
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', decimals: 18, kind: 'wrapped' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'USDbC', name: 'USD Base Coin', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'USDT', name: 'Tether', address: '0xfde4C96c8593536E31F229EA8d03b21ddf6aB492', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'DAI', name: 'Dai', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, kind: 'stable', stable: true },
    { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, kind: 'btc', geckoId: 'bitcoin' },
  ],
  ethereum: [
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, kind: 'wrapped' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, kind: 'btc', geckoId: 'bitcoin' },
    { symbol: 'DAI', name: 'Dai', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, kind: 'stable', stable: true },
  ],
  arbitrum: [
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, kind: 'wrapped' },
    { symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'USDT', name: 'Tether', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, kind: 'stable', stable: true },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: '0x2f2a2543B76A496A7F22E7fBA8F3029077Bd0B57', decimals: 8, kind: 'btc', geckoId: 'bitcoin' },
  ],
  bsc: [
    { symbol: 'WBNB', name: 'Wrapped BNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, kind: 'wrapped' },
    { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, kind: 'stable', stable: true },
    { symbol: 'USDT', name: 'Tether', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, kind: 'stable', stable: true },
  ],
};

const GECKO_PLATFORM: Record<string, string> = {
  base: 'base',
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
  bsc: 'binance-smart-chain',
};

const WETH_ABI = [
  ...erc20Abi,
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
] as const;

export function acceptedTokens(): DepositToken[] {
  return ACCEPTED[config.chain.dexscreenerId] ?? ACCEPTED.base;
}

async function tokenPricesUsd(tokens: DepositToken[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const eth = await nativePriceUsd(config.chain.nativeSymbol);
  const btc = await nativePriceUsd('BTC');

  for (const token of tokens) {
    if (token.stable) prices.set(token.symbol, 1);
    else if (token.kind === 'wrapped') prices.set(token.symbol, eth);
    else if (token.kind === 'btc') prices.set(token.symbol, btc);
  }

  const missing = tokens.filter((t) => (prices.get(t.symbol) ?? 0) <= 0);
  if (missing.length === 0) return prices;

  const platform = GECKO_PLATFORM[config.chain.dexscreenerId];
  if (!platform) return prices;
  const res = await getJson<Record<string, { usd?: number }>>(
    `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${missing.map((t) => t.address).join(',')}&vs_currencies=usd`,
    { cacheMs: 60_000 },
  );
  for (const token of missing) {
    const row = res?.[token.address.toLowerCase()] ?? res?.[token.address];
    const price = safeNumber(row?.usd);
    if (price > 0) prices.set(token.symbol, price);
  }
  return prices;
}

export interface DepositSnapshot {
  nativeBalance: number;
  nativeBalanceUsd: number;
  nativePriceUsd: number;
  assets: DepositAsset[];
  tokenUsd: number;
  totalUsd: number;
}

export async function readDeposits(): Promise<DepositSnapshot> {
  const address = botWallet.address;
  const nativePrice = await nativePriceUsd(config.chain.nativeSymbol);
  const nativeBalance = address ? await botWallet.nativeBalance() : 0;
  const tokens = acceptedTokens();
  const prices = await tokenPricesUsd(tokens);

  const assets: DepositAsset[] = [
    {
      symbol: config.chain.nativeSymbol,
      name: config.chain.name + ' Ether',
      address: null,
      decimals: 18,
      kind: 'native',
      balance: round(nativeBalance, 8),
      balanceUsd: round(nativeBalance * nativePrice, 2),
      priceUsd: round(nativePrice, 2),
    },
  ];

  if (address) {
    const client = botWallet.publicClient();
    const balances = await Promise.all(
      tokens.map(async (token) => {
        try {
          const raw = await client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          });
          return { token, raw };
        } catch {
          return { token, raw: 0n };
        }
      }),
    );

    for (const { token, raw } of balances) {
      const balance = Number(formatUnits(raw, token.decimals));
      const price = prices.get(token.symbol) ?? 0;
      assets.push({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        kind: token.kind,
        balance: round(balance, token.decimals > 8 ? 6 : 8),
        balanceUsd: round(balance * price, 2),
        priceUsd: round(price, token.stable ? 2 : 2),
      });
    }
  } else {
    for (const token of tokens) {
      assets.push({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        kind: token.kind,
        balance: 0,
        balanceUsd: 0,
        priceUsd: round(prices.get(token.symbol) ?? (token.stable ? 1 : 0), 2),
      });
    }
  }

  const tokenUsd = assets.filter((a) => a.kind !== 'native').reduce((sum, a) => sum + a.balanceUsd, 0);
  return {
    nativeBalance,
    nativeBalanceUsd: nativeBalance * nativePrice,
    nativePriceUsd: nativePrice,
    assets,
    tokenUsd,
    totalUsd: nativeBalance * nativePrice + tokenUsd,
  };
}

const MIN_SWEEP_USD = 0.5;
let sweeping = false;

/**
 * Wandelt akzeptierte Einzahlungstokens in den Native-Coin um, mit dem der Bot
 * handelt. WETH wird entpackt statt geswappt (keine Slippage).
 */
export async function sweepToNative(): Promise<{ converted: number; messages: string[] }> {
  if (!botWallet.unlocked || sweeping) return { converted: 0, messages: [] };
  sweeping = true;
  const messages: string[] = [];
  let converted = 0;

  try {
    const snap = await readDeposits();
    if (snap.nativeBalance <= GAS_RESERVE_ETH) {
      return { converted: 0, messages: ['Für die Umwandlung fehlt etwas ETH als Gas'] };
    }

    const account = botWallet.requireAccount();
    const tokens = acceptedTokens();

    for (const asset of snap.assets) {
      if (asset.kind === 'native' || asset.balanceUsd < MIN_SWEEP_USD || !asset.address) continue;
      const meta = tokens.find((t) => t.address.toLowerCase() === asset.address!.toLowerCase());
      if (!meta) continue;

      try {
        const client = botWallet.publicClient();
        const raw = await client.readContract({
          address: meta.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account.address],
        });
        if (raw <= 0n) continue;

        if (meta.kind === 'wrapped') {
          const hash = await botWallet.walletClient().writeContract({
            account,
            chain: botWallet.chain,
            address: meta.address,
            abi: WETH_ABI,
            functionName: 'withdraw',
            args: [raw],
          });
          await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
          messages.push(`${asset.symbol} entpackt → ${config.chain.nativeSymbol} (${hash.slice(0, 10)}…)`);
          converted += 1;
          continue;
        }

        const quote = await routeSwap({
          sellToken: meta.address,
          buyToken: 'native',
          sellAmount: raw,
          taker: account.address,
          slippagePct: 2,
        });
        if (quote.spender) {
          const allowance = await client.readContract({
            address: meta.address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [account.address, quote.spender],
          });
          if (allowance < raw) {
            const approveHash = await botWallet.walletClient().writeContract({
              account,
              chain: botWallet.chain,
              address: meta.address,
              abi: erc20Abi,
              functionName: 'approve',
              args: [quote.spender, raw],
            });
            await client.waitForTransactionReceipt({ hash: approveHash, timeout: 120_000 });
          }
        }
        const hash = await botWallet.walletClient().sendTransaction({
          account,
          chain: botWallet.chain,
          to: quote.to,
          data: quote.data,
          value: quote.value,
          ...(quote.gasLimit ? { gas: (quote.gasLimit * 130n) / 100n } : {}),
        });
        await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
        messages.push(`${asset.symbol} in ${config.chain.nativeSymbol} getauscht über ${quote.source} (${hash.slice(0, 10)}…)`);
        converted += 1;
      } catch (err) {
        log.warn(`Umwandlung ${asset.symbol} fehlgeschlagen: ${(err as Error).message}`);
        messages.push(`${asset.symbol} konnte nicht umgewandelt werden: ${(err as Error).message}`);
      }
    }
  } finally {
    sweeping = false;
  }

  if (converted > 0) log.success(`${converted} Einzahlung(en) in ${config.chain.nativeSymbol} umgewandelt`);
  return { converted, messages };
}
