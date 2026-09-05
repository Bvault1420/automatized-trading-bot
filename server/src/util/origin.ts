import { config } from '../config.js';

/** Cursor-Cloud-Tunnel – Handy nutzt dieselbe HTTPS-URL wie der PC (Port oft 443). */
function isTunnelHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.endsWith('.cursorvm.com') || h.endsWith('.cvm.dev') || h.endsWith('.cursor.sh');
}

/**
 * Same-origin Dashboard (Produktion: ein Prozess, ein Port) plus lokale Dev-Origins.
 * LAN-Handy: Port 8787 (Produktion) oder 5173 (Vite-Dev mit Proxy).
 */
export function originAllowed(origin: string | undefined, apiPort = config.port): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (isTunnelHost(host)) return true;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    if (port === String(apiPort)) return true;
    // Vite-Dev: LAN, lokale Netzwerke
    if (port === '5173') return true;
    return false;
  } catch {
    return false;
  }
}
