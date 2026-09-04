export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Skaliert `value` linear aus [inMin, inMax] nach [0, 1] und begrenzt das Ergebnis. */
export function normalize(value: number, inMin: number, inMax: number): number {
  if (!Number.isFinite(value) || inMax === inMin) return 0;
  return clamp((value - inMin) / (inMax - inMin), 0, 1);
}

/**
 * Weiche Saettigungskurve: 0 bleibt 0, `half` ergibt 0.5, grosse Werte naehern
 * sich 1 an. Gut fuer Groessen ohne natuerliche Obergrenze (Volumen, Liquiditaet).
 */
export function saturate(value: number, half: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / (value + half);
}

/** Glockenkurve mit Maximum bei `center`; `width` ist die Halbwertsbreite. */
export function bell(value: number, center: number, width: number): number {
  if (!Number.isFinite(value) || width <= 0) return 0;
  const z = (value - center) / width;
  return Math.exp(-(z * z));
}

export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
