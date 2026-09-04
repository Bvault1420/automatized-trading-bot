export function usd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '$0.00';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)} Mrd.`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)} Mio.`;
  if (abs >= 10_000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(decimals)}`;
}

export function price(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '$0';
  if (value >= 1) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  // Sehr kleine Memecoin-Preise lesbar als $0.0₆1234 darstellen.
  const exponent = Math.floor(Math.log10(value));
  const zeros = Math.abs(exponent) - 1;
  const digits = Math.round(value * 10 ** (zeros + 4));
  const subscript = String(zeros)
    .split('')
    .map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)])
    .join('');
  return `$0.0${subscript}${digits}`;
}

export function pct(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function compact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}

export function timeAgo(ts: number): string {
  if (!ts) return '–';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `vor ${seconds}s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
  if (seconds < 86_400) return `vor ${Math.floor(seconds / 3600)} Std.`;
  return `vor ${Math.floor(seconds / 86_400)} T.`;
}

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function shortAddress(address: string | null): string {
  if (!address) return '–';
  if (address.startsWith('0x')) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} Min.`;
  if (hours < 48) return `${hours.toFixed(1)} Std.`;
  return `${(hours / 24).toFixed(1)} T.`;
}

export const toneClass = (value: number): string =>
  value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-slate-400';
