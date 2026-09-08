/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { GameCard } from "@/lib/types";
import { formatCount, gradientFor } from "@/lib/utils";
import { HeartIcon, PlayIcon } from "@/components/ui/icons";

interface Props {
  games: Array<Pick<GameCard, "id" | "title" | "thumbnail_url" | "like_count" | "play_count"> & { status?: string; visibility?: string }>;
  emptyText?: string;
  showAuthor?: boolean;
  authorNames?: Record<string, string>;
}

export function GameGrid({ games, emptyText = "Noch keine Spiele." }: Props) {
  if (games.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">{emptyText}</p>;
  }
  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
      {games.map((g) => (
        <li key={g.id} className="relative">
          <Link href={`/g/${g.id}`} className="group relative block aspect-[9/14] overflow-hidden rounded-xl bg-surface-2">
            {g.thumbnail_url ? (
              <img src={g.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-3" style={{ background: gradientFor(g.id) }}>
                <span className="line-clamp-4 text-center text-sm font-bold leading-tight text-white/90">{g.title}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <p className="truncate text-xs font-semibold">{g.title}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/80">
                <span className="inline-flex items-center gap-0.5"><PlayIcon width={11} height={11} />{formatCount(g.play_count)}</span>
                <span className="inline-flex items-center gap-0.5"><HeartIcon width={11} height={11} filled />{formatCount(g.like_count)}</span>
              </div>
            </div>
            {g.status === "draft" && (
              <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Entwurf</span>
            )}
            {g.status === "removed" && (
              <span className="absolute left-2 top-2 rounded-full bg-danger/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Entfernt</span>
            )}
            {g.status === "published" && g.visibility && g.visibility !== "public" && (
              <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {g.visibility === "unlisted" ? "Nicht gelistet" : "Privat"}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
