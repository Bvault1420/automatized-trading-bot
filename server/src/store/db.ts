import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../config.js';
import type { BotSettings, EquityPoint, Position, Trade } from '../types.js';

export interface DbShape {
  version: number;
  settings: BotSettings;
  wallet: {
    ownerAddress: string | null;
    /** verschluesselter Keystore des Bot-Wallets */
    keystore: string | null;
    botAddress: string | null;
  };
  paper: {
    cashUsd: number;
    startEquityUsd: number;
    dayStartEquityUsd: number;
    dayStartedAt: number;
    peakEquityUsd: number;
    realizedPnlUsd: number;
  };
  live: {
    startEquityUsd: number;
    dayStartEquityUsd: number;
    dayStartedAt: number;
    peakEquityUsd: number;
    realizedPnlUsd: number;
  };
  positions: Position[];
  trades: Trade[];
  equityCurve: EquityPoint[];
  /** Token-Adressen die nach einem Exit kurzzeitig gesperrt sind. */
  cooldowns: Record<string, number>;
  blacklist: string[];
}

function defaultDb(): DbShape {
  const d = config.defaults;
  return {
    version: 1,
    settings: {
      tradingMode: d.tradingMode,
      maxOpenPositions: d.maxOpenPositions,
      riskPerTradePct: d.riskPerTradePct,
      stopLossPct: d.stopLossPct,
      takeProfitPct: d.takeProfitPct,
      trailingStopPct: d.trailingStopPct,
      maxHoldMinutes: d.maxHoldMinutes,
      dailyLossLimitPct: d.dailyLossLimitPct,
      maxDrawdownPct: d.maxDrawdownPct,
      minLiquidityUsd: d.minLiquidityUsd,
      maxSlippagePct: d.maxSlippagePct,
      minEntryScore: d.minEntryScore,
      scanChains: [...config.scanChains],
    },
    wallet: { ownerAddress: null, keystore: null, botAddress: null },
    paper: {
      cashUsd: d.paperStartBalance,
      startEquityUsd: d.paperStartBalance,
      dayStartEquityUsd: d.paperStartBalance,
      dayStartedAt: Date.now(),
      peakEquityUsd: d.paperStartBalance,
      realizedPnlUsd: 0,
    },
    live: {
      startEquityUsd: 0,
      dayStartEquityUsd: 0,
      dayStartedAt: Date.now(),
      peakEquityUsd: 0,
      realizedPnlUsd: 0,
    },
    positions: [],
    trades: [],
    equityCurve: [],
    cooldowns: {},
    blacklist: [],
  };
}

const FILE = path.join(DATA_DIR, 'bot.json');

let state: DbShape = load();
let writeScheduled = false;

function load(): DbShape {
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as DbShape;
      const base = defaultDb();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...parsed.settings },
        wallet: { ...base.wallet, ...parsed.wallet },
        paper: { ...base.paper, ...parsed.paper },
        live: { ...base.live, ...parsed.live },
      };
    }
  } catch {
    // Beschaedigte Datei: mit Defaults neu starten statt zu crashen.
  }
  return defaultDb();
}

/** Schreibt gebuendelt und atomar, damit haeufige Ticks die Platte nicht saettigen. */
function schedulePersist(): void {
  if (writeScheduled) return;
  writeScheduled = true;
  setTimeout(() => {
    writeScheduled = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, FILE);
    } catch {
      // Persistenzfehler duerfen den Handel nicht stoppen.
    }
  }, 500).unref?.();
}

export const db = {
  get data(): DbShape {
    return state;
  },
  update(mutator: (draft: DbShape) => void): DbShape {
    mutator(state);
    schedulePersist();
    return state;
  },
  reset(): void {
    state = defaultDb();
    schedulePersist();
  },
  flush(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  },
};
