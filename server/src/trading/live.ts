import crypto from 'node:crypto';
import { config } from '../config.js';
import type { Side } from '../types.js';

export function liveBlockers(): string[] {
  const out: string[] = [];
  if (!config.binance.key || !config.binance.secret) {
    out.push('Binance API-Schlüssel fehlen (Krypto-Live)');
  }
  return out;
}

export async function placeBinanceMarket(opts: {
  symbol: string;
  side: Side;
  quoteUsdt: number;
}): Promise<{ ok: boolean; message: string; orderId?: string }> {
  if (!config.binance.key || !config.binance.secret) {
    return { ok: false, message: 'Keine Binance-Schlüssel' };
  }
  const side = opts.side === 'long' ? 'BUY' : 'SELL';
  const params: Record<string, string> = {
    symbol: opts.symbol,
    side,
    type: 'MARKET',
    timestamp: String(Date.now()),
    recvWindow: '5000',
  };
  if (opts.side === 'long') params.quoteOrderQty = opts.quoteUsdt.toFixed(2);
  else params.quoteOrderQty = opts.quoteUsdt.toFixed(2);

  const body = new URLSearchParams(params);
  const sig = crypto.createHmac('sha256', config.binance.secret).update(body.toString()).digest('hex');
  body.set('signature', sig);
  try {
    const res = await fetch(`${config.binance.baseUrl}/api/v3/order`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': config.binance.key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as { orderId?: number; msg?: string };
    if (!res.ok) return { ok: false, message: json.msg || `Binance ${res.status}` };
    return { ok: true, message: 'Live-Order ausgeführt', orderId: String(json.orderId ?? '') };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function placeBinanceExit(opts: {
  symbol: string;
  side: Side;
  qty: number;
}): Promise<{ ok: boolean; message: string }> {
  if (!config.binance.key || !config.binance.secret) {
    return { ok: false, message: 'Keine Binance-Schlüssel' };
  }
  const side = opts.side === 'long' ? 'SELL' : 'BUY';
  const params = new URLSearchParams({
    symbol: opts.symbol,
    side,
    type: 'MARKET',
    quantity: qtyFix(opts.qty),
    timestamp: String(Date.now()),
    recvWindow: '5000',
  });
  const sig = crypto.createHmac('sha256', config.binance.secret).update(params.toString()).digest('hex');
  params.set('signature', sig);
  try {
    const res = await fetch(`${config.binance.baseUrl}/api/v3/order`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': config.binance.key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const json = (await res.json()) as { msg?: string };
    if (!res.ok) return { ok: false, message: json.msg || `Binance ${res.status}` };
    return { ok: true, message: 'Live-Exit ausgeführt' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

function qtyFix(q: number): string {
  if (q >= 1) return q.toFixed(4);
  if (q >= 0.01) return q.toFixed(5);
  return q.toFixed(6);
}
