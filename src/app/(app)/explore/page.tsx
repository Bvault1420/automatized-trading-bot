import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { GameCard, Profile } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { SearchIcon } from "@/components/ui/icons";
import { GameGrid } from "@/components/game/game-grid";

export const metadata: Metadata = { title: "Entdecken" };
export const dynamic = "force-dynamic";

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 60);
  const safeQ = q.replace(/[%_,()"'\\.:]/g, "");
  const supabase = await createClient();

  const [tagsRes, gamesRes, usersRes] = await Promise.all([
    supabase.rpc("trending_tags", { p_limit: 16 }),
    q
      ? supabase.rpc("search_games", { p_query: q, p_limit: 40 })
      : supabase.rpc("get_feed", { p_mode: "foryou", p_limit: 30, p_offset: 0, p_seed: "explore" }),
    q
      ? supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, follower_count")
          .or(`username.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`)
          .eq("is_banned", false)
          .limit(8)
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const tags = (tagsRes.data ?? []) as Array<{ tag: string; cnt: number }>;
  const games = (gamesRes.data ?? []) as GameCard[];
  const users = (usersRes.data ?? []) as Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "follower_count">[];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)] md:pb-10">
      <form action="/explore" className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" width={20} height={20} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Spiele, Tags oder Creator suchen"
          aria-label="Suche"
          maxLength={60}
          autoComplete="off"
          className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </form>

      {tags.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={`/explore?q=${encodeURIComponent(t.tag)}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${q === t.tag ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface hover:bg-surface-2"}`}
            >
              #{t.tag}
            </Link>
          ))}
        </div>
      )}

      {users.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">Creator</h2>
          <ul className="flex flex-wrap gap-2">
            {users.map((u) => (
              <li key={u.id}>
                <Link href={`/u/${u.username}`} className="flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1.5 pr-4 hover:bg-surface-2">
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size={30} />
                  <span className="text-sm">
                    <span className="font-semibold">{u.display_name || u.username}</span>{" "}
                    <span className="text-muted">@{u.username}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">{q ? `Spiele zu „${q}“` : "Beliebt"}</h2>
        <GameGrid games={games} emptyText={q ? "Keine Spiele gefunden." : "Noch keine Spiele veröffentlicht."} />
      </section>
    </div>
  );
}
