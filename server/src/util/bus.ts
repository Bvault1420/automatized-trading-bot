import { EventEmitter } from 'node:events';
import type { DashboardState, LogEntry } from '../types.js';

class Bus extends EventEmitter {
  emitEvent(type: string, payload: unknown): void {
    this.emit('event', { type, payload, t: Date.now() });
  }

  emitLog(entry: LogEntry): void {
    this.emitEvent('log', entry);
  }

  emitState(state: DashboardState): void {
    this.emitEvent('state', state);
  }
}

export const bus = new Bus();
