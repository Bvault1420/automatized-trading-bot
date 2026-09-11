import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { DashboardState } from './types';

export function useBotState() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [connection, setConnection] = useState<'live' | 'poll' | 'offline'>('poll');

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setConnection((c) => (c === 'live' ? 'live' : 'poll'));
    } catch {
      setConnection('offline');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => setConnection('live');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { type?: string; payload?: DashboardState };
        if (msg.type === 'state' && msg.payload) setState(msg.payload);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => setConnection('poll');
    return () => {
      clearInterval(t);
      ws.close();
    };
  }, [refresh]);

  return { state, connection, refresh };
}
