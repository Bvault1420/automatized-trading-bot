export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Playfeed";

export const APP_DESCRIPTION =
  "Scrollen, spielen, teilen: ein endloser Feed aus Mini-Spielen von Creator*innen aus der Community.";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");

export const MIN_AGE = 16;

export const LIMITS = {
  username: { min: 3, max: 20 },
  displayName: 40,
  bio: 200,
  website: 200,
  title: 80,
  description: 500,
  comment: 500,
  tags: 8,
  tagLength: 24,
  htmlBytes: 400_000,
  avatarBytes: 2 * 1024 * 1024,
  thumbnailBytes: 3 * 1024 * 1024,
  password: { min: 8, max: 72 },
  aiPrompt: 1500,
} as const;

export const FEED_PAGE_SIZE = 8;

export const REPORT_REASONS = [
  { value: "spam", label: "Spam oder irreführend" },
  { value: "harassment", label: "Belästigung oder Hass" },
  { value: "violence", label: "Gewalt oder gefährliche Inhalte" },
  { value: "sexual", label: "Sexuelle Inhalte" },
  { value: "minors", label: "Gefährdung von Minderjährigen" },
  { value: "copyright", label: "Urheberrechtsverletzung" },
  { value: "privacy", label: "Verletzung der Privatsphäre" },
  { value: "malware", label: "Schadcode oder Betrug" },
  { value: "other", label: "Sonstiges" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/** Angaben für Impressum & Datenschutz – über Umgebungsvariablen konfigurierbar. */
export const LEGAL = {
  operatorName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "[Name / Firma des Betreibers]",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "[Straße Hausnummer, PLZ Ort, Land]",
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "[kontakt@example.com]",
  phone: process.env.NEXT_PUBLIC_LEGAL_PHONE ?? "",
  representative: process.env.NEXT_PUBLIC_LEGAL_REPRESENTATIVE ?? "",
  vatId: process.env.NEXT_PUBLIC_LEGAL_VAT_ID ?? "",
  registerInfo: process.env.NEXT_PUBLIC_LEGAL_REGISTER ?? "",
  dpoEmail: process.env.NEXT_PUBLIC_LEGAL_DPO_EMAIL ?? "",
  hostingProvider: process.env.NEXT_PUBLIC_HOSTING_PROVIDER ?? "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA",
};

export const AI_ENABLED = Boolean(process.env.AI_API_KEY);
