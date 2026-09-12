import {
  ExchangeClient,
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from "@nktkas/hyperliquid";
import { formatPrice, formatSize, SymbolConverter } from "@nktkas/hyperliquid/utils";
import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem";
import { num } from "./money";

export type Network = "mainnet" | "testnet";
export type Interval =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d";

export type Market = {
  kind: "perp" | "spot";
  coin: string;
  symbol: string;
  display: string;
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  markPx: number;
  midPx: number;
  prevDayPx: number;
  dayNtlVlm: number;
  funding: number;
  openInterest: number;
  oraclePx: number;
};

export type BookLevel = { px: string; sz: string; n: number };

export function createInfo(network: Network): InfoClient {
  return new InfoClient({
    transport: new HttpTransport({ isTestnet: network === "testnet" }),
  });
}

export function createExchange(network: Network, wallet: PrivateKeyAccount): ExchangeClient {
  return new ExchangeClient({
    transport: new HttpTransport({ isTestnet: network === "testnet" }),
    wallet,
    defaultExpiresAfter: () => Date.now() + 60_000,
  });
}

export function createSubs(network: Network): {
  client: SubscriptionClient;
  transport: WebSocketTransport;
} {
  const transport = new WebSocketTransport({ isTestnet: network === "testnet" });
  return { client: new SubscriptionClient({ transport }), transport };
}

export function normalizePk(raw: string): `0x${string}` {
  const trimmed = raw.trim();
  const hex = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Private key must be 64 hex characters");
  }
  return hex as `0x${string}`;
}

export function accountFromKey(raw: string): PrivateKeyAccount {
  return privateKeyToAccount(normalizePk(raw));
}

export async function resolveMaster(
  info: InfoClient,
  signerAddress: `0x${string}`,
  fallback?: string,
): Promise<{ account: `0x${string}`; role: string }> {
  const role = await info.userRole({ user: signerAddress });
  if (role.role === "agent") {
    return { account: role.data.user, role: "agent" };
  }
  if (role.role === "subAccount") {
    return { account: role.data.master, role: "subAccount" };
  }
  if (fallback && /^0x[0-9a-fA-F]{40}$/.test(fallback)) {
    return { account: fallback.toLowerCase() as `0x${string}`, role: role.role };
  }
  return { account: signerAddress, role: role.role };
}

export async function loadMarkets(info: InfoClient, transport: HttpTransport): Promise<Market[]> {
  const converter = await SymbolConverter.create({ transport });
  const [perpPair, spotPair] = await Promise.all([
    info.metaAndAssetCtxs(),
    info.spotMetaAndAssetCtxs(),
  ]);
  const [perpMeta, perpCtxs] = perpPair;
  const [spotMeta, spotCtxs] = spotPair;
  const markets: Market[] = [];

  perpMeta.universe.forEach((asset, i) => {
    if (asset.isDelisted) return;
    const ctx = perpCtxs[i];
    const assetId = converter.getAssetId(asset.name) ?? i;
    markets.push({
      kind: "perp",
      coin: asset.name,
      symbol: asset.name,
      display: `${asset.name}-USD`,
      assetId,
      szDecimals: asset.szDecimals,
      maxLeverage: asset.maxLeverage,
      markPx: num(ctx?.markPx),
      midPx: num(ctx?.midPx ?? ctx?.markPx),
      prevDayPx: num(ctx?.prevDayPx),
      dayNtlVlm: num(ctx?.dayNtlVlm),
      funding: num(ctx?.funding),
      openInterest: num(ctx?.openInterest),
      oraclePx: num(ctx?.oraclePx),
    });
  });

  spotMeta.universe.forEach((pair, i) => {
    const ctx = spotCtxs[i];
    const base =
      spotMeta.tokens.find((t) => t.index === pair.tokens[0]) ?? spotMeta.tokens[pair.tokens[0]];
    const quote =
      spotMeta.tokens.find((t) => t.index === pair.tokens[1]) ?? spotMeta.tokens[pair.tokens[1]];
    if (!base || !quote) return;
    const human = `${base.name}/${quote.name}`;
    const coin = converter.getSpotPairId(human) ?? (i === 0 ? "PURR/USDC" : `@${pair.index ?? i}`);
    const assetId = converter.getAssetId(human) ?? 10000 + (pair.index ?? i);
    markets.push({
      kind: "spot",
      coin,
      symbol: human,
      display: human,
      assetId,
      szDecimals: base.szDecimals ?? 0,
      maxLeverage: 1,
      markPx: num(ctx?.markPx ?? ctx?.midPx),
      midPx: num(ctx?.midPx ?? ctx?.markPx),
      prevDayPx: num(ctx?.prevDayPx),
      dayNtlVlm: num(ctx?.dayNtlVlm),
      funding: 0,
      openInterest: 0,
      oraclePx: num(ctx?.markPx),
    });
  });

  return markets.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);
}

export function wirePrice(price: number | string, market: Market): string {
  return formatPrice(price, market.szDecimals, market.kind);
}

export function wireSize(size: number | string, market: Market): string {
  return formatSize(size, market.szDecimals);
}

export function marketPx(market: Market, isBuy: boolean, slipPct = 3): string {
  const mid = market.midPx || market.markPx;
  const slipped = isBuy ? mid * (1 + slipPct / 100) : mid * (1 - slipPct / 100);
  return wirePrice(slipped, market);
}

export function intervalMs(interval: Interval): number {
  const map: Record<Interval, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };
  return map[interval];
}

export function candleLookback(interval: Interval): number {
  return intervalMs(interval) * 320;
}

export function errMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
