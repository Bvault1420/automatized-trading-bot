import { config } from '../config.js';
import { db } from '../store/db.js';
import { botWallet } from '../chain/wallet.js';
import { readDeposits } from '../chain/deposits.js';
import { getIntel } from '../intel/index.js';
import { getCandidates } from '../scanner/index.js';
import { engine } from '../trading/engine.js';
import { portfolio } from '../trading/portfolio.js';
import { LiveExecutor } from '../trading/executor/live.js';
import { recentLogs } from '../util/logger.js';
import { round } from '../util/num.js';
import type { WalletState } from '../types.js';

const liveExecutor = new LiveExecutor();

export async function walletState(): Promise<WalletState> {
  const [snap, blockers] = await Promise.all([readDeposits(), liveExecutor.blockers()]);

  return {
    ownerAddress: db.data.wallet.ownerAddress,
    botAddress: botWallet.address,
    chain: config.chain.name,
    chainId: config.chain.id,
    explorer: config.chain.explorer,
    nativeSymbol: config.chain.nativeSymbol,
    nativeBalance: round(snap.nativeBalance, 8),
    nativeBalanceUsd: round(snap.nativeBalanceUsd, 2),
    nativePriceUsd: round(snap.nativePriceUsd, 2),
    hasKeystore: botWallet.hasKeystore,
    unlocked: botWallet.unlocked,
    liveReady: blockers.length === 0,
    liveBlockers: blockers,
    assets: snap.assets,
    tokenUsd: round(snap.tokenUsd, 2),
    totalUsd: round(snap.totalUsd, 2),
  };
}

/** Vollstaendiger Zustand fuer den initialen Dashboard-Load. */
export async function fullState() {
  const mode = engine.mode;
  const liveCash = mode === 'live' ? await liveExecutor.availableCashUsd() : 0;

  return {
    status: engine.status(),
    settings: db.data.settings,
    portfolio: portfolio.state(mode, liveCash),
    positions: portfolio.openPositions(mode),
    closedPositions: portfolio.positions(mode).filter((p) => p.status === 'closed').slice(-50),
    trades: portfolio.trades(mode).slice(-100).reverse(),
    stats: portfolio.stats(mode),
    equityCurve: portfolio.equityCurve(),
    intel: getIntel(),
    candidates: getCandidates(),
    wallet: await walletState(),
    logs: recentLogs(150),
    meta: {
      chain: config.chain.name,
      chainId: config.chain.id,
      nativeSymbol: config.chain.nativeSymbol,
      explorer: config.chain.explorer,
      scanChains: db.data.settings.scanChains,
      intervals: config.intervals,
    },
  };
}
