import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR, config } from '../config.js';

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

function publicUrls(): string[] {
  const fromEnv = (process.env.PUBLIC_URL || '').trim();
  const file = path.join(DATA_DIR, 'public-url.txt');
  let fromFile = '';
  try {
    if (fs.existsSync(file)) fromFile = fs.readFileSync(file, 'utf8').trim().split(/\s+/)[0] || '';
  } catch {
    /* ignore */
  }
  return [...new Set([fromEnv, fromFile].filter((u) => u.startsWith('http')))];
}

export function accessInfo(): {
  port: number;
  pc: string[];
  phone: string[];
  public: string[];
  hint: string;
} {
  const port = config.port;
  const phone = ipv4().map((ip) => `http://${ip}:${port}`);
  const pub = publicUrls();
  return {
    port,
    pc: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
    phone,
    public: pub,
    hint: pub.length
      ? 'In Firefox, Chrome und am Handy diese HTTPS-Adresse öffnen (nicht localhost auf einem anderen Gerät). Localhost gilt nur auf dem Rechner, auf dem der Bot wirklich läuft.'
      : 'Am PC in Firefox oder Chrome: http://localhost:8787 – nur wenn der Bot auf DIESEM Rechner läuft. Am Handy die LAN-IP, nicht das Wort localhost.',
  };
}

export function formatListenLog(): string {
  const a = accessInfo();
  const phone = a.phone.length ? a.phone.join(' · ') : 'kein LAN';
  const pub = a.public.length ? ` · Öffentlich ${a.public.join(' · ')}` : '';
  return `PC ${a.pc[0]} · Handy ${phone}${pub}`;
}
