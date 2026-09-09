import { describe, expect, it } from "vitest";
import { cn, formatCount, gradientFor, initials, isUuid, safeExternalUrl, timeAgo } from "@/lib/utils";

describe("formatCount", () => {
  it("formats small numbers verbatim", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });

  it("abbreviates thousands and millions", () => {
    expect(formatCount(1000)).toBe("1K");
    expect(formatCount(1500)).toBe("1.5K");
    expect(formatCount(12_340)).toBe("12.3K");
    expect(formatCount(1_000_000)).toBe("1M");
    expect(formatCount(2_500_000)).toBe("2.5M");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000).toISOString();

  it("covers all German buckets", () => {
    expect(timeAgo(at(5), now)).toBe("gerade eben");
    expect(timeAgo(at(120), now)).toBe("vor 2 Min.");
    expect(timeAgo(at(3 * 3600), now)).toBe("vor 3 Std.");
    expect(timeAgo(at(2 * 86400), now)).toBe("vor 2 Tg.");
    expect(timeAgo(at(14 * 86400), now)).toBe("vor 2 Wo.");
    expect(timeAgo(at(90 * 86400), now)).toBe("vor 3 Mon.");
    expect(timeAgo(at(800 * 86400), now)).toBe("vor 2 J.");
  });

  it("never reports the future", () => {
    expect(timeAgo(at(-600), now)).toBe("gerade eben");
  });
});

describe("cn", () => {
  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("gradientFor", () => {
  it("is deterministic and valid CSS", () => {
    expect(gradientFor("abc")).toBe(gradientFor("abc"));
    expect(gradientFor("abc")).toMatch(/^linear-gradient\(135deg, hsl\(\d+ 70% 45%\), hsl\(\d+ 80% 35%\)\)$/);
    expect(gradientFor("abc")).not.toBe(gradientFor("abd"));
  });
});

describe("initials", () => {
  it("handles empty, single and multi-word names", () => {
    expect(initials("")).toBe("?");
    expect(initials("  ")).toBe("?");
    expect(initials("lena")).toBe("LE");
    expect(initials("Lena Müller")).toBe("LM");
    expect(initials("a b c")).toBe("AB");
  });
});

describe("isUuid", () => {
  it("accepts v4 uuids and rejects junk", () => {
    expect(isUuid("2f1e4c3a-9b8d-4e7f-a6b5-c4d3e2f1a0b9")).toBe(true);
    expect(isUuid("2F1E4C3A-9B8D-4E7F-A6B5-C4D3E2F1A0B9")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("2f1e4c3a-9b8d-4e7f-a6b5-c4d3e2f1a0b9x")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("safeExternalUrl", () => {
  it("allows http(s) only", () => {
    expect(safeExternalUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,hi")).toBeNull();
    expect(safeExternalUrl("ftp://example.com")).toBeNull();
    expect(safeExternalUrl("nope")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
