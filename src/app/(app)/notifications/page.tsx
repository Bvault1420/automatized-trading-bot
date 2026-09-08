import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { markNotificationsRead } from "@/actions/account";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { MarkReadOnMount } from "@/components/notifications/mark-read";

export const metadata: Metadata = { title: "Aktivität" };
export const dynamic = "force-dynamic";

const TEXT: Record<Notification["type"], string> = {
  like: "gefällt dein Spiel",
  comment: "hat dein Spiel kommentiert",
  follow: "folgt dir jetzt",
  remix: "hat dein Spiel geremixt",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*, actor:actor_id(username, display_name, avatar_url), game:game_id(id, title, thumbnail_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);
  const items = (data ?? []) as unknown as Notification[];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)] md:pb-10">
      <MarkReadOnMount action={markNotificationsRead} hasUnread={items.some((n) => !n.read)} />
      <h1 className="text-2xl font-bold">Aktivität</h1>
      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Noch keine Aktivität. Veröffentliche ein Spiel, um Likes und Kommentare zu bekommen.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((n) => {
            const actorName = n.actor?.display_name || n.actor?.username || "Jemand";
            const href = n.game ? `/g/${n.game.id}` : n.actor ? `/u/${n.actor.username}` : "#";
            return (
              <li key={n.id} className={`flex items-center gap-3 py-3 ${n.read ? "" : "bg-accent/5 -mx-2 px-2 rounded-lg"}`}>
                <Link href={n.actor ? `/u/${n.actor.username}` : "#"} className="shrink-0">
                  <Avatar src={n.actor?.avatar_url} name={actorName} size={42} />
                </Link>
                <Link href={href} className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{actorName}</span> {TEXT[n.type]}
                  {n.game && <span className="text-muted"> „{n.game.title}“</span>}
                  <span className="ml-1.5 text-xs text-muted">{timeAgo(n.created_at)}</span>
                </Link>
                {n.game?.thumbnail_url && (
                  <Link href={href} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={n.game.thumbnail_url} alt="" className="h-12 w-9 rounded-md object-cover" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
