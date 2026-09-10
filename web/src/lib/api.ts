import type { DashboardState, TradingMode } from './types';

async function parse(res: Response): Promise<{ ok: boolean; message: string }> {
  const data = (await res.json()) as { ok?: boolean; message?: string };
  return { ok: Boolean(data.ok ?? res.ok), message: data.message || (res.ok ? 'OK' : 'Fehler') };
}

export const api = {
  state: () => fetch('/api/state').then((r) => r.json() as Promise<DashboardState>),
  start: () => fetch('/api/start', { method: 'POST' }).then(parse),
  stop: () => fetch('/api/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Manuell gestoppt' }) }).then(parse),
  setMode: (mode: TradingMode) =>
    fetch('/api/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) }).then(parse),
  armLive: (armed: boolean) =>
    fetch('/api/live-arm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ armed }) }).then(parse),
  resetPaper: () => fetch('/api/reset-paper', { method: 'POST' }).then(parse),
  access: () =>
    fetch('/api/access').then((r) => r.json() as Promise<{ port: number; pc: string[]; phone: string[]; hint: string }>),
  settings: (patch: Record<string, unknown>) =>
    fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then((r) => r.json()),
};
