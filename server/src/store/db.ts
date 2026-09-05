import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../config.js';
import type { BotSettings, EquityPoint, Position, Trade } from '../types.js';

export interface DbShape {
  version: number;
  settings: BotSettings;
  /**
   * Ueberlebt Neustarts: ein abgestuerzter oder neu gestarteter Prozess soll den
   * Handel nicht stillschweigend einstellen.
   */
  runtime: { shouldRun: boolean };
  wallet: {
    ownerAddress: string | null;
    /** verschluesselter EVM-Keystore */
    keystore: string | null;
    botAddress: string | null;
    /** verschluesselter Solana-Keystore (getrennt vom EVM-Wallet) */
    solanaKeystore: string | null;
    solanaAddress: string | null;
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

/** Alte Werks-Strategie (v1). Wird einmalig auf die winrate-orientierten Defaults gehoben. */
const LEGACY_FACTORY_SETTINGS = {
  maxOpenPositions: 3,
  riskPerTradePct: 22,
  stopLossPct: 18,
  takeProfitPct: 35,
  trailingStopPct: 14,
  maxHoldMinutes: 45,
  dailyLossLimitPct: 25,
  maxDrawdownPct: 40,
  minLiquidityUsd: 25_000,
  maxSlippagePct: 6,
  minEntryScore: 55,
} as const;

const STRATEGY_VERSION = 9;

function migrateSettings(parsed: DbShape, fresh: BotSettings): BotSettings {
  const settings = { ...fresh, ...parsed.settings };
  if ((parsed.version ?? 1) >= STRATEGY_VERSION) return settings;

  // v3: Mini-Konto (~4 €) – die angefragten „perfekten“ Defaults gelten.
  if ((parsed.version ?? 1) < 3) {
    return {
      ...settings,
      maxOpenPositions: fresh.maxOpenPositions,
      riskPerTradePct: fresh.riskPerTradePct,
      stopLossPct: fresh.stopLossPct,
      takeProfitPct: fresh.takeProfitPct,
      trailingStopPct: fresh.trailingStopPct,
      maxHoldMinutes: fresh.maxHoldMinutes,
      dailyLossLimitPct: fresh.dailyLossLimitPct,
      maxDrawdownPct: fresh.maxDrawdownPct,
      minLiquidityUsd: fresh.minLiquidityUsd,
      maxSlippagePct: fresh.maxSlippagePct,
      minEntryScore: fresh.minEntryScore,
    };
  }

  const next = { ...settings };
  for (const key of Object.keys(LEGACY_FACTORY_SETTINGS) as (keyof typeof LEGACY_FACTORY_SETTINGS)[]) {
    if (next[key] === LEGACY_FACTORY_SETTINGS[key]) {
      next[key] = fresh[key];
    }
  }
  if ((parsed.version ?? 1) < 5) {
    next.minEntryScore = fresh.minEntryScore;
    next.minLiquidityUsd = fresh.minLiquidityUsd;
    next.maxSlippagePct = fresh.maxSlippagePct;
  }
  if ((parsed.version ?? 1) < 7) {
    next.stopLossPct = fresh.stopLossPct;
    next.maxHoldMinutes = fresh.maxHoldMinutes;
  }
  if ((parsed.version ?? 1) < 8) {
    next.minEntryScore = fresh.minEntryScore;
  }
  if ((parsed.version ?? 1) < 9) {
    next.minLiquidityUsd = fresh.minLiquidityUsd;
    next.minEntryScore = fresh.minEntryScore;
    next.maxSlippagePct = fresh.maxSlippagePct;
  }
  return next;
}

function migrateLiveEquityDisplay(parsed: DbShape, draft: DbShape): void {
  if ((parsed.version ?? 1) >= 4) return;
  if (draft.trades.some((t) => t.mode === 'live')) return;
  draft.live.startEquityUsd = 0;
  draft.live.dayStartEquityUsd = 0;
  draft.live.peakEquityUsd = 0;
}

/** Erste Live-Punkte hatten Equity = Wallet minus Gas-Reserve. Das war kein Verlust. */
function migrateLiveCurveReserveBug(parsed: DbShape, draft: DbShape): void {
  if ((parsed.version ?? 1) >= 6) return;
  const start = draft.live.startEquityUsd;
  if (start <= 0) return;
  draft.equityCurve = draft.equityCurve.filter((point) => {
    if (point.mode !== 'live') return true;
    if (point.exposure === 0 && point.equity < start * 0.85) return false;
    return true;
  });
}

function migratePaperForMicro(parsed: DbShape, draft: DbShape): void {
  if ((parsed.version ?? 1) >= 3) return;
  const start = config.defaults.paperStartBalance;
  draft.paper = {
    cashUsd: start,
    startEquityUsd: start,
    dayStartEquityUsd: start,
    dayStartedAt: Date.now(),
    peakEquityUsd: start,
    realizedPnlUsd: 0,
  };
  draft.positions = draft.positions.filter((p) => p.mode !== 'paper');
  draft.trades = draft.trades.filter((t) => t.mode !== 'paper');
  draft.equityCurve = [];
}

function defaultDb(): DbShape {
  const d = config.defaults;
  return {
    version: STRATEGY_VERSION,
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
    runtime: { shouldRun: false },
    wallet: { ownerAddress: null, keystore: null, botAddress: null, solanaKeystore: null, solanaAddress: null },
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

let writeScheduled = false;
let persistUpgrade = false;

function load(): DbShape {
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as DbShape;
      const base = defaultDb();
      persistUpgrade = (parsed.version ?? 1) < STRATEGY_VERSION;
      const merged: DbShape = {
        ...base,
        ...parsed,
        version: Math.max(parsed.version ?? 1, STRATEGY_VERSION),
        settings: migrateSettings(parsed, base.settings),
        runtime: { ...base.runtime, ...parsed.runtime },
        wallet: { ...base.wallet, ...parsed.wallet },
        paper: { ...base.paper, ...parsed.paper },
        live: { ...base.live, ...parsed.live },
      };
      migratePaperForMicro(parsed, merged);
      migrateLiveEquityDisplay(parsed, merged);
      migrateLiveCurveReserveBug(parsed, merged);
      return merged;
    }
  } catch {
    // Beschaedigte Datei: mit Defaults neu starten statt zu crashen.
  }
  return defaultDb();
}

let state: DbShape = load();

/** Schreibt gebuendelt und atomar, damit haeufige Ticks die Platte nicht saettigen. */
function schedulePersist(): void {
  if (writeScheduled) return;
  writeScheduled = true;
  setTimeout(() => {
    writeScheduled = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, FILE);
      fs.chmodSync(FILE, 0o600);
    } catch {
      // Persistenzfehler duerfen den Handel nicht stoppen.
    }
  }, 500).unref?.();
}

if (persistUpgrade) schedulePersist();

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
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
    try {
      fs.chmodSync(FILE, 0o600);
    } catch {
      // chmod kann auf manchen Dateisystemen fehlen.
    }
  },
};
