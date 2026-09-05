import { randomUUID } from 'node:crypto';
import { db } from '../store/db.js';
import { bus } from '../util/bus.js';
import { clamp, round } from '../util/num.js';
import type {
  EquityPoint,
  PortfolioState,
  Position,
  PositionFill,
  Stats,
  Trade,
  TradingMode,
} from '../types.js';
import { estimateSellCostUsd, isRecoveryAccount } from './fees.js';

const MAX_EQUITY_POINTS = 2000;

function bucket(mode: TradingMode) {
  return mode === 'paper' ? db.data.paper : db.data.live;
}

export const portfolio = {
  positions(mode?: TradingMode): Position[] {
    const all = db.data.positions;
    return mode ? all.filter((p) => p.mode === mode) : all;
  },

  openPositions(mode: TradingMode): Position[] {
    return db.data.positions.filter((p) => p.mode === mode && p.status !== 'closed');
  },

  findPosition(id: string): Position | undefined {
    return db.data.positions.find((p) => p.id === id);
  },

  hasOpenPosition(mode: TradingMode, chain: string, tokenAddress: string): boolean {
    const key = tokenAddress.toLowerCase();
    return db.data.positions.some(
      (p) => p.mode === mode && p.status !== 'closed' && p.chain === chain && p.tokenAddress.toLowerCase() === key,
    );
  },

  trades(mode?: TradingMode): Trade[] {
    const all = db.data.trades;
    return mode ? all.filter((t) => t.mode === mode) : all;
  },

  /** Verfuegbares Bargeld. Im Live-Modus: Wallet minus Gas-Reserve. */
  cash(mode: TradingMode, liveCashUsd = 0): number {
    return mode === 'paper' ? db.data.paper.cashUsd : liveCashUsd;
  },

  exposure(mode: TradingMode): number {
    return this.openPositions(mode).reduce((sum, p) => sum + p.tokenAmount * p.lastPrice, 0);
  },

  state(
    mode: TradingMode,
    liveCashUsd = 0,
    extras: { walletUsd?: number; reservedUsd?: number; nativePriceUsd?: number } = {},
  ): PortfolioState {
    const b = bucket(mode);
    const cash = this.cash(mode, liveCashUsd);
    const exposure = this.exposure(mode);
    const reservedUsd = extras.reservedUsd ?? 0;
    const walletUsd = extras.walletUsd ?? (mode === 'paper' ? cash : cash + reservedUsd);
    const equity = walletUsd + exposure;
    const open = this.openPositions(mode);
    const unrealized = open.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0);
    const recordedFees = this.positions(mode).reduce((sum, p) => sum + p.feesUsd, 0);
    const start = b.startEquityUsd > 0 ? b.startEquityUsd : equity;
    const peak = Math.max(b.peakEquityUsd, equity);
    const dayStart = b.dayStartEquityUsd > 0 ? b.dayStartEquityUsd : start;
    const truePnl = equity - start;
    const markPnl = b.realizedPnlUsd + unrealized;
    // Fees, die nicht auf der Position stehen (Priority, ATA-Miete): Differenz Mark vs. Wallet.
    const impliedFees = Math.max(0, markPnl - truePnl);
    const feesUsd = Math.max(recordedFees, impliedFees);
    const estimatedExitCostUsd = open.reduce((sum, p) => {
      const micro = p.costUsd > 0 && p.costUsd <= 8;
      return (
        sum +
        estimateSellCostUsd({
          notionalUsd: p.tokenAmount * p.lastPrice,
          nativePriceUsd: extras.nativePriceUsd ?? 100,
          micro,
        }).costUsd
      );
    }, 0);

    return {
      mode,
      cashUsd: round(cash, 4),
      walletUsd: round(walletUsd, 4),
      reservedUsd: round(reservedUsd, 4),
      exposureUsd: round(exposure, 4),
      equityUsd: round(equity, 4),
      startEquityUsd: round(start, 4),
      dayStartEquityUsd: round(dayStart, 4),
      peakEquityUsd: round(peak, 4),
      realizedPnlUsd: round(b.realizedPnlUsd, 4),
      unrealizedPnlUsd: round(unrealized, 4),
      totalPnlPct: start > 0 ? round(((equity - start) / start) * 100, 2) : 0,
      dayPnlPct: dayStart > 0 ? round(((equity - dayStart) / dayStart) * 100, 2) : 0,
      drawdownPct: peak > 0 ? round(((peak - equity) / peak) * 100, 2) : 0,
      feesUsd: round(feesUsd, 4),
      estimatedExitCostUsd: round(estimatedExitCostUsd, 4),
    };
  },

  /** Aktualisiert Tages-/Hochwassermarken und schreibt einen Equity-Punkt. */
  markEquity(
    mode: TradingMode,
    liveCashUsd = 0,
    extras: { walletUsd?: number; reservedUsd?: number; nativePriceUsd?: number } = {},
  ): PortfolioState {
    const state = this.state(mode, liveCashUsd, extras);
    db.update((draft) => {
      const b = mode === 'paper' ? draft.paper : draft.live;
      if (b.startEquityUsd <= 0 && state.equityUsd > 0) b.startEquityUsd = state.equityUsd;
      if (b.dayStartEquityUsd <= 0 && state.equityUsd > 0) b.dayStartEquityUsd = state.equityUsd;

      // Nach Crash: Peak/Tagesbasis auf Restkapital setzen, damit Drawdown-Halt nicht dauerhaft blockiert.
      if (
        isRecoveryAccount(state.equityUsd, state.startEquityUsd) &&
        state.drawdownPct >= 40 &&
        b.peakEquityUsd > state.equityUsd * 1.05
      ) {
        b.peakEquityUsd = state.equityUsd;
        b.dayStartEquityUsd = state.equityUsd;
        b.dayStartedAt = Date.now();
      }

      if (state.equityUsd > b.peakEquityUsd) b.peakEquityUsd = state.equityUsd;

      if (Date.now() - b.dayStartedAt > 24 * 3_600_000) {
        b.dayStartedAt = Date.now();
        b.dayStartEquityUsd = state.equityUsd;
      }

      const last = [...draft.equityCurve].reverse().find((p) => p.mode === mode);
      const point: EquityPoint = {
        ts: Date.now(),
        equity: state.equityUsd,
        cash: state.cashUsd,
        exposure: state.exposureUsd,
        mode,
      };
      if (!last || point.ts - last.ts > 60_000 || Math.abs(point.equity - last.equity) > 0.0005) {
        draft.equityCurve.push(point);
        if (draft.equityCurve.length > MAX_EQUITY_POINTS) {
          draft.equityCurve.splice(0, draft.equityCurve.length - MAX_EQUITY_POINTS);
        }
      }
    });

    const updated = this.state(mode, liveCashUsd, extras);
    bus.emitEvent('portfolio', updated);
    return updated;
  },

  equityCurve(mode?: TradingMode): EquityPoint[] {
    const all = db.data.equityCurve;
    return mode ? all.filter((p) => p.mode === mode) : all;
  },

  openPosition(input: {
    mode: TradingMode;
    chain: string;
    pairAddress: string;
    tokenAddress: string;
    symbol: string;
    name: string;
    url: string;
    entryPrice: number;
    tokenAmount: number;
    costUsd: number;
    feeUsd: number;
    entryScore: number;
    entryReason: string;
    stopLossPct: number;
    takeProfitPct: number;
    txHash?: string;
  }): Position {
    const fill: PositionFill = {
      ts: Date.now(),
      kind: 'buy',
      amountUsd: input.costUsd,
      tokenAmount: input.tokenAmount,
      priceUsd: input.entryPrice,
      feeUsd: input.feeUsd,
      reason: input.entryReason,
      txHash: input.txHash,
    };

    const position: Position = {
      id: randomUUID(),
      chain: input.chain,
      pairAddress: input.pairAddress,
      tokenAddress: input.tokenAddress,
      symbol: input.symbol,
      name: input.name,
      url: input.url,
      status: 'open',
      mode: input.mode,
      openedAt: Date.now(),
      entryPrice: input.entryPrice,
      entryScore: input.entryScore,
      entryReason: input.entryReason,
      tokenAmount: input.tokenAmount,
      initialTokenAmount: input.tokenAmount,
      costUsd: input.costUsd,
      realizedUsd: 0,
      feesUsd: input.feeUsd,
      lastPrice: input.entryPrice,
      peakPrice: input.entryPrice,
      stopLossPrice: input.entryPrice * (1 - input.stopLossPct / 100),
      takeProfitPrice: input.entryPrice * (1 + input.takeProfitPct / 100),
      trailingArmed: false,
      partialsTaken: 0,
      unrealizedPnlUsd: 0,
      pnlUsd: -input.feeUsd,
      pnlPct: 0,
      fills: [fill],
    };

    db.update((draft) => {
      draft.positions.push(position);
      if (input.mode === 'paper') draft.paper.cashUsd -= input.costUsd;
    });

    bus.emitEvent('positions', this.openPositions(input.mode));
    return position;
  },

  updatePrice(positionId: string, price: number): Position | undefined {
    let updated: Position | undefined;
    db.update((draft) => {
      const p = draft.positions.find((x) => x.id === positionId);
      if (!p || price <= 0) return;
      p.lastPrice = price;
      if (price > p.peakPrice) p.peakPrice = price;
      const value = p.tokenAmount * price;
      const invested = p.costUsd * (p.tokenAmount / Math.max(p.initialTokenAmount, 1e-18));
      p.unrealizedPnlUsd = value - invested;
      p.pnlUsd = p.realizedUsd + value - p.costUsd;
      p.pnlPct = p.entryPrice > 0 ? ((price - p.entryPrice) / p.entryPrice) * 100 : 0;
      updated = p;
    });
    return updated;
  },

  /** Verkauft (teilweise) und schliesst die Position, wenn nichts mehr uebrig ist. */
  applySell(input: {
    positionId: string;
    tokenAmount: number;
    priceUsd: number;
    proceedsUsd: number;
    feeUsd: number;
    reason: string;
    txHash?: string;
  }): { position: Position; trade: Trade | null } | null {
    const before = this.findPosition(input.positionId);
    if (!before) return null;

    let trade: Trade | null = null;

    db.update((draft) => {
      const p = draft.positions.find((x) => x.id === input.positionId);
      if (!p) return;

      const soldAmount = Math.min(input.tokenAmount, p.tokenAmount);
      p.tokenAmount = Math.max(0, p.tokenAmount - soldAmount);
      p.realizedUsd += input.proceedsUsd;
      p.feesUsd += input.feeUsd;
      p.lastPrice = input.priceUsd;
      p.fills.push({
        ts: Date.now(),
        kind: 'sell',
        amountUsd: input.proceedsUsd,
        tokenAmount: soldAmount,
        priceUsd: input.priceUsd,
        feeUsd: input.feeUsd,
        reason: input.reason,
        txHash: input.txHash,
      });

      if (p.mode === 'paper') draft.paper.cashUsd += input.proceedsUsd;

      const remainingValue = p.tokenAmount * input.priceUsd;
      p.unrealizedPnlUsd = remainingValue - p.costUsd * (p.tokenAmount / Math.max(p.initialTokenAmount, 1e-18));
      p.pnlUsd = p.realizedUsd + remainingValue - p.costUsd;
      p.pnlPct = p.entryPrice > 0 ? ((input.priceUsd - p.entryPrice) / p.entryPrice) * 100 : 0;

      // Reststaub (< 1% der Ursprungsmenge) gilt als geschlossen.
      const dust = p.tokenAmount / Math.max(p.initialTokenAmount, 1e-18) < 0.01;
      if (dust) {
        p.status = 'closed';
        p.closedAt = Date.now();
        p.exitReason = input.reason;
        p.tokenAmount = 0;
        p.unrealizedPnlUsd = 0;
        p.pnlUsd = p.realizedUsd - p.costUsd;
        p.pnlPct = p.costUsd > 0 ? (p.pnlUsd / p.costUsd) * 100 : 0;

        const b = p.mode === 'paper' ? draft.paper : draft.live;
        b.realizedPnlUsd += p.pnlUsd;

        trade = {
          id: p.id,
          symbol: p.symbol,
          chain: p.chain,
          tokenAddress: p.tokenAddress,
          url: p.url,
          mode: p.mode,
          openedAt: p.openedAt,
          closedAt: p.closedAt,
          holdSeconds: Math.round((p.closedAt - p.openedAt) / 1000),
          entryPrice: p.entryPrice,
          exitPrice: input.priceUsd,
          costUsd: round(p.costUsd, 6),
          proceedsUsd: round(p.realizedUsd, 6),
          feesUsd: round(p.feesUsd, 6),
          pnlUsd: round(p.pnlUsd, 6),
          pnlPct: round(p.pnlPct, 2),
          entryScore: p.entryScore,
          entryReason: p.entryReason,
          exitReason: input.reason,
        };
        draft.trades.push(trade);
        if (draft.trades.length > 1000) draft.trades.splice(0, draft.trades.length - 1000);
      } else {
        p.partialsTaken += 1;
      }
    });

    const after = this.findPosition(input.positionId)!;
    bus.emitEvent('positions', this.openPositions(after.mode));
    if (trade) bus.emitEvent('trade', trade);
    return { position: after, trade };
  },

  markClosing(positionId: string): void {
    db.update((draft) => {
      const p = draft.positions.find((x) => x.id === positionId);
      if (p && p.status === 'open') p.status = 'closing';
    });
  },

  unmarkClosing(positionId: string): void {
    db.update((draft) => {
      const p = draft.positions.find((x) => x.id === positionId);
      if (p && p.status === 'closing') p.status = 'open';
    });
  },

  stats(mode?: TradingMode): Stats {
    const trades = this.trades(mode);
    if (trades.length === 0) {
      return {
        totalTrades: 0, wins: 0, losses: 0, winRatePct: 0, avgWinPct: 0, avgLossPct: 0,
        profitFactor: 0, bestTradePct: 0, worstTradePct: 0, avgHoldSeconds: 0, expectancyPct: 0,
      };
    }
    const wins = trades.filter((t) => t.pnlUsd > 0);
    const losses = trades.filter((t) => t.pnlUsd <= 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnlUsd, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
    const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
    const avgLossPct = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
    const winRate = wins.length / trades.length;

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRatePct: round(winRate * 100, 1),
      avgWinPct: round(avgWinPct, 2),
      avgLossPct: round(avgLossPct, 2),
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : grossProfit > 0 ? 99 : 0,
      bestTradePct: round(Math.max(...trades.map((t) => t.pnlPct)), 2),
      worstTradePct: round(Math.min(...trades.map((t) => t.pnlPct)), 2),
      avgHoldSeconds: Math.round(trades.reduce((s, t) => s + t.holdSeconds, 0) / trades.length),
      expectancyPct: round(winRate * avgWinPct + (1 - winRate) * avgLossPct, 2),
    };
  },

  consecutiveLosses(mode: TradingMode): number {
    const trades = this.trades(mode);
    let count = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].pnlUsd <= 0) count++;
      else break;
    }
    return count;
  },

  setPaperCash(amount: number): void {
    db.update((draft) => {
      draft.paper.cashUsd = clamp(amount, 0, 1_000_000);
      draft.paper.startEquityUsd = draft.paper.cashUsd;
      draft.paper.dayStartEquityUsd = draft.paper.cashUsd;
      draft.paper.peakEquityUsd = draft.paper.cashUsd;
      draft.paper.realizedPnlUsd = 0;
      draft.paper.dayStartedAt = Date.now();
      draft.positions = draft.positions.filter((p) => p.mode !== 'paper');
      draft.trades = draft.trades.filter((t) => t.mode !== 'paper');
      if (!draft.positions.some((p) => p.mode === 'live' && p.status !== 'closed')) {
        draft.equityCurve = [];
      }
    });
  },
};
