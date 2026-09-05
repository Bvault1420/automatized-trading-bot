import { getJson } from '../util/http.js';
import { safeNumber } from '../util/num.js';

interface FngResponse {
  data?: { value: string; value_classification: string; timestamp: string }[];
}

export interface FearGreed {
  value: number;
  classification: string;
  previous: number;
  weekAgo: number;
}

/**
 * Crypto Fear & Greed Index (alternative.me).
 *
 * Antizyklisch interpretiert: extreme Angst ist historisch ein besserer
 * Einstiegszeitpunkt als extreme Gier. Fuer Memecoin-Momentum brauchen wir
 * aber Liquiditaet und Aufmerksamkeit, deshalb wird der Wert spaeter
 * hump-foermig statt linear bewertet.
 */
export async function fetchFearGreed(): Promise<FearGreed | null> {
  const res = await getJson<FngResponse>('https://api.alternative.me/fng/?limit=8', {
    cacheMs: 5 * 60_000,
    timeoutMs: 10_000,
  });
  const rows = res?.data;
  if (!rows || rows.length === 0) return null;

  return {
    value: safeNumber(rows[0].value),
    classification: rows[0].value_classification ?? 'Unknown',
    previous: safeNumber(rows[1]?.value, safeNumber(rows[0].value)),
    weekAgo: safeNumber(rows[7]?.value, safeNumber(rows[0].value)),
  };
}
