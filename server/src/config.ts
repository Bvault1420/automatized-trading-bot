import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

export const ROOT = path.resolve(process.cwd().endsWith('server') ? '..' : process.cwd());
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  bindHost: process.env.BIND_HOST || '0.0.0.0',
  port: num('PORT', 8787),
  paperStartEur: 100,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num('SMTP_PORT', 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    to: process.env.ALERT_EMAIL_TO || '',
    from: process.env.ALERT_EMAIL_FROM || 'aegis@localhost',
  },
  emailEveryTrade: process.env.EMAIL_EVERY_TRADE !== 'false',
  binance: {
    key: process.env.BINANCE_API_KEY || '',
    secret: process.env.BINANCE_API_SECRET || '',
    baseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
    dataUrl: process.env.BINANCE_DATA_URL || 'https://data-api.binance.vision',
  },
  bybit: {
    baseUrl: process.env.BYBIT_BASE_URL || 'https://api.bybit.com',
  },
  alpaca: {
    key: process.env.ALPACA_KEY || '',
    secret: process.env.ALPACA_SECRET || '',
    baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
  },
  liveUnlock: process.env.LIVE_UNLOCK || '',
  intervals: {
    tick: 20_000,
    scan: 45_000,
    selfTest: 6 * 60 * 60_000,
    digest: 24 * 60 * 60_000,
  },
};

export const HARD_CAPS = {
  minQualityFloor: 68,
  minQualityCeiling: 90,
  minRrFloor: 1.6,
  minRrCeiling: 3.2,
  riskPctFloor: 0.4,
  riskPctCeiling: 1.2,
  maxEntriesCeiling: 20,
  maxEntriesFloor: 6,
  maxOpenPositions: 3,
  cashBufferPct: 0.22,
  maxNotionalPct: 0.36,
  maxHoldMinutes: 36 * 60,
} as const;
