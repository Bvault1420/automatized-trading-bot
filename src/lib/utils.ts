export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trimZero((n / 1000).toFixed(1))}K`;
  return `${trimZero((n / 1_000_000).toFixed(1))}M`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade eben";
  const m = Math.floor(diff / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `vor ${d} Tg.`;
  const w = Math.floor(d / 7);
  if (w < 5) return `vor ${w} Wo.`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `vor ${mo} Mon.`;
  return `vor ${Math.floor(d / 365)} J.`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Deterministischer Farbverlauf für Karten ohne Vorschaubild. */
export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 60 + (h % 80)) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 45%), hsl(${b} 80% 35%))`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
