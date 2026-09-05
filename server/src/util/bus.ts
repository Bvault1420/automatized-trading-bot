import { EventEmitter } from 'node:events';
import type {
  BotStatus,
  LogEntry,
  MarketIntel,
  Position,
  PortfolioState,
  ScoredCandidate,
  Trade,
  WalletState,
} from '../types.js';

export interface BusEvents {
  log: LogEntry;
  intel: MarketIntel;
  candidates: ScoredCandidate[];
  positions: Position[];
  portfolio: PortfolioState;
  trade: Trade;
  status: BotStatus;
  wallet: WalletState;
}

class TypedBus extends EventEmitter {
  emitEvent<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    this.emit(event as string, payload);
    this.emit('*', { type: event, payload });
  }
}

export const bus = new TypedBus();
bus.setMaxListeners(80);
