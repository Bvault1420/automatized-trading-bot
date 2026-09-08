"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FEED_PAGE_SIZE } from "@/lib/config";
import type { GameCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/button";
import { FeedCard } from "@/components/feed/feed-card";

type Mode = "foryou" | "following" | "new";

interface Props {
  initialItems: GameCard[];
  mode: Mode;
  seed: string;
  viewerId: string | null;
  isLoggedIn: boolean;
}

export function Feed({ initialItems, mode, seed, viewerId, isLoggedIn }: Props) {
  const [items, setItems] = useState<GameCard[]>(initialItems);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialItems.length < FEED_PAGE_SIZE);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const offsetRef = useRef(initialItems.length);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?mode=${mode}&offset=${offsetRef.current}&seed=${encodeURIComponent(seed)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("feed");
      const json = (await res.json()) as { items: GameCard[] };
      offsetRef.current += json.items.length;
      if (json.items.length < FEED_PAGE_SIZE) setDone(true);
      setItems((prev) => {
        const fresh = json.items.filter((g) => !prev.some((x) => x.id === g.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    } catch {
      setDone(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [done, mode, seed]);

  // Aktive Karte per IntersectionObserver bestimmen
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  // Nachladen, wenn das Ende näher kommt
  useEffect(() => {
    if (activeIndex >= items.length - 3) void loadMore();
  }, [activeIndex, items.length, loadMore]);

  const scrollTo = useCallback((index: number) => {
    const el = cardRefs.current[index];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Tastatur-Navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
        e.preventDefault();
        scrollTo(Math.min(items.length - 1, activeIndex + 1));
      } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
        e.preventDefault();
        scrollTo(Math.max(0, activeIndex - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, items.length, scrollTo]);

  const updateItem = useCallback((id: string, patch: Partial<GameCard>) => {
    setItems((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const updateAuthor = useCallback((authorId: string, following: boolean) => {
    setItems((prev) => prev.map((g) => (g.author_id === authorId ? { ...g, following_author: following } : g)));
  }, []);

  if (items.length === 0) {
    return <EmptyFeed mode={mode} isLoggedIn={isLoggedIn} />;
  }

  return (
    <div className="relative h-dvh">
      <div ref={scrollerRef} className="feed-scroller no-scrollbar h-full overflow-y-scroll">
        {items.map((game, index) => (
          <section
            key={game.id}
            data-index={index}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className="feed-card h-dvh w-full"
            aria-label={game.title}
          >
            <FeedCard
              game={game}
              active={index === activeIndex}
              near={Math.abs(index - activeIndex) <= 1}
              viewerId={viewerId}
              isLoggedIn={isLoggedIn}
              onUpdate={updateItem}
              onRemove={removeItem}
              onAuthorFollow={updateAuthor}
              onNext={() => scrollTo(Math.min(items.length - 1, index + 1))}
            />
          </section>
        ))}
        {loading && (
          <div className="flex h-24 items-center justify-center text-muted">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {done && items.length > 0 && (
          <div className="feed-card flex h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="text-lg font-semibold">Du hast alles gesehen 🎉</p>
            <p className="text-sm text-muted">Schau später wieder vorbei oder erstelle selbst ein Spiel.</p>
            <Link href="/create" className="mt-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow">
              Spiel erstellen
            </Link>
          </div>
        )}
      </div>

      {/* Desktop-Navigation */}
      <div className="pointer-events-none absolute inset-y-0 right-4 hidden flex-col items-center justify-center gap-3 lg:flex">
        <button
          type="button"
          onClick={() => scrollTo(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          className={cn(
            "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg shadow-lg transition hover:bg-border disabled:opacity-30",
          )}
          aria-label="Vorheriges Spiel"
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          onClick={() => scrollTo(Math.min(items.length - 1, activeIndex + 1))}
          disabled={activeIndex >= items.length - 1}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg shadow-lg transition hover:bg-border disabled:opacity-30"
          aria-label="Nächstes Spiel"
        >
          <ChevronDownIcon />
        </button>
      </div>
    </div>
  );
}

function EmptyFeed({ mode, isLoggedIn }: { mode: Mode; isLoggedIn: boolean }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="mb-2 inline-block h-12 w-12 rounded-2xl bg-gradient-to-br from-accent to-accent-2 shadow-glow" />
      {mode === "following" ? (
        <>
          <p className="text-lg font-semibold">Noch nichts von Leuten, denen du folgst</p>
          <p className="text-sm text-muted">
            {isLoggedIn ? "Folge Creator*innen, um ihre neuen Spiele hier zu sehen." : "Melde dich an, um Creator*innen zu folgen."}
          </p>
          <Link href={isLoggedIn ? "/explore" : "/login"} className="mt-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow">
            {isLoggedIn ? "Entdecken" : "Anmelden"}
          </Link>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">Noch keine Spiele im Feed</p>
          <p className="text-sm text-muted">Sei die erste Person, die ein Spiel veröffentlicht.</p>
          <Link href="/create" className="mt-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow">
            Spiel erstellen
          </Link>
        </>
      )}
    </div>
  );
}
