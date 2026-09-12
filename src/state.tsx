import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HttpTransport, type ExchangeClient, type InfoClient } from "@nktkas/hyperliquid";
import type { PrivateKeyAccount } from "viem";
import {
  accountFromKey,
  candleLookback,
  createExchange,
  createInfo,
  createSubs,
  errMsg,
  loadMarkets,
  marketPx,
  resolveMaster,
  wirePrice,
  wireSize,
  type BookLevel,
  type Interval,
  type Market,
  type Network,
} from "./lib/hl";
import { num } from "./lib/money";

export type Toast = { id: number; kind: "ok" | "err" | "info"; text: string };
export type BottomTab =
  | "positions"
  | "orders"
  | "fills"
  | "balances"
  | "twap"
  | "history"
  | "portfolio"
  | "account";

type Position = {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  leverage: { type: string; value: number };
};

type OrderRow = {
  coin: string;
  oid: number;
  side: string;
  limitPx: string;
  sz: string;
  origSz: string;
  timestamp: number;
  orderType: string;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPx?: string;
};

type FillRow = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  closedPnl: string;
  fee: string;
  dir: string;
  oid: number;
};

type AgentRow = { address: `0x${string}`; name: string; validUntil: number };

type TerminalCtx = {
  network: Network;
  setNetwork: (n: Network) => void;
  info: InfoClient;
  exchange: ExchangeClient | null;
  markets: Market[];
  market: Market | null;
  selectMarket: (coin: string) => void;
  marketFilter: "all" | "perp" | "spot";
  setMarketFilter: (v: "all" | "perp" | "spot") => void;
  search: string;
  setSearch: (v: string) => void;
  interval: Interval;
  setInterval: (v: Interval) => void;
  book: { bids: BookLevel[]; asks: BookLevel[] };
  trades: Array<{ px: string; sz: string; side: string; time: number }>;
  connected: boolean;
  connecting: boolean;
  account: `0x${string}` | null;
  signer: `0x${string}` | null;
  role: string;
  connect: (pk: string, accountOverride?: string) => Promise<void>;
  disconnect: () => void;
  accountValue: number;
  withdrawable: number;
  marginUsed: number;
  positions: Position[];
  orders: OrderRow[];
  fills: FillRow[];
  spotBalances: Array<{ coin: string; hold: string; total: string; entryNtl: string }>;
  agents: AgentRow[];
  extras: Record<string, unknown>;
  loadingAccount: boolean;
  refreshAccount: () => Promise<void>;
  toast: Toast | null;
  pushToast: (kind: Toast["kind"], text: string) => void;
  placeOrder: (input: {
    isBuy: boolean;
    type: "market" | "limit" | "stop";
    size: string;
    price?: string;
    triggerPx?: string;
    tpsl?: "tp" | "sl";
    tif?: "Gtc" | "Ioc" | "Alo";
    reduceOnly: boolean;
    leverage?: number;
    isolated?: boolean;
    tp?: string;
    sl?: string;
  }) => Promise<void>;
  cancelOrder: (coin: string, oid: number) => Promise<void>;
  cancelAll: () => Promise<void>;
  closePosition: (coin: string) => Promise<void>;
  setLeverage: (coin: string, leverage: number, isolated: boolean) => Promise<void>;
  placeTwap: (input: {
    isBuy: boolean;
    size: string;
    minutes: number;
    reduceOnly: boolean;
    randomize: boolean;
  }) => Promise<void>;
  transferUsd: (amount: string, toPerp: boolean) => Promise<void>;
  scheduleCancel: (msFromNow: number | null) => Promise<void>;
  bottomTab: BottomTab;
  setBottomTab: (t: BottomTab) => void;
  busy: boolean;
};

const Ctx = createContext<TerminalCtx | null>(null);

