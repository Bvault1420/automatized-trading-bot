import type { BotSettings, FullState, TradingMode } from './types';

const BASE = '/api';

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data.message ?? `Fehler ${res.status}`);
  return data;
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

export interface ActionResult {
  ok: boolean;
  message: string;
}

export const api = {
  state: () => call<FullState>('/state'),
  start: () => post<ActionResult>('/bot/start'),
  stop: () => post<ActionResult>('/bot/stop'),
  panic: () => post<ActionResult>('/bot/panic'),
  setMode: (mode: TradingMode) => post<ActionResult>('/bot/mode', { mode }),
  updateSettings: (patch: Partial<BotSettings>) =>
    call<{ ok: boolean; settings: BotSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  closePosition: (id: string) => post<ActionResult>(`/positions/${id}/close`),
  closeAll: () => post<ActionResult>('/positions/close-all'),
  connectOwner: (address: string) => post<ActionResult>('/wallet/owner', { address }),
  disconnectOwner: () => post<ActionResult>('/wallet/disconnect'),
  createWallet: (passphrase: string) => post<ActionResult & { address: string }>('/wallet/create', { passphrase }),
  unlockWallet: (passphrase: string) => post<ActionResult>('/wallet/unlock', { passphrase }),
  lockWallet: () => post<ActionResult>('/wallet/lock'),
  withdraw: (to?: string) => post<ActionResult & { txHash: string }>('/wallet/withdraw', to ? { to } : {}),
  exportKey: (passphrase: string) => post<{ ok: boolean; privateKey: string }>('/wallet/export', { passphrase }),
  resetPaper: (balance: number) => post<ActionResult>('/paper/reset', { balance }),
};
