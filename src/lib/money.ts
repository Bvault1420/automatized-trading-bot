export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function shortAddr(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtUsd(value: unknown, digits = 2): string {
  const n = num(value);
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  };
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString(undefined, opts)}`;
}

export function fmtQty(value: unknown, max = 6): string {
  const n = num(value);
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : max;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtPx(value: unknown): string {
  const n = num(value);
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 1 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(value: unknown, digits = 2): string {
  const n = num(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function changePct(mark: unknown, prev: unknown): number {
  const p = num(prev);
  if (!p) return 0;
  return ((num(mark) - p) / p) * 100;
}

export function fmtTime(ms: unknown): string {
  const n = num(ms);
  if (!n) return "—";
  return new Date(n).toLocaleString();
}

export function fmtFunding(value: unknown): string {
  const n = num(value) * 100;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(4)}%`;
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function signedClass(value: unknown): string {
  const n = num(value);
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "";
}
