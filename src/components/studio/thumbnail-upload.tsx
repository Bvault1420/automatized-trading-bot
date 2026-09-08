"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { LIMITS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { gradientFor } from "@/lib/utils";
import { Spinner } from "@/components/ui/button";
import { ImageIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface Props {
  userId: string;
  url: string | null;
  onChange: (url: string | null) => void;
  fallbackSeed: string;
  title: string;
}

export function ThumbnailUpload({ userId, url, onChange, fallbackSeed, title }: Props) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return toast("Bitte ein Bild (PNG, JPG, WEBP, GIF) auswählen.", "error");
    if (file.size > LIMITS.thumbnailBytes) return toast("Das Bild darf höchstens 3 MB groß sein.", "error");
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
      const path = `${userId}/thumb-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("thumbnails").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (error) throw error;
      onChange(supabase.storage.from("thumbnails").getPublicUrl(path).data.publicUrl);
    } catch {
      toast("Upload fehlgeschlagen.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-bold leading-tight text-white/90" style={{ background: gradientFor(fallbackSeed) }}>
            {title || "Vorschau"}
          </div>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Spinner className="h-5 w-5" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-white/5">
          <ImageIcon width={16} height={16} /> Bild hochladen
        </button>
        {url && (
          <button type="button" onClick={() => onChange(null)} className="text-left text-xs text-muted hover:text-fg">
            Bild entfernen
          </button>
        )}
        <p className="text-xs text-muted">Ohne Bild wird ein farbiger Platzhalter mit dem Titel angezeigt.</p>
      </div>
    </div>
  );
}
