import { randomUUID } from 'node:crypto';
import { bus } from './bus.js';
import type { LogEntry, LogLevel } from '../types.js';

const MAX_BUFFER = 600;
const buffer: LogEntry[] = [];

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  success: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  trade: '\x1b[35m',
};

function write(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = { id: randomUUID(), ts: Date.now(), level, scope, message, meta };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);

  const time = new Date(entry.ts).toISOString().slice(11, 19);
  // eslint-disable-next-line no-console
  console.log(`${COLORS[level]}${time} [${scope}] ${message}\x1b[0m`);
  bus.emitEvent('log', entry);
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, meta?: Record<string, unknown>) => write('debug', scope, m, meta),
    info: (m: string, meta?: Record<string, unknown>) => write('info', scope, m, meta),
    success: (m: string, meta?: Record<string, unknown>) => write('success', scope, m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => write('warn', scope, m, meta),
    error: (m: string, meta?: Record<string, unknown>) => write('error', scope, m, meta),
    trade: (m: string, meta?: Record<string, unknown>) => write('trade', scope, m, meta),
  };
}

export function recentLogs(limit = 200): LogEntry[] {
  return buffer.slice(-limit);
}
