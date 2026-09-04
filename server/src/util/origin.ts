import { config } from '../config.js';

/**
 * Same-origin Dashboard (Produktion: ein Prozess, ein Port) plus lokale Dev-Origins.
 * Beliebige Hosts auf dem API-Port sind erlaubt, damit Handy/LAN/VPS dasselbe UI nutzen.
 */
export function originAllowed(origin: string | undefined, apiPort = config.port): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return port === String(apiPort);
  } catch {
    return false;
  }
}
