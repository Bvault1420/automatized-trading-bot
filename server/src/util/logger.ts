import { bus } from './bus.js';
import type { LogEntry } from '../types.js';

const logs: LogEntry[] = [];
const MAX = 400;

function push(level: LogEntry['level'], scope: string, message: string): LogEntry {
  const entry: LogEntry = { t: Date.now(), level, scope, message };
  logs.push(entry);
  if (logs.length > MAX) logs.splice(0, logs.length - MAX);
  bus.emitLog(entry);
  const tag = `[${scope}]`;
  if (level === 'error') console.error(tag, message);
  else if (level === 'warn') console.warn(tag, message);
  else console.log(tag, message);
  return entry;
}

export function createLogger(scope: string) {
  return {
    info: (message: string) => push('info', scope, message),
    warn: (message: string) => push('warn', scope, message),
    error: (message: string) => push('error', scope, message),
    success: (message: string) => push('success', scope, message),
  };
}

export function recentLogs(limit = 120): LogEntry[] {
  return logs.slice(-limit);
}
