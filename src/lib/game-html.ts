/**
 * Sicherheits-Hülle für nutzergenerierte Spiele.
 *
 * Spiele laufen ausschließlich in einem sandboxed <iframe> (ohne allow-same-origin),
 * werden über einen eigenen Endpunkt (/embed/…) mit restriktiver CSP ausgeliefert
 * und können daher weder auf Cookies/Sitzung der App noch auf fremde Server zugreifen.
 */

const CDN_HOSTS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://cdnjs.cloudflare.com",
  "https://esm.sh",
  "https://cdn.skypack.dev",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

/** CSP-Header für ausgelieferte Spiel-Dokumente. */
export function gameContentSecurityPolicy(): string {
  const cdn = CDN_HOSTS.join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob: ${cdn}`,
    `style-src 'unsafe-inline' ${cdn}`,
    "img-src data: blob: https:",
    "media-src data: blob: https:",
    `font-src data: ${cdn}`,
    `connect-src ${cdn}`,
    "worker-src blob:",
    "child-src blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "sandbox allow-scripts allow-pointer-lock",
  ].join("; ");
}

/** Attribute für das <iframe>, in dem ein Spiel läuft. */
export const IFRAME_SANDBOX = "allow-scripts allow-pointer-lock";
export const IFRAME_ALLOW = "accelerometer; gyroscope; fullscreen; autoplay";

const BASE_STYLE =
  "<style id=\"pf-base\">html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000;color:#fff;-webkit-tap-highlight-color:transparent;touch-action:none;user-select:none;-webkit-user-select:none}canvas{display:block}</style>";

const VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">';

/**
 * Bereitet den HTML-Code für die Auslieferung vor:
 * - stellt Doctype, <html>, <head>, <body> sicher
 * - fügt Viewport-Meta und Basis-Styles hinzu (nur wenn noch nicht vorhanden)
 *
 * Bewusst KEINE inhaltliche "Säuberung": die Sicherheit kommt aus Sandbox + CSP,
 * nicht aus fehleranfälligem HTML-Filtern.
 */
export function prepareGameDocument(html: string): string {
  let doc = html.replace(/^\uFEFF/, "").trim();

  const hasHtmlTag = /<html[\s>]/i.test(doc);
  const hasHead = /<head[\s>]/i.test(doc);
  const hasBody = /<body[\s>]/i.test(doc);

  if (!hasHtmlTag) {
    doc = hasBody ? `<html>${doc}</html>` : `<html><head></head><body>${doc}</body></html>`;
  } else if (!hasHead) {
    doc = doc.replace(/<html[^>]*>/i, (m) => `${m}<head></head>`);
  }

  const inject: string[] = [];
  if (!/<meta[^>]+name=["']?viewport/i.test(doc)) inject.push(VIEWPORT_META);
  if (!/id=["']pf-base["']/.test(doc)) inject.push(BASE_STYLE);
  if (inject.length) doc = doc.replace(/<head[^>]*>/i, (m) => `${m}${inject.join("")}`);

  if (!/^<!doctype/i.test(doc)) doc = `<!DOCTYPE html>\n${doc}`;
  return doc;
}

export function htmlByteLength(html: string): number {
  return new TextEncoder().encode(html).length;
}

/** Antwort-Header für ausgelieferte Spiel-Dokumente (/embed/…). */
export function gameResponseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": gameContentSecurityPolicy(),
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, no-store",
  };
}
