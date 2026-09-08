"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CloseIcon } from "@/components/ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Höhe auf Mobilgeräten (Bottom-Sheet). */
  className?: string;
}

/** Bottom-Sheet (mobil) / zentriertes Modal (Desktop). */
export function Sheet({ open, onClose, title, children, className }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Fokus in den Dialog setzen
    const first = panelRef.current?.querySelector<HTMLElement>("input, textarea, button, [tabindex]");
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Schließen" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-sheet relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:max-w-lg sm:rounded-2xl",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
          <h2 className="hidden text-base font-semibold sm:block">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-2.5 hidden h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-fg sm:flex"
            aria-label="Schließen"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        {title && <h2 className="px-4 pt-3 text-base font-semibold sm:hidden">{title}</h2>}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
