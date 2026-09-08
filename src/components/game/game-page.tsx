"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setFollow, setLike } from "@/actions/social";
import type { GameCard } from "@/lib/types";
import { cn, formatCount, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, CommentIcon, FlagIcon, HeartIcon, PlayIcon, RemixIcon, ShareIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { GamePlayer } from "@/components/game/game-player";
import { GameGrid } from "@/components/game/game-grid";
import { CommentsSheet } from "@/components/feed/comments-sheet";
import { ReportDialog } from "@/components/feed/report-dialog";
import { ShareSheet } from "@/components/feed/share-sheet";
import { useRequireAuth } from "@/components/auth/use-require-auth";

interface Props {
  game: GameCard;
  viewerId: string | null;
  isLoggedIn: boolean;
  moreFromAuthor: GameCard[];
}

export function GamePage({ game: initial, viewerId, isLoggedIn, moreFromAuthor }: Props) {
  const [game, setGame] = useState(initial);
  const [sheet, setSheet] = useState<null | "comments" | "share" | "report">(null);
  const toast = useToast();
  const router = useRouter();
  const requireAuth = useRequireAuth(isLoggedIn);
  const isOwner = viewerId === game.author_id;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${game.id}` : `/g/${game.id}`;

  const toggleLike = async () => {
    if (!requireAuth("Melde dich an, um Spiele zu liken.")) return;
    const liked = !game.liked_by_me;
    setGame((g) => ({ ...g, liked_by_me: liked, like_count: Math.max(0, g.like_count + (liked ? 1 : -1)) }));
    const res = await setLike(game.id, liked);
    if (!res.ok) {
      setGame((g) => ({ ...g, liked_by_me: !liked, like_count: Math.max(0, g.like_count + (liked ? -1 : 1)) }));
      toast(res.error, "error");
    }
  };

  const toggleFollow = async () => {
    if (!requireAuth("Melde dich an, um zu folgen.")) return;
    const follow = !game.following_author;
    setGame((g) => ({ ...g, following_author: follow }));
    const res = await setFollow(game.author_id, follow);
    if (!res.ok) {
      setGame((g) => ({ ...g, following_author: !follow }));
      toast(res.error, "error");
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: game.title, url: shareUrl });
        return;
      } catch {
        /* Fallback */
      }
    }
    setSheet("share");
  };

  const unavailable = game.status !== "published";

  return (
    <div className="mx-auto w-full max-w-6xl px-0 pb-24 md:px-6 md:pb-10 md:pt-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="relative aspect-[9/16] max-h-[calc(100dvh-56px)] w-full overflow-hidden bg-black sm:aspect-auto sm:h-[70vh] md:rounded-2xl">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
              className="absolute left-3 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 md:hidden"
              aria-label="Zurück"
            >
              <ChevronLeftIcon />
            </button>
            {unavailable ? (
              <div className="flex h-full items-center justify-center p-8 text-center text-muted">
                Dieses Spiel ist derzeit nicht verfügbar{isOwner ? " (Entwurf oder entfernt)." : "."}
              </div>
            ) : (
              <GamePlayer gameId={game.id} title={game.title} thumbnailUrl={game.thumbnail_url} active immediate />
            )}
          </div>

          <div className="px-4 pt-4 md:px-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/u/${game.author_username}`} className="flex items-center gap-3">
                <Avatar src={game.author_avatar_url} name={game.author_display_name || game.author_username} size={44} />
                <div>
                  <p className="font-semibold leading-tight">{game.author_display_name || game.author_username}</p>
                  <p className="text-sm text-muted">@{game.author_username} · {timeAgo(game.created_at)}</p>
                </div>
              </Link>
              {!isOwner && (
                <Button size="sm" variant={game.following_author ? "outline" : "primary"} onClick={toggleFollow} className="ml-auto">
                  {game.following_author ? "Folge ich" : "Folgen"}
                </Button>
              )}
              {isOwner && (
                <Link href={`/create/${game.id}`} className="ml-auto rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-white/5">
                  Bearbeiten
                </Link>
              )}
            </div>

            <h1 className="mt-4 text-2xl font-bold leading-tight">{game.title}</h1>
            {game.description && <p className="mt-2 whitespace-pre-wrap text-[15px] text-white/85">{game.description}</p>}
            {game.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {game.tags.map((t) => (
                  <Link key={t} href={`/explore?q=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-border">
                    #{t}
                  </Link>
                ))}
              </div>
            )}
            {game.remix_of && (
              <Link href={`/g/${game.remix_of}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
                <RemixIcon width={16} height={16} /> Remix eines anderen Spiels ansehen
              </Link>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant={game.liked_by_me ? "primary" : "secondary"} onClick={toggleLike} aria-pressed={game.liked_by_me}>
                <HeartIcon filled={game.liked_by_me} width={18} height={18} /> {formatCount(game.like_count)}
              </Button>
              <Button variant="secondary" onClick={() => setSheet("comments")}>
                <CommentIcon width={18} height={18} /> {formatCount(game.comment_count)}
              </Button>
              <Button variant="secondary" onClick={share}>
                <ShareIcon width={18} height={18} /> Teilen
              </Button>
              {game.allow_remix && (
                <Button variant="secondary" onClick={() => requireAuth("Melde dich an, um zu remixen.") && router.push(`/create/remix/${game.id}`)}>
                  <RemixIcon width={18} height={18} /> Remixen
                </Button>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted">
                <PlayIcon width={14} height={14} /> {formatCount(game.play_count)} Plays
              </span>
              {!isOwner && (
                <button
                  type="button"
                  onClick={() => requireAuth("Melde dich an, um zu melden.") && setSheet("report")}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:text-fg")}
                >
                  <FlagIcon width={14} height={14} /> Melden
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="px-4 md:px-0">
          <h2 className="mb-3 text-sm font-semibold text-muted">Mehr von @{game.author_username}</h2>
          <GameGrid games={moreFromAuthor} emptyText="Keine weiteren Spiele." />
        </aside>
      </div>

      <CommentsSheet
        open={sheet === "comments"}
        onClose={() => setSheet(null)}
        gameId={game.id}
        gameAuthorId={game.author_id}
        viewerId={viewerId}
        isLoggedIn={isLoggedIn}
        commentCount={game.comment_count}
        onCountChange={(d) => setGame((g) => ({ ...g, comment_count: Math.max(0, g.comment_count + d) }))}
      />
      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} url={shareUrl} title={game.title} />
      <ReportDialog open={sheet === "report"} onClose={() => setSheet(null)} targetType="game" targetId={game.id} />
    </div>
  );
}
