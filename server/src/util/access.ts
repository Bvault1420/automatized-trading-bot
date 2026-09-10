import os from 'node:os';
import { config } from '../config.js';

function ipv4(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      const family = String(a.family);
      if ((family === 'IPv4' || family === '4') && !a.internal) out.push(a.address);
    }
  }
  return [...new Set(out)];
}

export function accessInfo(): {
  port: number;
  pc: string[];
  phone: string[];
  hint: string;
} {
  const port = config.port;
  const phone = ipv4().map((ip) => `http://${ip}:${port}`);
  return {
    port,
    pc: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
    phone,
    hint: 'Am PC in Firefox oder Chrome: http://localhost:8787 – Browser schließen ist egal, der Bot läuft weiter. Am Handy nicht „localhost“ tippen (das ist das Telefon), sondern die IP-Adresse im gleichen WLAN.',
  };
}

export function formatListenLog(): string {
  const a = accessInfo();
  const phone = a.phone.length ? a.phone.join(' · ') : 'kein LAN erkannt – Handy erst im gleichen WLAN';
  return `PC ${a.pc[0]} · Handy ${phone}`;
}
