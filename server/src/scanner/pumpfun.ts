import { getJson } from '../util/http.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('pumpfun');
const API = 'https://frontend-api-v3.pump.fun';

interface PumpCoinRow {
  mint?: string;
  coinMint?: string;
  symbol?: string;
  name?: string;
  market_cap?: number;
  usd_market_cap?: number;
  complete?: boolean;
  raydium_pool?: string | null;
}

type PumpResponse = PumpCoinRow[] | { coins?: PumpCoinRow[] };

const PUMP_LISTS: { sort: string; order: 'ASC' | 'DESC'; limit: number; offset?: number }[] = [
  { sort: 'last_trade_timestamp', order: 'DESC', limit: 60 },
  { sort: 'market_cap', order: 'DESC', limit: 45 },
  { sort: 'created_timestamp', order: 'DESC', limit: 45 },
  { sort: 'last_reply', order: 'DESC', limit: 35 },
  { sort: 'last_trade_timestamp', order: 'DESC', limit: 40, offset: 60 },
];

function mintFrom(row: PumpCoinRow): string | null {
  const mint = row.mint ?? row.coinMint;
  return typeof mint === 'string' && mint.length > 20 ? mint : null;
}

async function fetchPumpList(
  sort: string,
  order: 'ASC' | 'DESC',
  limit: number,
  offset = 0,
): Promise<PumpCoinRow[]> {
  const url =
    `${API}/coins?offset=${offset}&limit=${limit}&sort=${encodeURIComponent(sort)}` +
    `&order=${order}&includeNsfw=false`;
  const res = await getJson<PumpResponse>(url, { cacheMs: 35_000, timeoutMs: 10_000 });
  return Array.isArray(res) ? res : (res?.coins ?? []);
}

/**
 * Sammelt frische und aktive pump.fun-Mints aus mehreren Sortierungen
 * (letzter Trade, Marktkapitalisierung, neu erstellt, Community-Aktivität).
 */
export async function fetchPumpFunMints(max = 120): Promise<string[]> {
  const mints = new Set<string>();
  const tasks = PUMP_LISTS.map(async ({ sort, order, limit, offset }) => {
    try {
      const rows = await fetchPumpList(sort, order, limit, offset ?? 0);
      for (const row of rows) {
        const mint = mintFrom(row);
        if (mint) mints.add(mint);
      }
    } catch (err) {
      log.debug(`pump.fun ${sort}: ${(err as Error).message}`);
    }
  });

  tasks.push(
    getJson<{ data?: { relationships?: { base_token?: { data?: { id?: string } } } }[] }>(
      'https://api.geckoterminal.com/api/v2/networks/solana/dexes/pump-fun/pools?page=1',
      { cacheMs: 45_000, timeoutMs: 8_000, headers: { accept: 'application/json' } },
    )
      .then((res) => {
        for (const pool of res?.data ?? []) {
          const id = pool.relationships?.base_token?.data?.id ?? '';
          const address = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id;
          if (address) mints.add(address);
        }
      })
      .catch(() => undefined),
    getJson<{ data?: { relationships?: { base_token?: { data?: { id?: string } } } }[] }>(
      'https://api.geckoterminal.com/api/v2/networks/solana/dexes/pumpswap/pools?page=1',
      { cacheMs: 45_000, timeoutMs: 8_000, headers: { accept: 'application/json' } },
    )
      .then((res) => {
        for (const pool of res?.data ?? []) {
          const id = pool.relationships?.base_token?.data?.id ?? '';
          const address = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id;
          if (address) mints.add(address);
        }
      })
      .catch(() => undefined),
  );

  await Promise.all(tasks);

  const list = [...mints].slice(0, max);
  if (list.length > 0) log.debug(`${list.length} pump.fun/pumpswap-Mints geladen`);
  return list;
}
