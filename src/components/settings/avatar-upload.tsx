"use client";

import { useRef, useState } from "react";
import { LIMITS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface Props {
  userId: string;
  name: string;
  initialUrl: string | null;
}

/** Lädt das Avatar direkt in den eigenen Storage-Ordner und übergibt die URL als Hidden-Field. */
export function AvatarUpload({ userId, name, initialUrl }: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return toast("Bitte ein Bild (PNG, JPG, WEBP, GIF) auswählen.", "error");
    if (file.size > LIMITS.avatarBytes) return toast("Das Bild darf höchstens 2 MB groß sein.", "error");
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setUrl(data.publicUrl);
    } catch {
      toast("Upload fehlgeschlagen.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name="avatarUrl" value={url ?? ""} />
      <div className="relative">
        <Avatar src={url} name={name} size={72} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
            <Spinner className="h-6 w-6" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-white/5" disabled={busy}>
          Bild ändern
        </button>
        {url && (
          <button type="button" onClick={() => setUrl(null)} className="text-left text-xs text-muted hover:text-fg">
            Bild entfernen
          </button>
        )}
      </div>
    </div>
  );
}
