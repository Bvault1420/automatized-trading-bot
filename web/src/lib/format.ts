const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function money(n: number): string {
  return eur.format(n);
}

export function n2(n: number): string {
  return num.format(n);
}

export function signedMoney(n: number): string {
  const s = money(n);
  return n > 0 ? `+${s}` : s;
}

export function pct(n: number): string {
  const v = `${n >= 0 ? '+' : ''}${n2(n)} %`;
  return v;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `vor ${s}s`;
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  return `vor ${Math.floor(s / 3600)} Std.`;
}

export function when(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export const strategyName: Record<string, string> = {
  meanReversion: 'Mean Reversion',
  trend: 'Trendfolge',
  grid: 'Grid / Range',
  breakout: 'Breakout',
};

export const regimeName: Record<string, string> = {
  'trend-up': 'Aufwärtstrend',
  'trend-down': 'Abwärtstrend',
  range: 'Seitwärts',
  breakout: 'Ausbruch',
  'risk-off': 'Risiko aus',
};
