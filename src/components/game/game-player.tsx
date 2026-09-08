"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { IFRAME_ALLOW, IFRAME_SANDBOX } from "@/lib/game-html";
import { createClient } from "@/lib/supabase/client";
import { cn, gradientFor } from "@/lib/utils";
import { CloseIcon, ExpandIcon, PlayIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/button";

interface Props {
  gameId: string;
  title: string;
  thumbnailUrl: string | null;
  /** Nur die aktive Karte lädt das Spiel. */
  active: boolean;
  /** Direkt spielbar ohne "Tippen zum Spielen" (z. B. auf der Spiel-Seite). */
  immediate?: boolean;
  className?: string;
  onPlayingChange?: (playing: boolean) => void;
}

export function GamePlayer({ gameId, title, thumbnailUrl, active, immediate = false, className, onPlayingChange }: Props) {
  const [playing, setPlaying] = useState(immediate);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const recorded = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Reset when the card scrolls out of view (state adjustment during render, no extra effect pass).
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) {
      setPlaying(immediate);
      setLoaded(false);
    }
  }
  useEffect(() => {
    if (!active) recorded.current = false;
  }, [active]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  const recordPlay = useCallback(() => {
    if (recorded.current) return;
    recorded.current = true;
    createClient()
      .rpc("record_play", { p_game_id: gameId })
      .then(() => undefined, () => undefined);
  }, [gameId]);

  useEffect(() => {
    if (active && immediate && loaded) recordPlay();
  }, [active, immediate, loaded, recordPlay]);

  const start = () => {
    setPlaying(true);
    recordPlay();
  };

  const stop = () => {
    setPlaying(false);
    setReloadKey((k) => k + 1);
    setLoaded(false);
  };

  const fullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div ref={wrapperRef} className={cn("relative h-full w-full overflow-hidden bg-black", className)}>
      {/* Poster */}
      <div
        aria-hidden={playing}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          playing && loaded ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-10" style={{ background: gradientFor(gameId) }}>
            <h2 className="text-center text-3xl font-extrabold leading-tight text-white/90 drop-shadow-lg md:text-4xl">{title}</h2>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      </div>

      {/* Spiel */}
      {active && (
        <iframe
          key={reloadKey}
          title={`Spiel: ${title}`}
          src={`/embed/${gameId}`}
          sandbox={IFRAME_SANDBOX}
          allow={IFRAME_ALLOW}
          referrerPolicy="no-referrer"
          loading="eager"
          onLoad={() => setLoaded(true)}
          className={cn("absolute inset-0 h-full w-full border-0 bg-black", !playing && "pointer-events-none")}
          tabIndex={playing ? 0 : -1}
        />
      )}

      {/* Start-Overlay */}
      {active && !playing && (
        <button
          type="button"
          onClick={start}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white"
          aria-label={`${title} spielen`}
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30 transition-transform active:scale-95">
            {loaded ? <PlayIcon width={40} height={40} className="ml-1" /> : <Spinner className="h-8 w-8" />}
          </span>
          <span className="rounded-full bg-black/40 px-3 py-1 text-sm font-medium backdrop-blur">
            {loaded ? "Tippen zum Spielen" : "Lädt …"}
          </span>
        </button>
      )}

      {/* Steuerung während des Spielens */}
      {active && playing && !immediate && (
        <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+12px)] flex gap-2">
          <button
            type="button"
            onClick={stop}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
            aria-label="Spiel beenden"
          >
            <CloseIcon width={18} height={18} />
          </button>
          <button
            type="button"
            onClick={fullscreen}
            className="hidden h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70 sm:flex"
            aria-label="Vollbild"
          >
            <ExpandIcon width={18} height={18} />
          </button>
        </div>
      )}
      {active && playing && immediate && (
        <button
          type="button"
          onClick={fullscreen}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
          aria-label="Vollbild"
        >
          <ExpandIcon width={18} height={18} />
        </button>
      )}
    </div>
  );
}
