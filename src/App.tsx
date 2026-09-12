import { useState } from "react";
import { ChartPane } from "./components/ChartPane";
import { BottomDock, ConnectModal, MarketList, OrderBook, Tape, TradeTicket } from "./components/panels";
import { changePct, fmtFunding, fmtPct, fmtPx, fmtUsd, shortAddr, signedClass } from "./lib/money";
import { TerminalProvider, useTerminal } from "./state";

function Shell() {
  const t = useTerminal();
  const [open, setOpen] = useState(false);
  const ch = t.market ? changePct(t.market.markPx, t.market.prevDayPx) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>Pixelol</h1>
            <small>Hyperliquid terminal</small>
          </div>
        </div>
        <div className="stats">
          <div className="stat">
            <span>Mark</span>
            <b>{fmtPx(t.market?.markPx)}</b>
          </div>
          <div className="stat">
            <span>24h</span>
            <b className={signedClass(ch)}>{fmtPct(ch)}</b>
          </div>
          <div className="stat">
            <span>Funding</span>
            <b>{t.market?.kind === "perp" ? fmtFunding(t.market.funding) : "spot"}</b>
          </div>
          <div className="stat">
            <span>Volume</span>
            <b>{fmtUsd(t.market?.dayNtlVlm)}</b>
          </div>
          <div className="stat">
            <span>Account</span>
            <b>{t.connected ? fmtUsd(t.accountValue) : "—"}</b>
          </div>
        </div>
        <div className="top-actions">
          <button className={t.network === "mainnet" ? "pill active" : "pill"} onClick={() => t.setNetwork("mainnet")}>
            Mainnet
          </button>
          <button className={t.network === "testnet" ? "pill active" : "pill"} onClick={() => t.setNetwork("testnet")}>
            Testnet
          </button>
          {t.connected ? (
            <>
              <span className="addr">{shortAddr(t.account ?? undefined)}</span>
              <button className="btn" onClick={t.disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={() => setOpen(true)}>
              Connect API wallet
            </button>
          )}
        </div>
      </header>
      <main className="workspace">
        <MarketList />
        <ChartPane />
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid #223042" }}>
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <OrderBook />
          </div>
          <Tape />
        </div>
        <TradeTicket />
      </main>
      <BottomDock />
      <ConnectModal open={open} onClose={() => setOpen(false)} />
      {t.toast && <div className={`toast ${t.toast.kind}`}>{t.toast.text}</div>}
    </div>
  );
}

export default function App() {
  return (
    <TerminalProvider>
      <Shell />
    </TerminalProvider>
  );
}
