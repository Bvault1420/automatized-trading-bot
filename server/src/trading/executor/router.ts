import { type Address, type Hex } from 'viem';
import { config } from '../../config.js';
import { getJson } from '../../util/http.js';
import { createLogger } from '../../util/logger.js';
import { clamp } from '../../util/num.js';

const log = createLogger('router');

/** 0x/Kyber-Konvention fuer den Native-Coin. */
export const NATIVE_EEE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address;
/** LiFi-Konvention fuer denselben Native-Coin. */
const NATIVE_ZERO = '0x0000000000000000000000000000000000000000' as Address;

const KYBER_SLUG: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  base: 'base',
};

export interface RoutedSwap {
  to: Address;
  data: Hex;
  value: bigint;
  buyAmount: bigint;
  sellAmount: bigint;
  /** ERC-20-Spender, der vor dem Swap eine Freigabe braucht (null bei Native-Verkauf). */
  spender: Address | null;
  gasLimit?: bigint;
  source: string;
}

export interface RouteInput {
  sellToken: Address | 'native';
  buyToken: Address | 'native';
  sellAmount: bigint;
  taker: Address;
  slippagePct: number;
}

function asNativeOrAddress(token: Address | 'native', native: Address): Address {
  return token === 'native' ? native : token;
}

function slippageBps(pct: number): number {
  return Math.round(clamp(pct, 0.1, 50) * 100);
}

interface KyberRouteResponse {
  code: number;
  message?: string;
  data?: {
    routeSummary: Record<string, unknown>;
    routerAddress: Address;
  };
}

interface KyberBuildResponse {
  code: number;
  message?: string;
  data?: {
    data: Hex;
    routerAddress: Address;
    transactionValue: string;
    amountIn: string;
    amountOut: string;
    gas: string;
  };
}

async function quoteKyber(input: RouteInput): Promise<RoutedSwap> {
  const slug = KYBER_SLUG[config.chain.dexscreenerId];
  if (!slug) throw new Error(`KyberSwap unterstützt ${config.chain.name} nicht`);

  const tokenIn = asNativeOrAddress(input.sellToken, NATIVE_EEE);
  const tokenOut = asNativeOrAddress(input.buyToken, NATIVE_EEE);
  const headers = { 'x-client-id': 'aletheia-trading-bot', accept: 'application/json' };

  const routed = await getJson<KyberRouteResponse>(
    `https://aggregator-api.kyberswap.com/${slug}/api/v1/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${input.sellAmount.toString()}`,
    { timeoutMs: 12_000, retries: 1, headers },
  );
  if (!routed || routed.code !== 0 || !routed.data?.routeSummary) {
    throw new Error(routed?.message || 'KyberSwap hat keine Route gefunden');
  }

  const built = await getJson<KyberBuildResponse>(
    `https://aggregator-api.kyberswap.com/${slug}/api/v1/route/build`,
    {
      method: 'POST',
      timeoutMs: 15_000,
      retries: 1,
      headers,
      body: {
        routeSummary: routed.data.routeSummary,
        sender: input.taker,
        recipient: input.taker,
        slippageTolerance: slippageBps(input.slippagePct),
      },
    },
  );
  if (!built || built.code !== 0 || !built.data?.data || !built.data.routerAddress) {
    throw new Error(built?.message || 'KyberSwap konnte die Transaktion nicht bauen');
  }

  return {
    to: built.data.routerAddress,
    data: built.data.data,
    value: BigInt(built.data.transactionValue || '0'),
    buyAmount: BigInt(built.data.amountOut || '0'),
    sellAmount: BigInt(built.data.amountIn || input.sellAmount.toString()),
    spender: input.sellToken === 'native' ? null : built.data.routerAddress,
    gasLimit: built.data.gas ? BigInt(built.data.gas) : undefined,
    source: 'KyberSwap',
  };
}

interface LifiQuote {
  estimate?: { toAmount?: string; approvalAddress?: Address };
  transactionRequest?: { to: Address; data: Hex; value?: string; gasLimit?: string };
}

