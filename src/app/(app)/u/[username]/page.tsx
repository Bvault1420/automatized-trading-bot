import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { GameCard, Profile } from "@/lib/types";
import { formatCount, safeExternalUrl } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { GameGrid } from "@/components/game/game-grid";
import { ProfileActions } from "@/components/profile/profile-actions";

export const dynamic = "force-dynamic";

async function loadProfile(username: string): Promise<Profile | null> {
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) return { title: "Profil nicht gefunden" };
  return {
    title: `${profile.display_name || profile.username} (@${profile.username})`,
    description: profile.bio || `Spiele von @${profile.username} auf ${APP_NAME}.`,
    openGraph: { title: `@${profile.username}`, description: profile.bio, images: profile.avatar_url ? [profile.avatar_url] : undefined },
  };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const sp = await searchParams;
  const [profile, user] = await Promise.all([loadProfile(username), getCurrentUser()]);
  if (!profile) notFound();
  if (profile.is_banned && user?.id !== profile.id) notFound();

  const isOwner = user?.id === profile.id;
  const tab = isOwner && sp.tab === "liked" ? "liked" : "games";
  const supabase = await createClient();

  let gamesQuery = supabase
    .from("games")
    .select("id, title, thumbnail_url, like_count, play_count, status, visibility")
    .eq("author_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (!isOwner) gamesQuery = gamesQuery.eq("status", "published").in("visibility", ["public", "unlisted"]);

  const [gamesRes, followRes, blockRes, likedRes] = await Promise.all([
    gamesQuery,
    user && !isOwner
      ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user && !isOwner
      ? supabase.from("blocks").select("blocker_id").eq("blocker_id", user.id).eq("blocked_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    tab === "liked"
      ? supabase.from("likes").select("game_id, games:game_id(id, title, thumbnail_url, like_count, play_count)").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(60)
      : Promise.resolve({ data: null }),
  ]);

  const games = (gamesRes.data ?? []) as Array<Pick<GameCard, "id" | "title" | "thumbnail_url" | "like_count" | "play_count"> & { status: string; visibility: string }>;
  const publishedCount = games.filter((g) => g.status === "published").length;
  const liked = ((likedRes.data ?? []) as unknown as Array<{ games: GameCard | null }>).map((r) => r.games).filter((g): g is GameCard => Boolean(g));
  const website = safeExternalUrl(profile.website);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)] md:pb-10">
      <header className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
        <Avatar src={profile.avatar_url} name={profile.display_name || profile.username} size={96} className="ring-4 ring-surface" />
        <div className="mt-4 flex-1 sm:ml-6 sm:mt-1">
          <h1 className="text-2xl font-bold leading-tight">{profile.display_name || profile.username}</h1>
          <p className="text-muted">@{profile.username}{profile.is_banned && <span className="ml-2 rounded bg-danger/20 px-1.5 py-0.5 text-xs text-red-300">gesperrt</span>}</p>
          <div className="mt-3 flex justify-center gap-6 text-sm sm:justify-start">
            <Stat value={publishedCount} label="Spiele" />
            <Stat value={profile.follower_count} label="Follower" />
            <Stat value={profile.following_count} label="Folgt" />
          </div>
          {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px]">{profile.bio}</p>}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-1 inline-block text-sm text-accent hover:underline">
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
          <div className="mt-4">
            <ProfileActions
              profileId={profile.id}
              username={profile.username}
              isOwner={isOwner}
              isLoggedIn={Boolean(user)}
              initiallyFollowing={Boolean(followRes.data)}
              initiallyBlocked={Boolean(blockRes.data)}
            />
          </div>
        </div>
      </header>

      {isOwner && (
        <nav className="mt-8 flex gap-6 border-b border-border text-sm font-semibold" aria-label="Profil-Tabs">
          <Link href={`/u/${profile.username}`} className={`-mb-px border-b-2 pb-2 ${tab === "games" ? "border-fg text-fg" : "border-transparent text-muted"}`}>Meine Spiele</Link>
          <Link href={`/u/${profile.username}?tab=liked`} className={`-mb-px border-b-2 pb-2 ${tab === "liked" ? "border-fg text-fg" : "border-transparent text-muted"}`}>Geliked</Link>
        </nav>
      )}

      <section className="mt-6">
        {tab === "liked" ? (
          <GameGrid games={liked} emptyText="Noch keine Spiele geliked." />
        ) : (
          <GameGrid games={games} emptyText={isOwner ? "Du hast noch kein Spiel erstellt." : "Noch keine Spiele veröffentlicht."} />
        )}
        {isOwner && games.length === 0 && (
          <div className="text-center">
            <Link href="/create" className="inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow">Erstes Spiel erstellen</Link>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span className="font-bold">{formatCount(value)}</span> <span className="text-muted">{label}</span>
    </div>
  );
}
