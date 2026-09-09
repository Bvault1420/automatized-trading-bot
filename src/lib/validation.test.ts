import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  commentSchema,
  firstError,
  gameSchema,
  parseTags,
  passwordSchema,
  profileSchema,
  reportSchema,
  signupSchema,
  usernameSchema,
} from "@/lib/validation";

const UUID = "2f1e4c3a-9b8d-4e7f-a6b5-c4d3e2f1a0b9";

describe("usernameSchema", () => {
  it("normalises case and whitespace", () => {
    expect(usernameSchema.parse("  Lena_01 ")).toBe("lena_01");
  });

  it("rejects invalid, too short, too long and reserved names", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(21)).success).toBe(false);
    expect(usernameSchema.safeParse("lena-01").success).toBe(false);
    expect(usernameSchema.safeParse("lena müller").success).toBe(false);
    expect(usernameSchema.safeParse("admin").success).toBe(false);
    expect(usernameSchema.safeParse("ADMIN").success).toBe(false);
    expect(usernameSchema.safeParse("settings").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("requires letters and a digit with sane length", () => {
    expect(passwordSchema.safeParse("abcdefg1").success).toBe(true);
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("abc1").success).toBe(false);
    expect(passwordSchema.safeParse("a1".repeat(40)).success).toBe(false);
  });
});

describe("signupSchema", () => {
  const valid = {
    email: "Lena@Example.com ",
    password: "geheim123",
    username: "lena",
    displayName: "Lena",
    acceptTerms: true as const,
    confirmAge: true as const,
  };

  it("accepts a valid signup and lowercases the email", () => {
    const r = signupSchema.parse(valid);
    expect(r.email).toBe("lena@example.com");
    expect(r.displayName).toBe("Lena");
  });

  it("requires terms and age confirmation", () => {
    const terms = signupSchema.safeParse({ ...valid, acceptTerms: false });
    expect(terms.success).toBe(false);
    if (!terms.success) expect(firstError(terms.error).field).toBe("acceptTerms");

    const age = signupSchema.safeParse({ ...valid, confirmAge: false });
    expect(age.success).toBe(false);
    if (!age.success) expect(firstError(age.error).field).toBe("confirmAge");
  });
});

describe("profileSchema", () => {
  it("prefixes website with https:// and validates it", () => {
    const r = profileSchema.parse({ username: "lena", displayName: "Lena", bio: "", website: "example.com" });
    expect(r.website).toBe("https://example.com");
    expect(profileSchema.parse({ username: "lena", displayName: "Lena", website: "" }).website).toBe("");
    expect(profileSchema.safeParse({ username: "lena", displayName: "Lena", website: "not a url" }).success).toBe(false);
    expect(profileSchema.safeParse({ username: "lena", displayName: "Lena", website: "javascript:alert(1)" }).success).toBe(false);
  });

  it("requires a display name", () => {
    expect(profileSchema.safeParse({ username: "lena", displayName: "   " }).success).toBe(false);
  });
});

describe("parseTags", () => {
  it("splits on commas, whitespace and hashes, dedupes and lowercases", () => {
    expect(parseTags("#Arcade, retro  puzzle,arcade")).toEqual(["arcade", "retro", "puzzle"]);
  });

  it("drops invalid tags and caps at the limit", () => {
    expect(parseTags(`ok, bad!, ${"a".repeat(25)}, fine`)).toEqual(["ok", "fine"]);
    expect(parseTags("a b c d e f g h i j")).toHaveLength(8);
    expect(parseTags("")).toEqual([]);
  });

  it("supports unicode letters", () => {
    expect(parseTags("spaß, geschick")).toEqual(["spaß", "geschick"]);
  });
});

describe("gameSchema", () => {
  const base = {
    title: "Mein Spiel",
    description: "",
    html: "<canvas></canvas>",
    tags: ["arcade"],
    visibility: "public",
    status: "published",
    allowRemix: true,
    remixOf: null,
  };

  it("accepts a valid game", () => {
    expect(gameSchema.safeParse(base).success).toBe(true);
  });

  it("rejects empty title, empty html and oversized html", () => {
    expect(gameSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(gameSchema.safeParse({ ...base, html: "" }).success).toBe(false);
    expect(gameSchema.safeParse({ ...base, html: "x".repeat(400_001) }).success).toBe(false);
  });

  it("validates enums and remix reference", () => {
    expect(gameSchema.safeParse({ ...base, visibility: "friends" }).success).toBe(false);
    expect(gameSchema.safeParse({ ...base, status: "removed" }).success).toBe(false);
    expect(gameSchema.safeParse({ ...base, remixOf: "abc" }).success).toBe(false);
    expect(gameSchema.safeParse({ ...base, remixOf: UUID }).success).toBe(true);
  });
});

describe("commentSchema / reportSchema", () => {
  it("validates comments", () => {
    expect(commentSchema.safeParse({ gameId: UUID, body: " hi " }).success).toBe(true);
    expect(commentSchema.safeParse({ gameId: UUID, body: "   " }).success).toBe(false);
    expect(commentSchema.safeParse({ gameId: "nope", body: "hi" }).success).toBe(false);
  });

  it("validates reports", () => {
    expect(reportSchema.safeParse({ targetType: "game", targetId: UUID, reason: "spam" }).success).toBe(true);
    expect(reportSchema.safeParse({ targetType: "game", targetId: UUID, reason: "made-up" }).success).toBe(false);
    expect(reportSchema.safeParse({ targetType: "post", targetId: UUID, reason: "spam" }).success).toBe(false);
  });
});

describe("firstError", () => {
  it("returns message and top-level field", () => {
    const r = z.object({ a: z.string().min(2, "zu kurz") }).safeParse({ a: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toEqual({ message: "zu kurz", field: "a" });
  });
});
