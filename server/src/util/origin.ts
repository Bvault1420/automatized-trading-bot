import { config } from '../config.js';

function isTunnelHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.endsWith('.cursorvm.com') ||
    h.endsWith('.cvm.dev') ||
    h.endsWith('.cursor.sh') ||
    h.endsWith('.trycloudflare.com') ||
    h.endsWith('.ngrok.io') ||
    h.endsWith('.ngrok-free.app') ||
    h.endsWith('.localhost')
  );
}

function isLoopback(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

/**
 * Firefox, Chrome, PC und Handy: Same-Origin auf 8787 plus Vite-Dev und Tunnel.
 * Am Handy ist „localhost“ das Telefon – deshalb sind LAN-IPs erlaubt.
 */
export function allowedOrigin(origin: string | undefined, apiPort = config.port): boolean {
  if (!origin) return true;
  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (isLoopback(host) || isTunnelHost(host) || isPrivateHost(host)) return true;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    if (port === String(apiPort) || port === '5173' || port === '4173') return true;
    return false;
  } catch {
    return false;
  }
}
