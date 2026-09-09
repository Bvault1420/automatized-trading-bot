import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { Report } from "@/lib/types";
import { AdminReports, type ReportRow } from "@/components/admin/admin-reports";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/admin");
  if (!profile.is_admin) notFound();

  const params = await searchParams;
  const status = params.status === "resolved" || params.status === "dismissed" ? params.status : "open";
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("*, reporter:reporter_id(username)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (data ?? []) as unknown as Report[];

  // Zielobjekte für Kontext nachladen
  const gameIds = reports.filter((r) => r.target_type === "game").map((r) => r.target_id);
  const commentIds = reports.filter((r) => r.target_type === "comment").map((r) => r.target_id);
  const userIds = reports.filter((r) => r.target_type === "user").map((r) => r.target_id);

  const [games, comments, users] = await Promise.all([
    gameIds.length ? supabase.from("games").select("id, title, status, author_id, profiles:author_id(username, is_banned)").in("id", gameIds) : { data: [] },
    commentIds.length ? supabase.from("comments").select("id, body, user_id, game_id, profiles:user_id(username, is_banned)").in("id", commentIds) : { data: [] },
    userIds.length ? supabase.from("profiles").select("id, username, is_banned").in("id", userIds) : { data: [] },
  ]);

  type G = { id: string; title: string; status: string; author_id: string; profiles: { username: string; is_banned: boolean } | null };
  type C = { id: string; body: string; user_id: string; game_id: string; profiles: { username: string; is_banned: boolean } | null };
  type U = { id: string; username: string; is_banned: boolean };
  const gMap = new Map(((games.data ?? []) as unknown as G[]).map((g) => [g.id, g]));
  const cMap = new Map(((comments.data ?? []) as unknown as C[]).map((c) => [c.id, c]));
  const uMap = new Map(((users.data ?? []) as unknown as U[]).map((u) => [u.id, u]));

  const rows: ReportRow[] = reports.map((r) => {
    if (r.target_type === "game") {
      const g = gMap.get(r.target_id);
      return { report: r, label: g ? `Spiel „${g.title}“` : "Spiel (gelöscht)", href: g ? `/g/${g.id}` : null, ownerId: g?.author_id ?? null, ownerName: g?.profiles?.username ?? null, ownerBanned: g?.profiles?.is_banned ?? false, gameStatus: g?.status ?? null, commentId: null };
    }
    if (r.target_type === "comment") {
      const c = cMap.get(r.target_id);
      return { report: r, label: c ? `Kommentar: „${c.body.slice(0, 120)}“` : "Kommentar (gelöscht)", href: c ? `/g/${c.game_id}` : null, ownerId: c?.user_id ?? null, ownerName: c?.profiles?.username ?? null, ownerBanned: c?.profiles?.is_banned ?? false, gameStatus: null, commentId: c?.id ?? null };
    }
    const u = uMap.get(r.target_id);
    return { report: r, label: u ? `Nutzer @${u.username}` : "Nutzer (gelöscht)", href: u ? `/u/${u.username}` : null, ownerId: u?.id ?? null, ownerName: u?.username ?? null, ownerBanned: u?.is_banned ?? false, gameStatus: null, commentId: null };
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)] md:pb-10">
      <h1 className="text-2xl font-bold">Moderation</h1>
      <p className="mt-1 text-sm text-muted">Meldungen aus der Community. Bitte Entscheidungen konsistent nach den Community-Richtlinien treffen.</p>
      <AdminReports rows={rows} status={status} />
    </div>
  );
}
