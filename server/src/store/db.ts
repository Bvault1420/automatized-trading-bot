import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../config.js';
import { FACTORY_RULES, clampRules } from '../learning/adapt.js';
import type {
  AccountSlice,
  AdaptiveRules,
  BotSettings,
  EquityPoint,
  Position,
  RuleChange,
  SelfTestReport,
  Trade,
} from '../types.js';

export interface DbShape {
  version: number;
  settings: BotSettings;
  rules: AdaptiveRules;
  runtime: { shouldRun: boolean };
  paper: AccountSlice;
  live: AccountSlice;
  positions: Position[];
  trades: Trade[];
  equityCurve: EquityPoint[];
  ruleChanges: RuleChange[];
  selfTest: SelfTestReport | null;
}

const VERSION = 1;

function factoryAccount(start: number): AccountSlice {
  const now = Date.now();
  return {
    cashEur: start,
    startEquityEur: start,
    dayStartEquityEur: start,
    dayStartedAt: now,
    peakEquityEur: start,
    realizedPnlEur: 0,
    entriesToday: 0,
    entriesDayStamp: new Date(now).toISOString().slice(0, 10),
  };
}

function factory(): DbShape {
  return {
    version: VERSION,
    settings: {
      tradingMode: 'paper',
      paperStartEur: config.paperStartEur,
      emailEveryTrade: config.emailEveryTrade,
      alertEmail: config.smtp.to,
      liveArmed: false,
      allowStocks: true,
      allowCrypto: true,
      allowShorts: true,
      tickSeconds: 20,
    },
    rules: clampRules(FACTORY_RULES),
    runtime: { shouldRun: true },
    paper: factoryAccount(config.paperStartEur),
    live: factoryAccount(config.paperStartEur),
    positions: [],
    trades: [],
    equityCurve: [],
    ruleChanges: [],
    selfTest: null,
  };
}

class JsonDb {
  data: DbShape;
  private file: string;
  private writing = false;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.file = path.join(DATA_DIR, 'aegis.json');
    this.data = this.load();
  }

  private load(): DbShape {
    const fresh = factory();
    if (!fs.existsSync(this.file)) return fresh;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<DbShape>;
      return {
        ...fresh,
        ...parsed,
        settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
        rules: clampRules({ ...fresh.rules, ...(parsed.rules ?? {}) }),
        paper: { ...fresh.paper, ...(parsed.paper ?? {}) },
        live: { ...fresh.live, ...(parsed.live ?? {}) },
        positions: parsed.positions ?? [],
        trades: parsed.trades ?? [],
        equityCurve: parsed.equityCurve ?? [],
        ruleChanges: parsed.ruleChanges ?? [],
        runtime: { shouldRun: parsed.runtime?.shouldRun ?? true },
      };
    } catch {
      return fresh;
    }
  }

  update(fn: (draft: DbShape) => void): void {
    fn(this.data);
    this.save();
  }

  save(): void {
    if (this.writing) return;
    this.writing = true;
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } finally {
      this.writing = false;
    }
  }
}

export const db = new JsonDb();