async function quoteLifi(input: RouteInput): Promise<RoutedSwap> {
  const fromToken = input.sellToken === 'native' ? NATIVE_ZERO : input.sellToken;
  const toToken = input.buyToken === 'native' ? NATIVE_ZERO : input.buyToken;
  const query = new URLSearchParams({
    fromChain: String(config.chain.id),
    toChain: String(config.chain.id),
    fromToken,
    toToken,
    fromAmount: input.sellAmount.toString(),
    fromAddress: input.taker,
    slippage: String(clamp(input.slippagePct / 100, 0.001, 0.5)),
  });

  const quote = await getJson<LifiQuote>(`https://li.quest/v1/quote?${query}`, {
    timeoutMs: 15_000,
    retries: 1,
  });
  if (!quote?.transactionRequest?.to || !quote.transactionRequest.data) {
    throw new Error('LiFi hat keine ausführbare Route geliefert');
  }

  return {
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: BigInt(quote.transactionRequest.value || '0'),
    buyAmount: BigInt(quote.estimate?.toAmount || '0'),
    sellAmount: input.sellAmount,
    spender: input.sellToken === 'native' ? null : (quote.estimate?.approvalAddress ?? null),
    gasLimit: quote.transactionRequest.gasLimit ? BigInt(quote.transactionRequest.gasLimit) : undefined,
    source: 'LiFi',
  };
}

interface ZeroExQuote {
  liquidityAvailable?: boolean;
  buyAmount?: string;
  sellAmount?: string;
  issues?: { allowance?: { spender: Address } | null };
  transaction?: { to: Address; data: Hex; value?: string; gas?: string };
}

async function quoteZeroEx(input: RouteInput): Promise<RoutedSwap> {
  const query = new URLSearchParams({
    chainId: String(config.chain.id),
    sellToken: asNativeOrAddress(input.sellToken, NATIVE_EEE),
    buyToken: asNativeOrAddress(input.buyToken, NATIVE_EEE),
    sellAmount: input.sellAmount.toString(),
    taker: input.taker,
    slippageBps: String(slippageBps(input.slippagePct)),
  });
  const quote = await getJson<ZeroExQuote>(`https://api.0x.org/swap/allowance-holder/quote?${query}`, {
    headers: { '0x-api-key': config.zeroExApiKey, '0x-version': 'v2' },
    timeoutMs: 15_000,
    retries: 1,
  });
  if (!quote?.transaction) throw new Error('0x hat keine ausführbare Route geliefert');
  if (quote.liquidityAvailable === false) throw new Error('0x: keine Liquidität');

  return {
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: BigInt(quote.transaction.value || '0'),
    buyAmount: BigInt(quote.buyAmount || '0'),
    sellAmount: BigInt(quote.sellAmount || input.sellAmount.toString()),
    spender: input.sellToken === 'native' ? null : (quote.issues?.allowance?.spender ?? null),
    gasLimit: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined,
    source: '0x',
  };
}

/**
 * Findet eine On-Chain-Swap-Route. KyberSwap und LiFi brauchen keinen API-Key;
 * 0x wird nur genutzt, wenn einer konfiguriert ist.
 */
export async function routeSwap(input: RouteInput): Promise<RoutedSwap> {
  const attempts: { name: string; run: () => Promise<RoutedSwap> }[] = [
    { name: 'KyberSwap', run: () => quoteKyber(input) },
    { name: 'LiFi', run: () => quoteLifi(input) },
  ];
  if (config.zeroExApiKey) attempts.push({ name: '0x', run: () => quoteZeroEx(input) });

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const quote = await attempt.run();
      if (quote.buyAmount <= 0n) throw new Error('Menge 0');
      log.info(`Route über ${quote.source}`);
      return quote;
    } catch (err) {
      const message = (err as Error).message;
      log.debug(`${attempt.name}: ${message}`);
      errors.push(`${attempt.name}: ${message}`);
    }
  }
  throw new Error(`Kein Swap-Router hat eine Route gefunden (${errors.join(' · ')})`);
}