export function useTerminal(): TerminalCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTerminal outside provider");
  return ctx;
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<Network>("mainnet");
  const [info, setInfo] = useState(() => createInfo("mainnet"));
  const [exchange, setExchange] = useState<ExchangeClient | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [activeCoin, setActiveCoin] = useState("BTC");
  const [marketFilter, setMarketFilter] = useState<"all" | "perp" | "spot">("perp");
  const [search, setSearch] = useState("");
  const [interval, setInterval] = useState<Interval>("15m");
  const [book, setBook] = useState<{ bids: BookLevel[]; asks: BookLevel[] }>({
    bids: [],
    asks: [],
  });
  const [trades, setTrades] = useState<Array<{ px: string; sz: string; side: string; time: number }>>(
    [],
  );
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [signer, setSigner] = useState<`0x${string}` | null>(null);
  const [role, setRole] = useState("disconnected");
  const [accountValue, setAccountValue] = useState(0);
  const [withdrawable, setWithdrawable] = useState(0);
  const [marginUsed, setMarginUsed] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fills, setFills] = useState<FillRow[]>([]);
  const [spotBalances, setSpotBalances] = useState<
    Array<{ coin: string; hold: string; total: string; entryNtl: string }>
  >([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("positions");
  const [busy, setBusy] = useState(false);
  const walletRef = useRef<PrivateKeyAccount | null>(null);
  const toastId = useRef(0);

  const market = useMemo(
    () => markets.find((m) => m.coin === activeCoin) ?? markets[0] ?? null,
    [markets, activeCoin],
  );

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToast({ id, kind, text });
    window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 4200);
  }, []);

  const loadMarketData = useCallback(
    async (nextInfo: InfoClient, net: Network) => {
      const transport = new HttpTransport({ isTestnet: net === "testnet" });
      const list = await loadMarkets(nextInfo, transport);
      setMarkets(list);
      setActiveCoin((cur) => (list.some((m) => m.coin === cur) ? cur : list[0]?.coin ?? "BTC"));
    },
    [],
  );

  useEffect(() => {
    const next = createInfo(network);
    setInfo(next);
    setMarkets([]);
    void loadMarketData(next, network).catch((e) => pushToast("err", errMsg(e)));
  }, [network, loadMarketData, pushToast]);

  useEffect(() => {
    if (!market) return;
    let dead = false;
    const { client, transport } = createSubs(network);
    const subs: Array<{ unsubscribe: () => Promise<void> }> = [];

    void (async () => {
      try {
        const snap = await info.l2Book({ coin: market.coin });
        if (!dead && snap) setBook({ bids: snap.levels[0], asks: snap.levels[1] });
        const recents = await info.recentTrades({ coin: market.coin });
        if (!dead) {
          setTrades(
            recents.slice(0, 40).map((t) => ({
              px: t.px,
              sz: t.sz,
              side: t.side,
              time: t.time,
            })),
          );
        }
        subs.push(
          await client.l2Book({ coin: market.coin }, (data) => {
            setBook({ bids: data.levels[0], asks: data.levels[1] });
          }),
        );
        subs.push(
          await client.trades({ coin: market.coin }, (data) => {
            setTrades((prev) =>
              [...data, ...prev]
                .slice(0, 50)
                .map((t) => ({ px: t.px, sz: t.sz, side: t.side, time: t.time })),
            );
          }),
        );
        subs.push(
          await client.allMids((data) => {
            setMarkets((prev) =>
              prev.map((m) => {
                const mid = data.mids[m.coin] ?? data.mids[m.symbol];
                if (!mid) return m;
                const midPx = num(mid);
                return { ...m, midPx, markPx: midPx };
              }),
            );
          }),
        );
      } catch (e) {
        if (!dead) pushToast("err", errMsg(e));
      }
    })();

    return () => {
      dead = true;
      void Promise.all(subs.map((s) => s.unsubscribe().catch(() => undefined))).finally(() => {
        void transport.close().catch(() => undefined);
      });
    };
  }, [market?.coin, network, info, pushToast]);

  const refreshAccount = useCallback(async () => {
    if (!account) return;
    setLoadingAccount(true);
    try {
      const now = Date.now();
      const [
        perp,
        spot,
        open,
        userFills,
        extraAgents,
        portfolio,
        fees,
        rate,
        userRole,
        funding,
        hist,
        twap,
        vaults,
        referral,
        staking,
      ] = await Promise.all([
        info.clearinghouseState({ user: account }),
        info.spotClearinghouseState({ user: account }),
        info.frontendOpenOrders({ user: account }),
        info.userFills({ user: account }),
        info.extraAgents({ user: account }).catch(() => []),
        info.portfolio({ user: account }).catch(() => null),
        info.userFees({ user: account }).catch(() => null),
        info.userRateLimit({ user: account }).catch(() => null),
        info.userRole({ user: account }).catch(() => null),
        info
          .userFunding({ user: account, startTime: now - 14 * 86_400_000 })
          .catch(() => []),
        info.historicalOrders({ user: account }).catch(() => []),
        info.twapHistory({ user: account }).catch(() => []),
        info.userVaultEquities({ user: account }).catch(() => []),
        info.referral({ user: account }).catch(() => null),
        info.delegatorSummary({ user: account }).catch(() => null),
      ]);

      setAccountValue(num(perp.marginSummary.accountValue));
      setWithdrawable(num(perp.withdrawable));
      setMarginUsed(num(perp.marginSummary.totalMarginUsed));
      setPositions(
        perp.assetPositions
          .map((row) => row.position)
          .filter((p) => num(p.szi) !== 0)
          .map((p) => ({
            coin: p.coin,
            szi: p.szi,
            entryPx: p.entryPx,
            positionValue: p.positionValue,
            unrealizedPnl: p.unrealizedPnl,
            returnOnEquity: p.returnOnEquity,
            liquidationPx: p.liquidationPx,
            marginUsed: p.marginUsed,
            leverage: p.leverage,
          })),
      );
      setOrders(
        open.map((o) => ({
          coin: o.coin,
          oid: o.oid,
          side: o.side,
          limitPx: o.limitPx,
          sz: o.sz,
          origSz: o.origSz,
          timestamp: o.timestamp,
          orderType: o.orderType,
          reduceOnly: o.reduceOnly,
          isTrigger: o.isTrigger,
          triggerPx: o.triggerPx,
        })),
      );
      setFills(
        userFills.slice(0, 80).map((f) => ({
          coin: f.coin,
          px: f.px,
          sz: f.sz,
          side: f.side,
          time: f.time,
          closedPnl: f.closedPnl,
          fee: f.fee,
          dir: f.dir,
          oid: f.oid,
        })),
      );
      setSpotBalances(
        (spot.balances ?? []).filter((b) => num(b.total) !== 0).map((b) => ({
          coin: b.coin,
          hold: b.hold,
          total: b.total,
          entryNtl: b.entryNtl,
        })),
      );
      setAgents(extraAgents);
      setExtras({
        portfolio,
        fees,
        rate,
        userRole,
        funding,
        hist,
        twap,
        vaults,
        referral,
        staking,
        withdrawable: perp.withdrawable,
        cross: perp.crossMarginSummary,
      });
    } catch (e) {
      pushToast("err", errMsg(e));
    } finally {
      setLoadingAccount(false);
    }
  }, [account, info, pushToast]);

  useEffect(() => {
    if (!account) return;
    void refreshAccount();
    const id = window.setInterval(() => void refreshAccount(), 12_000);
    return () => window.clearInterval(id);
  }, [account, refreshAccount]);

  useEffect(() => {
    if (!account) return;
    const { client, transport } = createSubs(network);
    let sub: { unsubscribe: () => Promise<void> } | undefined;
    void client
      .webData2({ user: account }, () => {
        void refreshAccount();
      })
      .then((s) => {
        sub = s;
      })
      .catch(() => undefined);
    return () => {
      void sub?.unsubscribe().catch(() => undefined);
      void transport.close().catch(() => undefined);
    };
  }, [account, network, refreshAccount]);

  const setNetwork = useCallback((n: Network) => {
    setNetworkState(n);
    setExchange(null);
    setConnected(false);
    setAccount(null);
    setSigner(null);
    setRole("disconnected");
    walletRef.current = null;
    sessionStorage.removeItem("pxl.session");
  }, []);

  const connect = useCallback(
    async (pk: string, accountOverride?: string) => {
      setConnecting(true);
      try {
        const wallet = accountFromKey(pk);
        walletRef.current = wallet;
        const resolved = await resolveMaster(info, wallet.address, accountOverride);
        const ex = createExchange(network, wallet);
        setExchange(ex);
        setSigner(wallet.address);
        setAccount(resolved.account);
        setRole(resolved.role);
        setConnected(true);
        sessionStorage.setItem(
          "pxl.session",
          JSON.stringify({
            network,
            pk,
            account: resolved.account,
          }),
        );
        pushToast("ok", `Connected as ${resolved.role} · ${resolved.account.slice(0, 8)}…`);
      } catch (e) {
        pushToast("err", errMsg(e));
        throw e;
      } finally {
        setConnecting(false);
      }
    },
    [info, network, pushToast],
  );

  const disconnect = useCallback(() => {
    setExchange(null);
    setConnected(false);
    setAccount(null);
    setSigner(null);
    setRole("disconnected");
    setPositions([]);
    setOrders([]);
    setFills([]);
    setAgents([]);
    walletRef.current = null;
    sessionStorage.removeItem("pxl.session");
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("pxl.session");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { network: Network; pk: string; account?: string };
      if (parsed.network !== network) return;
      void connect(parsed.pk, parsed.account).catch(() => undefined);
    } catch {
      sessionStorage.removeItem("pxl.session");
    }
    // only restore once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireExchange = useCallback(() => {
    if (!exchange) throw new Error("Connect an API wallet first");
    return exchange;
  }, [exchange]);

  const assetIdFor = useCallback(
    (coin: string) => {
      const found = markets.find((m) => m.coin === coin || m.symbol === coin);
      if (!found) throw new Error(`Unknown market ${coin}`);
      return found;
    },
    [markets],
  );

  const placeOrder = useCallback(
    async (input: {
      isBuy: boolean;
      type: "market" | "limit" | "stop";
      size: string;
      price?: string;
      triggerPx?: string;
      tpsl?: "tp" | "sl";
      tif?: "Gtc" | "Ioc" | "Alo";
      reduceOnly: boolean;
      leverage?: number;
      isolated?: boolean;
      tp?: string;
      sl?: string;
    }) => {
      if (!market) throw new Error("No market selected");
      const client = requireExchange();
      setBusy(true);
      try {
        if (market.kind === "perp" && input.leverage) {
          await client.updateLeverage({
            asset: market.assetId,
            isCross: !input.isolated,
            leverage: input.leverage,
          });
        }
        const sz = wireSize(input.size, market);
        const orders: Array<{
          a: number;
          b: boolean;
          p: string;
          s: string;
          r: boolean;
          t:
            | { limit: { tif: "Gtc" | "Ioc" | "Alo" } }
            | { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } };
        }> = [];

        if (input.type === "market") {
          orders.push({
            a: market.assetId,
            b: input.isBuy,
            p: marketPx(market, input.isBuy, 4),
            s: sz,
            r: input.reduceOnly,
            t: { limit: { tif: "Ioc" } },
          });
        } else if (input.type === "limit") {
          if (!input.price) throw new Error("Limit price required");
          orders.push({
            a: market.assetId,
            b: input.isBuy,
            p: wirePrice(input.price, market),
            s: sz,
            r: input.reduceOnly,
            t: { limit: { tif: input.tif ?? "Gtc" } },
          });
        } else {
          if (!input.triggerPx) throw new Error("Trigger price required");
          orders.push({
            a: market.assetId,
            b: input.isBuy,
            p: wirePrice(input.price || input.triggerPx, market),
            s: sz,
            r: input.reduceOnly,
            t: {
              trigger: {
                isMarket: true,
                triggerPx: wirePrice(input.triggerPx, market),
                tpsl: input.tpsl ?? "sl",
              },
            },
          });
        }

        if (input.tp) {
          orders.push({
            a: market.assetId,
            b: !input.isBuy,
            p: wirePrice(input.tp, market),
            s: sz,
            r: true,
            t: {
              trigger: { isMarket: true, triggerPx: wirePrice(input.tp, market), tpsl: "tp" },
            },
          });
        }
        if (input.sl) {
          orders.push({
            a: market.assetId,
            b: !input.isBuy,
            p: wirePrice(input.sl, market),
            s: sz,
            r: true,
            t: {
              trigger: { isMarket: true, triggerPx: wirePrice(input.sl, market), tpsl: "sl" },
            },
          });
        }

        const grouping = input.tp || input.sl ? "normalTpsl" : "na";
        const res = await client.order({ orders, grouping });
        const first = res.response.data.statuses[0];
        if (first && typeof first === "object" && "error" in first) {
          pushToast("err", String(first.error));
        } else if (first && typeof first === "object" && "resting" in first) {
          pushToast("ok", `Resting oid ${first.resting.oid}`);
        } else if (first && typeof first === "object" && "filled" in first) {
          pushToast("ok", `Filled ${first.filled.totalSz} @ ${first.filled.avgPx}`);
        } else {
          pushToast("ok", "Order submitted");
        }
        await refreshAccount();
      } catch (e) {
        pushToast("err", errMsg(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [market, pushToast, refreshAccount, requireExchange],
  );

  const cancelOrder = useCallback(
    async (coin: string, oid: number) => {
      const client = requireExchange();
      const m = assetIdFor(coin);
      setBusy(true);
      try {
        await client.cancel({ cancels: [{ a: m.assetId, o: oid }] });
        pushToast("ok", `Canceled ${oid}`);
        await refreshAccount();
      } catch (e) {
        pushToast("err", errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [assetIdFor, pushToast, refreshAccount, requireExchange],
  );

  const cancelAll = useCallback(async () => {
    const client = requireExchange();
    if (!orders.length) return;
    setBusy(true);
    try {
      await client.cancel({
        cancels: orders.map((o) => ({ a: assetIdFor(o.coin).assetId, o: o.oid })),
      });
      pushToast("ok", "Canceled open orders");
      await refreshAccount();
    } catch (e) {
      pushToast("err", errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [assetIdFor, orders, pushToast, refreshAccount, requireExchange]);

  const closePosition = useCallback(
    async (coin: string) => {
      const pos = positions.find((p) => p.coin === coin);
      if (!pos) return;
      const m = assetIdFor(coin);
      const isBuy = num(pos.szi) < 0;
      await placeOrder({
        isBuy,
        type: "market",
        size: String(Math.abs(num(pos.szi))),
        reduceOnly: true,
      });
      void m;
    },
    [assetIdFor, placeOrder, positions],
  );

  const setLeverage = useCallback(
    async (coin: string, leverage: number, isolated: boolean) => {
      const client = requireExchange();
      const m = assetIdFor(coin);
      await client.updateLeverage({ asset: m.assetId, isCross: !isolated, leverage });
      pushToast("ok", `Leverage ${leverage}x ${isolated ? "isolated" : "cross"}`);
    },
    [assetIdFor, pushToast, requireExchange],
  );

  const placeTwap = useCallback(
    async (input: {
      isBuy: boolean;
      size: string;
      minutes: number;
      reduceOnly: boolean;
      randomize: boolean;
    }) => {
      if (!market) throw new Error("No market");
      const client = requireExchange();
      setBusy(true);
      try {
        const res = await client.twapOrder({
          twap: {
            a: market.assetId,
            b: input.isBuy,
            s: wireSize(input.size, market),
            r: input.reduceOnly,
            m: input.minutes,
            t: input.randomize,
          },
        });
        const status = res.response.data.status as { running?: { twapId: number }; error?: string };
        if (status.running) pushToast("ok", `TWAP ${status.running.twapId}`);
        else pushToast("err", status.error ?? "TWAP rejected");
        await refreshAccount();
      } catch (e) {
        pushToast("err", errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [market, pushToast, refreshAccount, requireExchange],
  );

  const transferUsd = useCallback(
    async (amount: string, toPerp: boolean) => {
      const client = requireExchange();
      setBusy(true);
      try {
        await client.usdClassTransfer({ amount, toPerp });
        pushToast("ok", `Moved ${amount} USDC ${toPerp ? "to perps" : "to spot"}`);
        await refreshAccount();
      } catch (e) {
        pushToast("err", errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [pushToast, refreshAccount, requireExchange],
  );

  const scheduleCancelFn = useCallback(
    async (msFromNow: number | null) => {
      const client = requireExchange();
      setBusy(true);
      try {
        if (msFromNow == null) await client.scheduleCancel();
        else await client.scheduleCancel({ time: Date.now() + msFromNow });
        pushToast("ok", msFromNow == null ? "Dead-man switch cleared" : "Dead-man switch armed");
      } catch (e) {
        pushToast("err", errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [pushToast, requireExchange],
  );

  const value: TerminalCtx = {
    network,
    setNetwork,
    info,
    exchange,
    markets,
    market,
    selectMarket: setActiveCoin,
    marketFilter,
    setMarketFilter,
    search,
    setSearch,
    interval,
    setInterval,
    book,
    trades,
    connected,
    connecting,
    account,
    signer,
    role,
    connect,
    disconnect,
    accountValue,
    withdrawable,
    marginUsed,
    positions,
    orders,
    fills,
    spotBalances,
    agents,
    extras,
    loadingAccount,
    refreshAccount,
    toast,
    pushToast,
    placeOrder,
    cancelOrder,
    cancelAll,
    closePosition,
    setLeverage,
    placeTwap,
    transferUsd,
    scheduleCancel: scheduleCancelFn,
    bottomTab,
    setBottomTab,
    busy,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { candleLookback };
