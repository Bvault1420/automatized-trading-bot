"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { ActionResult, Comment } from "@/lib/types";
import { commentSchema, firstError, reportSchema } from "@/lib/validation";
import { isUuid } from "@/lib/utils";

function mapError(message: string): string {
  if (message.includes("Zu viele Anfragen")) return "Zu viele Aktionen in kurzer Zeit. Bitte warte kurz.";
  if (message.includes("gesperrt")) return "Dieses Konto ist gesperrt.";
  if (message.includes("row-level security")) return "Keine Berechtigung für diese Aktion.";
  return "Aktion fehlgeschlagen. Bitte versuche es erneut.";
}

export async function setLike(gameId: string, liked: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  if (!isUuid(gameId)) return { ok: false, error: "Ungültiges Spiel." };
  const supabase = await createClient();
  if (liked) {
    const { error } = await supabase.from("likes").upsert({ user_id: user.id, game_id: gameId }, { ignoreDuplicates: true });
    if (error) return { ok: false, error: mapError(error.message) };
  } else {
    const { error } = await supabase.from("likes").delete().eq("user_id", user.id).eq("game_id", gameId);
    if (error) return { ok: false, error: mapError(error.message) };
  }
  return { ok: true };
}

export async function setFollow(targetUserId: string, follow: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  if (!isUuid(targetUserId)) return { ok: false, error: "Ungültiger Nutzer." };
  if (targetUserId === user.id) return { ok: false, error: "Du kannst dir nicht selbst folgen." };
  const supabase = await createClient();
  if (follow) {
    const { error } = await supabase
      .from("follows")
      .upsert({ follower_id: user.id, following_id: targetUserId }, { ignoreDuplicates: true });
    if (error) return { ok: false, error: mapError(error.message) };
  } else {
    const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId);
    if (error) return { ok: false, error: mapError(error.message) };
  }
  return { ok: true };
}

export async function addComment(gameId: string, body: string): Promise<ActionResult<Comment>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  const parsed = commentSchema.safeParse({ gameId, body });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error).message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .insert({ game_id: parsed.data.gameId, user_id: user.id, body: parsed.data.body })
    .select("*, profiles:user_id(username, display_name, avatar_url)")
    .single();
  if (error) return { ok: false, error: mapError(error.message) };
  return { ok: true, data: data as unknown as Comment };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  if (!isUuid(commentId)) return { ok: false, error: "Ungültiger Kommentar." };
  const supabase = await createClient();
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { ok: false, error: mapError(error.message) };
  return { ok: true };
}

export async function listComments(gameId: string, before?: string): Promise<ActionResult<Comment[]>> {
  if (!isUuid(gameId)) return { ok: false, error: "Ungültiges Spiel." };
  const supabase = await createClient();
  let query = supabase
    .from("comments")
    .select("*, profiles:user_id(username, display_name, avatar_url)")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) return { ok: false, error: "Kommentare konnten nicht geladen werden." };
  return { ok: true, data: (data ?? []) as unknown as Comment[] };
}

export async function setBlock(targetUserId: string, blocked: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an." };
  if (!isUuid(targetUserId) || targetUserId === user.id) return { ok: false, error: "Ungültiger Nutzer." };
  const supabase = await createClient();
  if (blocked) {
    const { error } = await supabase
      .from("blocks")
      .upsert({ blocker_id: user.id, blocked_id: targetUserId }, { ignoreDuplicates: true });
    if (error) return { ok: false, error: mapError(error.message) };
  } else {
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", targetUserId);
    if (error) return { ok: false, error: mapError(error.message) };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function submitReport(input: {
  targetType: "game" | "comment" | "user";
  targetId: string;
  reason: string;
  details: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Bitte melde dich an, um Inhalte zu melden." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error).message };
  const supabase = await createClient();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });
  if (error) return { ok: false, error: mapError(error.message) };
  return { ok: true };
}
