import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { FullState } from './types';

type Connection = 'connecting' | 'live' | 'offline';

interface BusMessage {
  type: string;
  payload: unknown;
}

const MAX_LOGS = 300;

/**
 * Haelt den kompletten Bot-Zustand aktuell.
 *
 * Der Erstzustand kommt per REST, danach schiebt der Server nur noch Deltas
 * ueber WebSocket. Bricht die Verbindung ab, wird mit Backoff neu verbunden
 * und dabei ein frischer Snapshot geholt.
 */
export function useBotState() {
  const [state, setState] = useState<FullState | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch {
      setConnection('offline');
    }
  }, []);

  useEffect(() => {
    closedRef.current = false;
    let reconnectTimer: number | undefined;

    const applyEvent = (message: BusMessage) => {
      if (message.type === 'snapshot') {
        setState(message.payload as FullState);
        return;
      }
      setState((prev) => {
        if (!prev) return prev;
        switch (message.type) {
          case 'status':
            return { ...prev, status: message.payload as FullState['status'] };
          case 'portfolio':
            return { ...prev, portfolio: message.payload as FullState['portfolio'] };
          case 'positions':
            return { ...prev, positions: message.payload as FullState['positions'] };
          case 'intel':
            return { ...prev, intel: message.payload as FullState['intel'] };
          case 'candidates':
            return { ...prev, candidates: message.payload as FullState['candidates'] };
          case 'wallet':
            return { ...prev, wallet: message.payload as FullState['wallet'] };
          case 'trade': {
            const trade = message.payload as FullState['trades'][number];
            if (prev.trades.some((existing) => existing.id === trade.id)) return prev;
            return { ...prev, trades: [trade, ...prev.trades].slice(0, 100) };
          }
          case 'log': {
            const entry = message.payload as FullState['logs'][number];
            // Ein Eintrag kann sowohl im Snapshot als auch als Event ankommen,
            // wenn er waehrend des Ladens entsteht.
            if (prev.logs.some((existing) => existing.id === entry.id)) return prev;
            return { ...prev, logs: [...prev.logs, entry].slice(-MAX_LOGS) };
          }
          default:
            return prev;
        }
      });
    };

    const connect = () => {
      if (closedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnection('live');
      };
      socket.onmessage = (event) => {
        try {
          applyEvent(JSON.parse(event.data as string) as BusMessage);
        } catch {
          // Fehlerhafte Nachricht ignorieren statt den Stream abzureissen.
        }
      };
      socket.onclose = () => {
        if (closedRef.current) return;
        setConnection('offline');
        const delay = Math.min(1000 * 2 ** attemptRef.current++, 15_000);
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => socket.close();
    };

    void refresh();
    connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [refresh]);

  // Kennzahlen wie "Trades" und Statistiken kommen nicht per Event – periodisch
  // nachladen, damit sie nicht veralten.
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { state, connection, refresh };
}
