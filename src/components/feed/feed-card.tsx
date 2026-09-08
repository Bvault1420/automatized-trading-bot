"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { deleteGame } from "@/actions/games";
import { setBlock, setFollow, setLike } from "@/actions/social";
import type { GameCard } from "@/lib/types";
import { cn, formatCount } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { CommentIcon, EditIcon, FlagIcon, HeartIcon, LinkIcon, MoreIcon, PlusIcon, RemixIcon, ShareIcon, TrashIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { GamePlayer } from "@/components/game/game-player";
import { CommentsSheet } from "@/components/feed/comments-sheet";
import { ReportDialog } from "@/components/feed/report-dialog";
import { ShareSheet } from "@/components/feed/share-sheet";
import { useRequireAuth } from "@/components/auth/use-require-auth";

interface Props {
  game: GameCard;
  active: boolean;
  near: boolean;
  viewerId: string | null;
  isLoggedIn: boolean;
  onUpdate: (id: string, patch: Partial<GameCard>) => void;
  onRemove: (id: string) => void;
  onAuthorFollow: (authorId: string, following: boolean) => void;
  onNext?: () => void;
}

export function FeedCard({ game, active, viewerId, isLoggedIn, onUpdate, onRemove, onAuthorFollow }: Props) {
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState<null | "comments" | "share" | "more" | "report">(null);
  const [heartBurst, setHeartBurst] = useState(0);
  const toast = useToast();
  const router = useRouter();
  const requireAuth = useRequireAuth(isLoggedIn);
  const isOwner = viewerId === game.author_id;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${game.id}` : `/g/${game.id}`;

  const toggleLike = async () => {
    if (!requireAuth("Melde dich an, um Spiele zu liken.")) return;
    const liked = !game.liked_by_me;
    onUpdate(game.id, { liked_by_me: liked, like_count: Math.max(0, game.like_count + (liked ? 1 : -1)) });
    if (liked) setHeartBurst((n) => n + 1);
    const res = await setLike(game.id, liked);
    if (!res.ok) {
      onUpdate(game.id, { liked_by_me: !liked, like_count: game.like_count });
      toast(res.error, "error");
    }
  };

  const toggleFollow = async () => {
    if (!requireAuth("Melde dich an, um zu folgen.")) return;
    const follow = !game.following_author;
    onAuthorFollow(game.author_id, follow);
    const res = await setFollow(game.author_id, follow);
    if (!res.ok) {
      onAuthorFollow(game.author_id, !follow);
      toast(res.error, "error");
    } else if (follow) {
      toast(`Du folgst jetzt @${game.author_username}`, "success");
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: game.title, text: `Spiel „${game.title}“`, url: shareUrl });
        return;
      } catch {
        // Abgebrochen oder nicht unterstützt → Fallback
      }
    }
    setSheet("share");
  };

  const remix = () => {
    if (!requireAuth("Melde dich an, um zu remixen.")) return;
    router.push(`/create/remix/${game.id}`);
  };

  const block = async () => {
    if (!requireAuth()) return;
    const res = await setBlock(game.author_id, true);
    if (!res.ok) return toast(res.error, "error");
    toast(`@${game.author_username} blockiert`, "success");
    setSheet(null);
    onRemove(game.id);
  };

  const remove = async () => {
    if (!confirm("Dieses Spiel wirklich löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const res = await deleteGame(game.id);
    if (!res.ok) return toast(res.error, "error");
    toast("Spiel gelöscht", "success");
    setSheet(null);
    onRemove(game.id);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("Link kopiert", "success");
    } catch {
      toast("Kopieren nicht möglich", "error");
    }
    setSheet(null);
  };

  const handlePlaying = useCallback((p: boolean) => setPlaying(p), []);

  return (
    <div className="relative flex h-full w-full justify-center bg-black">
      <div className="relative h-full w-full pb-[calc(56px+env(safe-area-inset-bottom))] md:max-w-[600px] md:py-3">
        <GamePlayer
          gameId={game.id}
          title={game.title}
          thumbnailUrl={game.thumbnail_url}
          active={active}
          onPlayingChange={handlePlaying}
          className="md:rounded-2xl"
        />

        {/* Herz-Animation */}
        {heartBurst > 0 && (
          <div key={heartBurst} className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <HeartIcon filled width={120} height={120} className="animate-heart text-accent drop-shadow-2xl" />
          </div>
        )}

        {/* Info unten links */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] pr-20 transition-opacity duration-200 md:bottom-3",
            playing ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="pointer-events-auto bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-16 md:rounded-b-2xl">
            <Link href={`/u/${game.author_username}`} className="inline-flex items-center gap-2 font-semibold hover:underline">
              <span className="text-[15px]">@{game.author_username}</span>
            </Link>
            <h2 className="mt-1 text-lg font-bold leading-tight">{game.title}</h2>
            {game.description && <p className="mt-1 line-clamp-2 text-sm text-white/85">{game.description}</p>}
            {game.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {game.tags.slice(0, 5).map((t) => (
                  <Link key={t} href={`/explore?q=${encodeURIComponent(t)}`} className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium hover:bg-white/20">
                    #{t}
                  </Link>
                ))}
              </div>
            )}
            {game.remix_of && (
              <Link href={`/g/${game.remix_of}`} className="mt-2 inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
                <RemixIcon width={14} height={14} /> Remix eines anderen Spiels
              </Link>
            )}
          </div>
        </div>

        {/* Aktionsleiste rechts */}
        <div className="absolute bottom-[calc(56px+env(safe-area-inset-bottom)+16px)] right-2 flex flex-col items-center gap-4 md:bottom-6 md:right-[-64px]">
          <div className="relative mb-1">
            <Link href={`/u/${game.author_username}`} aria-label={`Profil von @${game.author_username}`}>
              <Avatar src={game.author_avatar_url} name={game.author_display_name || game.author_username} size={44} className="ring-2 ring-white" />
            </Link>
            {!isOwner && !game.following_author && (
              <button
                type="button"
                onClick={toggleFollow}
                aria-label={`@${game.author_username} folgen`}
                className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-white shadow"
              >
                <PlusIcon width={12} height={12} strokeWidth={3} />
              </button>
            )}
          </div>

          <RailButton onClick={toggleLike} label={game.liked_by_me ? "Like entfernen" : "Liken"} count={game.like_count} pressed={game.liked_by_me}>
            <HeartIcon filled={game.liked_by_me} className={cn(game.liked_by_me ? "text-accent" : "text-white", game.liked_by_me && "animate-pop")} width={30} height={30} />
          </RailButton>
          <RailButton onClick={() => setSheet("comments")} label="Kommentare" count={game.comment_count}>
            <CommentIcon width={28} height={28} filled className="text-white" />
          </RailButton>
          <RailButton onClick={share} label="Teilen">
            <ShareIcon width={28} height={28} className="text-white" />
          </RailButton>
          {game.allow_remix && (
            <RailButton onClick={remix} label="Remixen">
              <RemixIcon width={26} height={26} className="text-white" />
            </RailButton>
          )}
          <RailButton onClick={() => setSheet("more")} label="Mehr">
            <MoreIcon width={26} height={26} className="text-white" />
          </RailButton>
        </div>
      </div>

      <CommentsSheet
        open={sheet === "comments"}
        onClose={() => setSheet(null)}
        gameId={game.id}
        gameAuthorId={game.author_id}
        viewerId={viewerId}
        isLoggedIn={isLoggedIn}
        commentCount={game.comment_count}
        onCountChange={(d) => onUpdate(game.id, { comment_count: Math.max(0, game.comment_count + d) })}
      />
      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} url={shareUrl} title={game.title} />
      <ReportDialog open={sheet === "report"} onClose={() => setSheet(null)} targetType="game" targetId={game.id} />

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="Optionen">
        <ul className="p-2 text-sm">
          <MenuItem icon={<LinkIcon width={18} height={18} />} onClick={copyLink}>Link kopieren</MenuItem>
          <MenuItem icon={<PlusIcon width={18} height={18} />} href={`/g/${game.id}`}>Spielseite öffnen</MenuItem>
          {isOwner ? (
            <>
              <MenuItem icon={<EditIcon width={18} height={18} />} href={`/create/${game.id}`}>Bearbeiten</MenuItem>
              <MenuItem icon={<TrashIcon width={18} height={18} />} onClick={remove} danger>Löschen</MenuItem>
            </>
          ) : (
            <>
              <MenuItem icon={<FlagIcon width={18} height={18} />} onClick={() => (requireAuth("Melde dich an, um zu melden.") ? setSheet("report") : undefined)}>
                Melden
              </MenuItem>
              <MenuItem icon={<TrashIcon width={18} height={18} />} onClick={block} danger>
                @{game.author_username} blockieren
              </MenuItem>
            </>
          )}
        </ul>
      </Sheet>
    </div>
  );
}

function RailButton({
  children,
  label,
  count,
  onClick,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex flex-col items-center gap-0.5 text-white drop-shadow transition-transform active:scale-90"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">{children}</span>
      {typeof count === "number" && <span className="text-xs font-semibold">{formatCount(count)}</span>}
    </button>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  href,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const cls = cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium hover:bg-white/5",
    danger ? "text-red-400" : "text-fg",
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {icon}
          {children}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {icon}
          {children}
        </button>
      )}
    </li>
  );
}
