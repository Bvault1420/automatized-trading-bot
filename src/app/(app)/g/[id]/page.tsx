import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { GamePage } from "@/components/game/game-page";

export const dynamic = "force-dynamic";

async function loadCard(id: string): Promise<GameCard | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("game_cards").select("*").eq("id", id).maybeSingle();
  return (data as GameCard | null) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/g/[id]">): Promise<Metadata> {
  const { id } = await params;
  const game = await loadCard(id);
  if (!game) return { title: "Spiel nicht gefunden" };
  const title = `${game.title} von @${game.author_username}`;
  const description = game.description || `Spiele „${game.title}“ direkt im Browser auf ${APP_NAME}.`;
  return {
    title,
    description,
    openGraph: { title, description, images: game.thumbnail_url ? [game.thumbnail_url] : undefined, type: "website" },
    twitter: { card: game.thumbnail_url ? "summary_large_image" : "summary", title, description },
    robots: game.visibility === "public" && game.status === "published" ? undefined : { index: false, follow: false },
  };
}

export default async function Page({ params }: PageProps<"/g/[id]">) {
  const { id } = await params;
  const [game, user] = await Promise.all([loadCard(id), getCurrentUser()]);
  if (!game) notFound();

  const supabase = await createClient();
  const { data: more } = await supabase
    .from("game_cards")
    .select("id, title, thumbnail_url, like_count, play_count")
    .eq("author_id", game.author_id)
    .eq("status", "published")
    .eq("visibility", "public")
    .neq("id", game.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return <GamePage game={game} viewerId={user?.id ?? null} isLoggedIn={Boolean(user)} moreFromAuthor={(more ?? []) as GameCard[]} />;
}
