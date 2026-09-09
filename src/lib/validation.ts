import { z } from "zod";
import { LIMITS, REPORT_REASONS } from "@/lib/config";

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "playfeed", "official", "moderator", "mod",
  "system", "api", "login", "signup", "settings", "explore", "create", "legal", "about", "staff", "team",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.username.min, `Mindestens ${LIMITS.username.min} Zeichen.`)
  .max(LIMITS.username.max, `Höchstens ${LIMITS.username.max} Zeichen.`)
  .regex(/^[a-z0-9_]+$/, "Nur Kleinbuchstaben, Zahlen und Unterstriche.")
  .refine((u) => !RESERVED_USERNAMES.has(u), "Dieser Nutzername ist reserviert.");

export const emailSchema = z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben.").max(254);

export const passwordSchema = z
  .string()
  .min(LIMITS.password.min, `Mindestens ${LIMITS.password.min} Zeichen.`)
  .max(LIMITS.password.max, `Höchstens ${LIMITS.password.max} Zeichen.`)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Bitte Buchstaben und mindestens eine Zahl verwenden.");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: z.string().trim().max(LIMITS.displayName).optional().default(""),
  acceptTerms: z.literal(true, { message: "Bitte akzeptiere die Nutzungsbedingungen und Datenschutzerklärung." }),
  confirmAge: z.literal(true, { message: "Du musst mindestens 16 Jahre alt sein." }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Bitte Passwort eingeben.").max(LIMITS.password.max),
});

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1, "Bitte einen Anzeigenamen angeben.").max(LIMITS.displayName),
  bio: z.string().trim().max(LIMITS.bio).default(""),
  website: z
    .string()
    .trim()
    .max(LIMITS.website)
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .refine((v) => v === "" || z.url().safeParse(v).success, "Bitte eine gültige URL angeben.")
    .default(""),
});

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[\p{L}\p{N}_-]{1,24}$/u, "Tags dürfen nur Buchstaben, Zahlen, _ und - enthalten.");

export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s#]+/)) {
    const t = part.trim().toLowerCase();
    if (!t) continue;
    if (!tagSchema.safeParse(t).success) continue;
    seen.add(t);
    if (seen.size >= LIMITS.tags) break;
  }
  return [...seen];
}

export const gameSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(LIMITS.title, `Höchstens ${LIMITS.title} Zeichen.`),
  description: z.string().trim().max(LIMITS.description, `Höchstens ${LIMITS.description} Zeichen.`).default(""),
  html: z
    .string()
    .min(1, "Der Spielcode darf nicht leer sein.")
    .refine((h) => new TextEncoder().encode(h).length <= LIMITS.htmlBytes, `Der Spielcode darf höchstens ${Math.round(LIMITS.htmlBytes / 1000)} KB groß sein.`),
  tags: z.array(tagSchema).max(LIMITS.tags),
  visibility: z.enum(["public", "unlisted", "private"]),
  status: z.enum(["draft", "published"]),
  allowRemix: z.boolean(),
  remixOf: z.uuid().nullable().optional(),
});

export const commentSchema = z.object({
  gameId: z.uuid(),
  body: z.string().trim().min(1, "Bitte einen Kommentar eingeben.").max(LIMITS.comment, `Höchstens ${LIMITS.comment} Zeichen.`),
});

export const reportSchema = z.object({
  targetType: z.enum(["game", "comment", "user"]),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]),
  details: z.string().trim().max(1000).default(""),
});

export const aiPromptSchema = z.object({
  prompt: z.string().trim().min(3, "Bitte beschreibe dein Spiel etwas genauer.").max(LIMITS.aiPrompt),
  baseHtml: z.string().max(LIMITS.htmlBytes).optional(),
});

export function firstError(err: z.ZodError): { message: string; field?: string } {
  const issue = err.issues[0];
  return { message: issue?.message ?? "Ungültige Eingabe.", field: issue?.path?.[0]?.toString() };
}
