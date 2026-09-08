"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { ActionResult, Game } from "@/lib/types";
import { firstError, gameSchema, parseTags } from "@/lib/validation";
import { supabaseUrl } from "@/lib/supabase/env";

export interface GameFormInput {
  title: string;
  description: string;
  html: string;
  tags: string;
  visibility: "public" | "unlisted" | "private";
  status: "draft" | "published";
  allowRemix: boolean;
  remixOf?: string | null;
  thumbnailUrl?: string | null;
}

/** Nur Bilder aus dem eigenen Storage-Ordner akzeptieren. */
function validateThumbnailUrl(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  const prefix = `${supabaseUrl()}/storage/v1/object/public/thumbnails/${userId}/`;
  return url.startsWith(prefix) && url.length < 500 ? url : null;
}

function mapGameError(message: string): string {
  if (message.includes("Zu viele Anfragen")) return "Zu viele Uploads in kurzer Zeit. Bitte warte kurz.";
  if (message.includes("gesperrt")) return "Dieses Konto ist gesperrt.";
  if (message.includes("html_size")) return "Der Spielcode ist zu groß.";
  if (message.includes("row-level security")) return "Keine Berechtigung für diese Aktion.";
  return "Speichern fehlgeschlagen. Bitte versuche es erneut.";
}

export async function createGame(input: GameFormInput): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };

  const parsed = gameSchema.safeParse({ ...input, tags: parseTags(input.tags) });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .insert({
      author_id: user.id,
      title: d.title,
      description: d.description,
      html: d.html,
      tags: d.tags,
      visibility: d.visibility,
      status: d.status,
      allow_remix: d.allowRemix,
      remix_of: d.remixOf ?? null,
      thumbnail_url: validateThumbnailUrl(input.thumbnailUrl, user.id),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapGameError(error.message) };
  revalidatePath("/");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateGame(id: string, input: GameFormInput): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };

  const parsed = gameSchema.safeParse({ ...input, tags: parseTags(input.tags), remixOf: null });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .update({
      title: d.title,
      description: d.description,
      html: d.html,
      tags: d.tags,
      visibility: d.visibility,
      status: d.status,
      allow_remix: d.allowRemix,
      thumbnail_url: validateThumbnailUrl(input.thumbnailUrl, user.id),
    })
    .eq("id", id)
    .eq("author_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: mapGameError(error.message) };
  if (!data) return { ok: false, error: "Spiel nicht gefunden oder keine Berechtigung." };
  revalidatePath("/");
  revalidatePath(`/g/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteGame(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  const supabase = await createClient();
  const { error } = await supabase.from("games").delete().eq("id", id).eq("author_id", user.id);
  if (error) return { ok: false, error: "Löschen fehlgeschlagen." };
  revalidatePath("/");
  return { ok: true };
}

/** Lädt ein Spiel zum Bearbeiten (nur Autor) oder zum Remixen (wenn erlaubt). */
export async function loadGameForStudio(id: string, mode: "edit" | "remix"): Promise<ActionResult<Game>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Spiel nicht gefunden." };
  const game = data as Game;
  if (mode === "edit" && game.author_id !== user.id) return { ok: false, error: "Keine Berechtigung." };
  if (mode === "remix" && game.author_id !== user.id && (!game.allow_remix || game.status !== "published")) {
    return { ok: false, error: "Dieses Spiel darf nicht remixt werden." };
  }
  return { ok: true, data: game };
}
