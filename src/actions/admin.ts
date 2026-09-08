"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { isUuid } from "@/lib/utils";

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile?.is_admin) throw new Error("forbidden");
  return profile;
}

export async function resolveReport(reportId: string, status: "resolved" | "dismissed"): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (!isUuid(reportId)) return { ok: false, error: "Ungültige Meldung." };
    const supabase = await createClient();
    const { error } = await supabase.from("reports").update({ status, resolved_by: admin.id }).eq("id", reportId);
    if (error) return { ok: false, error: "Aktualisierung fehlgeschlagen." };
    revalidatePath("/admin");
    return { ok: true };
  } catch {
    return { ok: false, error: "Keine Berechtigung." };
  }
}

export async function setGameStatus(gameId: string, status: "published" | "removed"): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!isUuid(gameId)) return { ok: false, error: "Ungültiges Spiel." };
    const supabase = await createClient();
    const { error } = await supabase.from("games").update({ status }).eq("id", gameId);
    if (error) return { ok: false, error: "Aktualisierung fehlgeschlagen." };
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false, error: "Keine Berechtigung." };
  }
}

export async function setUserBanned(userId: string, banned: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (!isUuid(userId)) return { ok: false, error: "Ungültiger Nutzer." };
    if (userId === admin.id) return { ok: false, error: "Du kannst dich nicht selbst sperren." };
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ is_banned: banned }).eq("id", userId);
    if (error) return { ok: false, error: "Aktualisierung fehlgeschlagen." };
    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false, error: "Keine Berechtigung." };
  }
}

export async function adminDeleteComment(commentId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!isUuid(commentId)) return { ok: false, error: "Ungültiger Kommentar." };
    const supabase = await createClient();
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) return { ok: false, error: "Löschen fehlgeschlagen." };
    revalidatePath("/admin");
    return { ok: true };
  } catch {
    return { ok: false, error: "Keine Berechtigung." };
  }
}
