import { useMemo, useState } from "react";
import {
  changePct,
  clsx,
  fmtFunding,
  fmtPct,
  fmtPx,
  fmtQty,
  fmtTime,
  fmtUsd,
  num,
  shortAddr,
  signedClass,
} from "../lib/money";
import { useTerminal, type BottomTab } from "../state";

export function MarketList() {
  const { markets, market, selectMarket, marketFilter, setMarketFilter, search, setSearch } =
    useTerminal();
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return markets.filter((m) => {
      if (marketFilter !== "all" && m.kind !== marketFilter) return false;
      if (!q) return true;
      return m.display.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q);
    });
  }, [marketFilter, markets, search]);

  return (
    <section className="panel">
      <div className="panel-h">
        <span>Markets</span>
        <div className="tabs">
          {(["perp", "spot", "all"] as const).map((f) => (
            <button key={f} className={f === marketFilter ? "tab on" : "tab"} onClick={() => setMarketFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <input className="search" placeholder="Search BTC, HYPE…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="markets">
        {rows.map((m) => {
          const ch = changePct(m.markPx, m.prevDayPx);
          return (
            <button
              key={`${m.kind}-${m.coin}`}
              className={clsx("market-row", market?.coin === m.coin && "on")}
              onClick={() => selectMarket(m.coin)}
            >
              <div>
                <b>{m.symbol}</b>
                <i>{m.kind}</i>
              </div>
              <div className="mono">{fmtPx(m.markPx)}</div>
              <div className={clsx("mono", signedClass(ch))}>{fmtPct(ch)}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function OrderBook() {
  const { book, market } = useTerminal();
  const asks = [...book.asks.slice(0, 12)].reverse();
  const bids = book.bids.slice(0, 12);
  const max = Math.max(
    ...asks.map((l) => num(l.sz)),
    ...bids.map((l) => num(l.sz)),
    1,
  );
  const bestAsk = num(book.asks[0]?.px);
  const bestBid = num(book.bids[0]?.px);
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;

  return (
    <section className="panel">
      <div className="panel-h">
        <span>Order book</span>
        <span className="tiny">{market?.display}</span>
      </div>
      <div className="book-wrap">
        {asks.map((l) => (
          <div className="book-row down" key={`a-${l.px}`}>
            <div className="book-bar" style={{ width: `${(num(l.sz) / max) * 100}%`, background: "#ff5d6c", right: 0, left: "auto" }} />
            <span>{fmtPx(l.px)}</span>
            <span>{fmtQty(l.sz)}</span>
            <span>{l.n}</span>
          </div>
        ))}
        <div className="spread">
          {fmtPx(market?.midPx)} · spread {fmtPx(spread)}
        </div>
        {bids.map((l) => (
          <div className="book-row up" key={`b-${l.px}`}>
            <div className="book-bar" style={{ width: `${(num(l.sz) / max) * 100}%`, background: "#3ee089" }} />
            <span>{fmtPx(l.px)}</span>
            <span>{fmtQty(l.sz)}</span>
            <span>{l.n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Tape() {
  const { trades } = useTerminal();
  return (
    <section className="panel" style={{ maxHeight: 220 }}>
      <div className="panel-h">
        <span>Trades</span>
      </div>
      <div className="tape">
        {trades.slice(0, 18).map((t, i) => (
          <div className={clsx("book-row", t.side === "B" ? "up" : "down")} key={`${t.time}-${i}`}>
            <span>{fmtPx(t.px)}</span>
            <span>{fmtQty(t.sz)}</span>
            <span>{new Date(t.time).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TradeTicket() {
  const { market, connected, busy, placeOrder, placeTwap } = useTerminal();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit" | "stop" | "twap">("limit");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [triggerPx, setTriggerPx] = useState("");
  const [tif, setTif] = useState<"Gtc" | "Ioc" | "Alo">("Gtc");
  const [leverage, setLeverage] = useState(5);
  const [isolated, setIsolated] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [randomize, setRandomize] = useState(true);

  const isBuy = side === "buy";
  const notional = num(size) * num(price || market?.midPx);

  async function submit() {
    if (type === "twap") {
      await placeTwap({
        isBuy,
        size,
        minutes: Number(minutes) || 30,
        reduceOnly,
        randomize,
      });
      return;
    }
    await placeOrder({
      isBuy,
      type: type === "stop" ? "stop" : type,
      size,
      price: price || undefined,
      triggerPx: triggerPx || undefined,
      tif,
      reduceOnly,
      leverage: market?.kind === "perp" ? leverage : undefined,
      isolated,
      tp: tp || undefined,
      sl: sl || undefined,
    });
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <span>Trade</span>
        <span className="tiny">{connected ? "API wallet ready" : "read-only"}</span>
      </div>
      <div className="ticket">
        <div className="seg">
          <button className={side === "buy" ? "on" : ""} onClick={() => setSide("buy")}>
            Buy / Long
          </button>
          <button className={side === "sell" ? "on" : ""} onClick={() => setSide("sell")}>
            Sell / Short
          </button>
        </div>
        <div className="seg">
          {(["market", "limit", "stop", "twap"] as const).map((t) => (
            <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        {market?.kind === "perp" && (
          <div className="row2">
            <div className="field">
              <label>Leverage · max {market.maxLeverage}x</label>
              <input
                type="number"
                min={1}
                max={market.maxLeverage}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
              />
            </div>
            <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}>
              <input type="checkbox" checked={isolated} onChange={(e) => setIsolated(e.target.checked)} />
              Isolated
            </label>
          </div>
        )}
        {type === "limit" && (
          <div className="field">
            <label>Limit price</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={fmtPx(market?.midPx)} />
          </div>
        )}
        {type === "stop" && (
          <div className="field">
            <label>Trigger</label>
            <input value={triggerPx} onChange={(e) => setTriggerPx(e.target.value)} placeholder="Stop price" />
          </div>
        )}
        <div className="field">
          <label>Size ({market?.symbol ?? "coin"})</label>
          <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="0.0" />
        </div>
        {type === "limit" && (
          <div className="field">
            <label>Time in force</label>
            <select value={tif} onChange={(e) => setTif(e.target.value as typeof tif)}>
              <option>Gtc</option>
              <option>Ioc</option>
              <option>Alo</option>
            </select>
          </div>
        )}
        {type === "twap" && (
          <div className="row2">
            <div className="field">
              <label>Minutes (5–1440)</label>
              <input value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}>
              <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} />
              Randomize
            </label>
          </div>
        )}
        {type !== "twap" && (
          <div className="row2">
            <div className="field">
              <label>Take profit</label>
              <input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="optional" />
            </div>
            <div className="field">
              <label>Stop loss</label>
              <input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="optional" />
            </div>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} />
          Reduce only
        </label>
        <div className="tiny">Est. notional {fmtUsd(notional)} · mid {fmtPx(market?.midPx)}</div>
        <div className="actions">
          <button className={clsx("btn", isBuy ? "buy" : "sell")} disabled={!connected || busy || !size} onClick={() => void submit()}>
            {isBuy ? "Buy" : "Sell"} {market?.symbol}
          </button>
        </div>
      </div>
    </section>
  );
}

const TABS: Array<{ id: BottomTab; label: string }> = [
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "fills", label: "Fills" },
  { id: "balances", label: "Balances" },
  { id: "twap", label: "TWAP / History" },
  { id: "history", label: "Funding" },
  { id: "portfolio", label: "Portfolio" },
  { id: "account", label: "API / Account" },
];

export function BottomDock() {
  const t = useTerminal();
  return (
    <section className="bottom">
      <div className="bottom-h">
        {TABS.map((tab) => (
          <button key={tab.id} className={t.bottomTab === tab.id ? "tab on" : "tab"} onClick={() => t.setBottomTab(tab.id)}>
            {tab.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {t.bottomTab === "orders" && (
          <button className="btn ghost" disabled={!t.orders.length} onClick={() => void t.cancelAll()}>
            Cancel all
          </button>
        )}
        <button className="btn ghost" onClick={() => void t.refreshAccount()} disabled={!t.connected}>
          Refresh
        </button>
      </div>
      {t.bottomTab === "positions" && <PositionsTable />}
      {t.bottomTab === "orders" && <OrdersTable />}
      {t.bottomTab === "fills" && <FillsTable />}
      {t.bottomTab === "balances" && <Balances />}
      {t.bottomTab === "twap" && <HistoryPane />}
      {t.bottomTab === "history" && <FundingPane />}
      {t.bottomTab === "portfolio" && <PortfolioPane />}
      {t.bottomTab === "account" && <AccountPane />}
    </section>
  );
}

function PositionsTable() {
  const { positions, closePosition, busy } = useTerminal();
  if (!positions.length) return <div className="empty">No open positions</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Coin</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Value</th>
            <th>uPnL</th>
            <th>ROE</th>
            <th>Lev</th>
            <th>Liq</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.coin}>
              <td>{p.coin}</td>
              <td className={signedClass(p.szi)}>{fmtQty(p.szi)}</td>
              <td>{fmtPx(p.entryPx)}</td>
              <td>{fmtUsd(p.positionValue)}</td>
              <td className={signedClass(p.unrealizedPnl)}>{fmtUsd(p.unrealizedPnl)}</td>
              <td className={signedClass(p.returnOnEquity)}>{fmtPct(num(p.returnOnEquity) * 100)}</td>
              <td>
                {p.leverage.value}x {p.leverage.type}
              </td>
              <td>{p.liquidationPx ? fmtPx(p.liquidationPx) : "—"}</td>
              <td>
                <button className="btn" disabled={busy} onClick={() => void closePosition(p.coin)}>
                  Close
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTable() {
  const { orders, cancelOrder, busy } = useTerminal();
  if (!orders.length) return <div className="empty">No open orders</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Coin</th>
            <th>Side</th>
            <th>Type</th>
            <th>Price</th>
            <th>Size</th>
            <th>Orig</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.oid}>
              <td>{fmtTime(o.timestamp)}</td>
              <td>{o.coin}</td>
              <td className={o.side === "B" ? "up" : "down"}>{o.side === "B" ? "Buy" : "Sell"}</td>
              <td>
                {o.orderType}
                {o.reduceOnly ? " RO" : ""}
              </td>
              <td>{fmtPx(o.isTrigger ? o.triggerPx : o.limitPx)}</td>
              <td>{fmtQty(o.sz)}</td>
              <td>{fmtQty(o.origSz)}</td>
              <td>
                <button className="btn" disabled={busy} onClick={() => void cancelOrder(o.coin, o.oid)}>
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FillsTable() {
  const { fills } = useTerminal();
  if (!fills.length) return <div className="empty">No fills yet</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Coin</th>
            <th>Dir</th>
            <th>Px</th>
            <th>Sz</th>
            <th>Closed PnL</th>
            <th>Fee</th>
          </tr>
        </thead>
        <tbody>
          {fills.map((f, i) => (
            <tr key={`${f.oid}-${f.time}-${i}`}>
              <td>{fmtTime(f.time)}</td>
              <td>{f.coin}</td>
              <td className={f.side === "B" ? "up" : "down"}>{f.dir}</td>
              <td>{fmtPx(f.px)}</td>
              <td>{fmtQty(f.sz)}</td>
              <td className={signedClass(f.closedPnl)}>{fmtUsd(f.closedPnl)}</td>
              <td>{f.fee}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Balances() {
  const { spotBalances, accountValue, withdrawable, marginUsed, transferUsd, connected } = useTerminal();
  const [amt, setAmt] = useState("10");
  return (
    <div>
      <div className="cards">
        <div className="card">
          <span>Perp equity</span>
          <b>{fmtUsd(accountValue)}</b>
        </div>
        <div className="card">
          <span>Withdrawable</span>
          <b>{fmtUsd(withdrawable)}</b>
        </div>
        <div className="card">
          <span>Margin used</span>
          <b>{fmtUsd(marginUsed)}</b>
        </div>
        <div className="card">
          <span>Spot → Perp / Perp → Spot</span>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 80 }} />
            <button className="btn" disabled={!connected} onClick={() => void transferUsd(amt, true)}>
              To perp
            </button>
            <button className="btn" disabled={!connected} onClick={() => void transferUsd(amt, false)}>
              To spot
            </button>
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Total</th>
              <th>Hold</th>
              <th>Entry notional</th>
            </tr>
          </thead>
          <tbody>
            {spotBalances.map((b) => (
              <tr key={b.coin}>
                <td>{b.coin}</td>
                <td>{fmtQty(b.total)}</td>
                <td>{fmtQty(b.hold)}</td>
                <td>{fmtUsd(b.entryNtl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!spotBalances.length && <div className="empty">No spot balances</div>}
      </div>
    </div>
  );
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function HistoryPane() {
  const extras = useTerminal().extras;
  const twap = asArray(extras.twap);
  const hist = asArray(extras.hist);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {twap.slice(0, 20).map((row, i) => (
            <tr key={`t-${i}`}>
              <td>TWAP</td>
              <td>{JSON.stringify(row)}</td>
            </tr>
          ))}
          {hist.slice(0, 20).map((row, i) => (
            <tr key={`h-${i}`}>
              <td>Order</td>
              <td>{JSON.stringify(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!twap.length && !hist.length && <div className="empty">No TWAP or historical orders</div>}
    </div>
  );
}

function FundingPane() {
  const funding = asArray(useTerminal().extras.funding);
  if (!funding.length) return <div className="empty">No funding payments in the last 14 days</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Record</th>
          </tr>
        </thead>
        <tbody>
          {funding.slice(0, 40).map((row, i) => (
            <tr key={i}>
              <td>{JSON.stringify(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PortfolioPane() {
  const { extras, market } = useTerminal();
  return (
    <div className="cards">
      <div className="card">
        <span>Selected funding</span>
        <b>{fmtFunding(market?.funding)}</b>
      </div>
      <div className="card">
        <span>Open interest</span>
        <b>{fmtQty(market?.openInterest)}</b>
      </div>
      <div className="card">
        <span>24h volume</span>
        <b>{fmtUsd(market?.dayNtlVlm)}</b>
      </div>
      <div className="card">
        <span>Oracle</span>
        <b>{fmtPx(market?.oraclePx)}</b>
      </div>
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <span>Portfolio / fees / rate limit / referral / staking / vaults</span>
        <pre className="tiny" style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>
          {JSON.stringify(
            {
              portfolio: extras.portfolio,
              fees: extras.fees,
              rate: extras.rate,
              referral: extras.referral,
              staking: extras.staking,
              vaults: extras.vaults,
            },
            null,
            2,
          )}
        </pre>
      </div>
    </div>
  );
}

function AccountPane() {
  const { agents, signer, account, role, scheduleCancel, connected } = useTerminal();
  return (
    <div>
      <div className="cards">
        <div className="card">
          <span>Account</span>
          <b className="addr">{account ?? "—"}</b>
        </div>
        <div className="card">
          <span>API wallet</span>
          <b className="addr">{signer ?? "—"}</b>
        </div>
        <div className="card">
          <span>Role</span>
          <b>{role}</b>
        </div>
        <div className="card">
          <span>Dead-man switch</span>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="btn" disabled={!connected} onClick={() => void scheduleCancel(60_000)}>
              Arm 1m
            </button>
            <button className="btn" disabled={!connected} onClick={() => void scheduleCancel(null)}>
              Clear
            </button>
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>API wallet name</th>
              <th>Address</th>
              <th>Valid until</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.address}>
                <td>{a.name}</td>
                <td className="addr">{a.address}</td>
                <td>{fmtTime(a.validUntil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!agents.length && <div className="empty">No extra API wallets on this account</div>}
      </div>
    </div>
  );
}

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, connecting, network } = useTerminal();
  const [pk, setPk] = useState("");
  const [override, setOverride] = useState("");
  if (!open) return null;

  return (
    <div className="modal-bg" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void connect(pk, override || undefined).then(onClose);
        }}
      >
        <h2>Connect API wallet</h2>
        <p>
          Use the Hyperliquid API wallet (agent) from Settings → API — the same kind of key as in the
          screenshot. It can trade for your account and cannot withdraw. Signing stays in this browser.
        </p>
        <div className="warn">Never paste your main wallet key. Agent keys only. Network: {network}.</div>
        <div className="field">
          <label>API wallet private key</label>
          <input
            type="password"
            autoComplete="off"
            value={pk}
            onChange={(e) => setPk(e.target.value)}
            placeholder="0x…"
          />
        </div>
        <div className="field">
          <label>Master account (optional — auto-detected from agent)</label>
          <input value={override} onChange={(e) => setOverride(e.target.value)} placeholder="0x…" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={connecting || !pk}>
            {connecting ? "Connecting…" : "Authorize"}
          </button>
        </div>
      </form>
    </div>
  );
}
