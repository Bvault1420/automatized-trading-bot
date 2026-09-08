"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { supabaseUrl } from "@/lib/supabase/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { firstError, profileSchema } from "@/lib/validation";

function validateAvatarUrl(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  const prefix = `${supabaseUrl()}/storage/v1/object/public/avatars/${userId}/`;
  return url.startsWith(prefix) && url.length < 500 ? url : null;
}

export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  const parsed = profileSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    bio: formData.get("bio") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const supabase = await createClient();
  const { data: current } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (current && current.username !== parsed.data.username) {
    const { data: available } = await supabase.rpc("is_username_available", { p_username: parsed.data.username });
    if (!available) return { ok: false, error: "Dieser Nutzername ist bereits vergeben.", field: "username" };
  }
  const avatarRaw = formData.get("avatarUrl");
  const update: Record<string, unknown> = {
    username: parsed.data.username,
    display_name: parsed.data.displayName,
    bio: parsed.data.bio,
    website: parsed.data.website || null,
  };
  if (typeof avatarRaw === "string") update.avatar_url = validateAvatarUrl(avatarRaw, user.id);

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    if (error.message.includes("username")) return { ok: false, error: "Dieser Nutzername ist bereits vergeben.", field: "username" };
    return { ok: false, error: "Profil konnte nicht gespeichert werden." };
  }
  revalidatePath("/settings");
  revalidatePath(`/u/${parsed.data.username}`);
  return { ok: true };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  if (error) return { ok: false, error: "Konnte nicht aktualisieren." };
  return { ok: true };
}

/** DSGVO Art. 20: Datenexport als JSON. */
export async function exportMyData(): Promise<ActionResult<string>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  const supabase = await createClient();
  const [profile, games, comments, likes, follows, blocks, reports] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("games").select("*").eq("author_id", user.id),
    supabase.from("comments").select("*").eq("user_id", user.id),
    supabase.from("likes").select("*").eq("user_id", user.id),
    supabase.from("follows").select("*").or(`follower_id.eq.${user.id},following_id.eq.${user.id}`),
    supabase.from("blocks").select("*").eq("blocker_id", user.id),
    supabase.from("reports").select("*").eq("reporter_id", user.id),
  ]);
  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
    profile: profile.data,
    games: games.data ?? [],
    comments: comments.data ?? [],
    likes: likes.data ?? [],
    follows: follows.data ?? [],
    blocks: blocks.data ?? [],
    reports: reports.data ?? [],
  };
  return { ok: true, data: JSON.stringify(payload, null, 2) };
}

/** DSGVO Art. 17: Konto vollständig löschen (inkl. Dateien). */
export async function deleteMyAccount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  if (formData.get("confirm") !== "LÖSCHEN") return { ok: false, error: "Bitte gib LÖSCHEN zur Bestätigung ein.", field: "confirm" };
  if (!isAdminClientConfigured()) {
    return { ok: false, error: "Kontolöschung ist serverseitig nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt)." };
  }
  const admin = createAdminClient();

  for (const bucket of ["avatars", "thumbnails"]) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: "Konto konnte nicht gelöscht werden. Bitte kontaktiere den Support." };

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
