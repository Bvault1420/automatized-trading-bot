/**
 * Seed-Skript: legt ein offizielles Creator-Konto an und veröffentlicht die Startvorlagen
 * als erste Spiele im Feed. Optional wird ein Konto zum Admin gemacht.
 *
 *   pnpm seed                       # nutzt .env.local
 *   ADMIN_EMAIL=du@example.com pnpm seed
 *
 * Benötigt NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { TEMPLATES } from "../src/lib/templates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Playfeed";
const seedEmail = process.env.SEED_EMAIL ?? "official@playfeed.local";
const seedUsername = (process.env.SEED_USERNAME ?? appName.toLowerCase().replace(/[^a-z0-9_]/g, "")).slice(0, 20) || "official";
const adminEmail = process.env.ADMIN_EMAIL;

if (!url || !serviceKey) {
  console.error("Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(email: string): Promise<string | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function ensureOfficialUser(): Promise<string> {
  const existing = await findUserByEmail(seedEmail);
  if (existing) {
    console.log(`Offizielles Konto vorhanden (${seedEmail}).`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: seedEmail,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { username: seedUsername, display_name: appName, accepted_terms: "true", accepted_terms_at: new Date().toISOString() },
  });
  if (error || !data.user) throw error ?? new Error("Konto konnte nicht angelegt werden.");
  console.log(`Offizielles Konto angelegt: ${seedEmail} (@${seedUsername}).`);
  await admin.from("profiles").update({ bio: `Offizielle Startspiele von ${appName}. Remixe sie und mach sie zu deinen!` }).eq("id", data.user.id);
  return data.user.id;
}

async function seedGames(authorId: string) {
  const { data: existing, error } = await admin.from("games").select("title").eq("author_id", authorId);
  if (error) throw error;
  const have = new Set((existing ?? []).map((g) => g.title as string));
  let created = 0;
  for (const t of TEMPLATES) {
    if (have.has(t.name)) continue;
    const { error: insErr } = await admin.from("games").insert({
      author_id: authorId,
      title: t.name,
      description: t.description,
      html: t.html,
      tags: t.tags,
      visibility: "public",
      status: "published",
      allow_remix: true,
    });
    if (insErr) throw insErr;
    created++;
    console.log(`  + ${t.name}`);
  }
  console.log(created ? `${created} Spiele veröffentlicht.` : "Alle Startspiele sind bereits vorhanden.");
}

async function makeAdmin(email: string) {
  const id = await findUserByEmail(email);
  if (!id) {
    console.warn(`Kein Konto mit ${email} gefunden – bitte zuerst in der App registrieren.`);
    return;
  }
  const { error } = await admin.from("profiles").update({ is_admin: true }).eq("id", id);
  if (error) throw error;
  console.log(`${email} ist jetzt Admin.`);
}

(async () => {
  const authorId = await ensureOfficialUser();
  await seedGames(authorId);
  if (adminEmail) await makeAdmin(adminEmail);
  console.log("Fertig.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
