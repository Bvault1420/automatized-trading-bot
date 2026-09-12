# Pixelol — Hyperliquid Terminal

A full browser trading terminal that talks **only** to the Hyperliquid API (`/info`, `/exchange`, WebSocket). No backend, no custodial keys.

## Run locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173**

## Connect

1. On [app.hyperliquid.xyz](https://app.hyperliquid.xyz) go to **Settings → API**.
2. Create or copy an **API wallet** (agent). It can trade; it cannot withdraw.
3. In Pixelol click **Connect API wallet** and paste the agent **private key**.
4. The app calls `userRole` and auto-fills your master account address.

The key stays in `sessionStorage` of this browser tab and is used only to sign Hyperliquid exchange actions.

## What it uses

| Area | API |
| --- | --- |
| Markets | `metaAndAssetCtxs`, `spotMetaAndAssetCtxs`, `allMids` |
| Book / tape / candles | `l2Book`, `recentTrades`, `candleSnapshot` + WS |
| Account | `clearinghouseState`, `spotClearinghouseState`, `frontendOpenOrders`, `userFills`, `extraAgents` |
| More | portfolio, fees, funding, rate limit, referral, staking, vaults, TWAP history |
| Trading | `order` (market/limit/stop + TP/SL), `cancel`, `updateLeverage`, `twapOrder` |
| Other | `usdClassTransfer`, `scheduleCancel` (dead-man switch) |

Mainnet: `https://api.hyperliquid.xyz` · Testnet: `https://api.hyperliquid-testnet.xyz`
