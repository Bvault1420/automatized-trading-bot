import { describe, expect, it } from "vitest";
import {
  gameContentSecurityPolicy,
  gameResponseHeaders,
  htmlByteLength,
  IFRAME_SANDBOX,
  prepareGameDocument,
} from "@/lib/game-html";

describe("prepareGameDocument", () => {
  it("wraps bare fragments in a full document with viewport and base style", () => {
    const doc = prepareGameDocument("<canvas></canvas><script>1</script>");
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc).toMatch(/<html><head>[\s\S]*<\/head><body><canvas><\/canvas><script>1<\/script><\/body><\/html>$/);
    expect(doc).toContain('name="viewport"');
    expect(doc).toContain('id="pf-base"');
  });

  it("adds a head when the document has html but no head", () => {
    const doc = prepareGameDocument("<html lang=\"de\"><body>hi</body></html>");
    expect(doc).toContain('<html lang="de"><head>');
    expect(doc).toContain('name="viewport"');
  });

  it("does not duplicate an existing viewport or base style", () => {
    const src =
      '<!doctype html><html><head><meta name="viewport" content="width=device-width"><style id="pf-base">a{}</style></head><body></body></html>';
    const doc = prepareGameDocument(src);
    expect(doc.match(/name="viewport"/g)?.length).toBe(1);
    expect(doc.match(/id="pf-base"/g)?.length).toBe(1);
    expect(doc.match(/<!doctype/gi)?.length).toBe(1);
  });

  it("wraps body-only markup without adding a second body", () => {
    const doc = prepareGameDocument("<body><p>x</p></body>");
    expect(doc.match(/<body/g)?.length).toBe(1);
    expect(doc).toContain("<head>");
  });

  it("strips a BOM and surrounding whitespace", () => {
    const doc = prepareGameDocument("\uFEFF   <html><head></head><body></body></html>  ");
    expect(doc.startsWith("<!DOCTYPE html>\n<html>")).toBe(true);
  });
});

describe("gameContentSecurityPolicy", () => {
  const csp = gameContentSecurityPolicy();

  it("locks the document down", () => {
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("only allows network access to the CDN allow-list", () => {
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src "))!;
    expect(connect).toBeDefined();
    const sources = connect.split(" ").slice(1);
    expect(sources.length).toBeGreaterThan(0);
    // Every source must be a concrete https origin – no wildcards or bare schemes.
    for (const src of sources) expect(src).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    expect(sources).toContain("https://cdn.jsdelivr.net");
  });

  it("keeps the sandbox without allow-same-origin", () => {
    expect(csp).toContain("sandbox allow-scripts allow-pointer-lock");
    expect(IFRAME_SANDBOX).not.toContain("allow-same-origin");
    expect(IFRAME_SANDBOX).not.toContain("allow-top-navigation");
    expect(IFRAME_SANDBOX).not.toContain("allow-forms");
  });
});

describe("gameResponseHeaders", () => {
  it("sets hardening headers for embedded games", () => {
    const h = gameResponseHeaders();
    expect(h["Content-Type"]).toMatch(/^text\/html/);
    expect(h["Content-Security-Policy"]).toBe(gameContentSecurityPolicy());
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Robots-Tag"]).toContain("noindex");
    expect(h["Cache-Control"]).toContain("no-store");
    expect(h["Cross-Origin-Resource-Policy"]).toBe("same-origin");
  });
});

describe("htmlByteLength", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(htmlByteLength("abc")).toBe(3);
    expect(htmlByteLength("ä")).toBe(2);
    expect(htmlByteLength("🎮")).toBe(4);
  });
});
