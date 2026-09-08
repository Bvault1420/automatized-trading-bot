"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createGame, updateGame, type GameFormInput } from "@/actions/games";
import { LIMITS } from "@/lib/config";
import { htmlByteLength, IFRAME_ALLOW, IFRAME_SANDBOX } from "@/lib/game-html";
import { BLANK_TEMPLATE, TEMPLATES } from "@/lib/templates";
import type { Game } from "@/lib/types";
import { cn, gradientFor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { CodeIcon, EyeIcon, RefreshIcon, SparklesIcon, UploadIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { ThumbnailUpload } from "@/components/studio/thumbnail-upload";
import { AiGenerator } from "@/components/studio/ai-generator";

interface Props {
  userId: string;
  mode: "new" | "edit" | "remix";
  game?: Game | null;
  aiEnabled: boolean;
}

type Tab = "details" | "code" | "preview";

export function StudioEditor({ userId, mode, game, aiEnabled }: Props) {
  const router = useRouter();
  const toast = useToast();
  const isRemix = mode === "remix" && game;

  const [title, setTitle] = useState(isRemix ? `${game!.title} (Remix)` : game?.title ?? "");
  const [description, setDescription] = useState(game?.description ?? "");
  const [tags, setTags] = useState(game?.tags.join(", ") ?? "");
  const [html, setHtml] = useState(game?.html ?? "");
  const [visibility, setVisibility] = useState<GameFormInput["visibility"]>(mode === "edit" ? game?.visibility ?? "public" : "public");
  const [allowRemix, setAllowRemix] = useState(game?.allow_remix ?? true);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(mode === "edit" ? game?.thumbnail_url ?? null : null);
  const [tab, setTab] = useState<Tab>(mode === "new" ? "details" : "preview");
  const [pending, setPending] = useState<null | "draft" | "published">(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  // HTML that is currently shown in the preview frame; the preview is "dirty" when it differs.
  const [previewedHtml, setPreviewedHtml] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const previewHtmlRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const frameName = `pf-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const bytes = htmlByteLength(html);
  const tooLarge = bytes > LIMITS.htmlBytes;

  const runPreview = useCallback(() => {
    if (!html.trim() || !previewHtmlRef.current || !formRef.current) return;
    previewHtmlRef.current.value = html;
    formRef.current.submit();
    setPreviewedHtml(html);
  }, [html]);
  const dirtyPreview = previewedHtml !== html;

  // Vorschau initial und beim Tab-Wechsel laden
  useEffect(() => {
    if (tab === "preview" || typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      const t = setTimeout(runPreview, 50);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, previewKey]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > LIMITS.htmlBytes) return toast(`Die Datei darf höchstens ${Math.round(LIMITS.htmlBytes / 1000)} KB groß sein.`, "error");
    const text = await file.text();
    setHtml(text);
    if (!title) setTitle(file.name.replace(/\.html?$/i, ""));
    toast("Datei geladen", "success");
    setPreviewKey((k) => k + 1);
  };

  const applyTemplate = (id: string) => {
    if (html.trim() && !confirm("Aktuellen Code durch die Vorlage ersetzen?")) return;
    if (id === "blank") {
      setHtml(BLANK_TEMPLATE);
    } else {
      const t = TEMPLATES.find((x) => x.id === id);
      if (!t) return;
      setHtml(t.html);
      if (!title) setTitle(t.name);
      if (!description) setDescription(t.description);
      if (!tags) setTags(t.tags.join(", "));
    }
    setTab("code");
    setPreviewKey((k) => k + 1);
  };

  const save = async (status: "draft" | "published") => {
    setError(null);
    if (!html.trim()) {
      setError({ message: "Bitte füge zuerst Spielcode hinzu (Vorlage, Datei oder KI).", field: "html" });
      setTab("code");
      return;
    }
    setPending(status);
    const input: GameFormInput = {
      title,
      description,
      html,
      tags,
      visibility,
      status,
      allowRemix,
      remixOf: isRemix ? game!.id : null,
      thumbnailUrl,
    };
    const res = mode === "edit" && game ? await updateGame(game.id, input) : await createGame(input);
    setPending(null);
    if (!res.ok) {
      setError({ message: res.error, field: res.field });
      if (res.field === "title" || res.field === "description" || res.field === "tags") setTab("details");
      if (res.field === "html") setTab("code");
      return;
    }
    toast(status === "published" ? "Spiel veröffentlicht 🎉" : "Entwurf gespeichert", "success");
    router.push(`/g/${res.data!.id}`);
  };

  const fieldError = (f: string) => (error?.field === f ? error.message : null);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-[calc(env(safe-area-inset-top)+12px)] md:pb-10">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">
          {mode === "edit" ? "Spiel bearbeiten" : mode === "remix" ? "Remix erstellen" : "Neues Spiel"}
        </h1>
        {isRemix && (
          <span className="rounded-full bg-accent-2/20 px-2.5 py-1 text-xs font-medium text-accent-2">
            Basierend auf <Link href={`/g/${game!.id}`} className="underline">„{game!.title}“</Link>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => save("draft")} loading={pending === "draft"} disabled={pending !== null}>
            Entwurf
          </Button>
          <Button size="sm" onClick={() => save("published")} loading={pending === "published"} disabled={pending !== null || tooLarge}>
            {mode === "edit" && game?.status === "published" ? "Speichern" : "Veröffentlichen"}
          </Button>
        </div>
      </div>
      {error && !error.field && <FieldError>{error.message}</FieldError>}

      {/* Mobile Tabs */}
      <nav className="mt-4 flex gap-1 rounded-full bg-surface p-1 text-sm font-semibold lg:hidden" aria-label="Editor-Bereiche">
        {(["details", "code", "preview"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("flex-1 rounded-full py-2 transition-colors", tab === t ? "bg-white text-black" : "text-muted hover:text-fg")}
          >
            {t === "details" ? "Details" : t === "code" ? "Code" : "Vorschau"}
          </button>
        ))}
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Details */}
          <section className={cn("space-y-4 rounded-2xl border border-border bg-surface p-4", tab !== "details" && "hidden lg:block")}>
            <div>
              <Label htmlFor="title" hint={`${title.length}/${LIMITS.title}`}>Titel</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.title} placeholder="z. B. Neon Flap" required />
              <FieldError>{fieldError("title")}</FieldError>
            </div>
            <div>
              <Label htmlFor="description" hint={`${description.length}/${LIMITS.description}`}>Beschreibung</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.description} placeholder="Worum geht es? Wie spielt man?" />
              <FieldError>{fieldError("description")}</FieldError>
            </div>
            <div>
              <Label htmlFor="tags" hint={`max. ${LIMITS.tags}, mit Komma trennen`}>Tags</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="arcade, reflex, puzzle" />
              <FieldError>{fieldError("tags")}</FieldError>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="visibility">Sichtbarkeit</Label>
                <Select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as GameFormInput["visibility"])}>
                  <option value="public">Öffentlich (im Feed)</option>
                  <option value="unlisted">Nicht gelistet (nur per Link)</option>
                  <option value="private">Privat (nur ich)</option>
                </Select>
              </div>
              <div className="flex items-end pb-2">
                <Checkbox checked={allowRemix} onChange={(e) => setAllowRemix(e.target.checked)} label="Andere dürfen dieses Spiel remixen" />
              </div>
            </div>
            <div>
              <Label>Vorschaubild <span className="font-normal text-muted">(optional, Hochformat empfohlen)</span></Label>
              <ThumbnailUpload userId={userId} url={thumbnailUrl} onChange={setThumbnailUrl} fallbackSeed={game?.id ?? (title || "neu")} title={title} />
            </div>
            <p className="text-xs text-muted">
              Mit dem Veröffentlichen bestätigst du, dass du die Rechte am Inhalt hast und die{" "}
              <Link href="/legal/community-richtlinien" className="text-accent hover:underline" target="_blank">Community-Richtlinien</Link> einhältst.
            </p>
          </section>

          {/* Code */}
          <section className={cn("space-y-3 rounded-2xl border border-border bg-surface p-4", tab !== "code" && "hidden lg:block")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><CodeIcon width={16} height={16} /> Spielcode (HTML)</h2>
              <span className={cn("text-xs", tooLarge ? "text-danger" : "text-muted")}>{(bytes / 1000).toFixed(1)} / {Math.round(LIMITS.htmlBytes / 1000)} KB</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <UploadIcon width={16} height={16} /> Datei
                </Button>
                {aiEnabled && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAi(true)}>
                    <SparklesIcon width={16} height={16} /> Mit KI erstellen
                  </Button>
                )}
              </div>
            </div>

            {!html.trim() && (
              <div>
                <p className="mb-2 text-sm text-muted">Starte mit einer Vorlage – oder lade deine eigene HTML-Datei hoch:</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <TemplateCard id="blank" name="Leere Vorlage" description="Minimaler Canvas-Starter" onPick={applyTemplate} />
                  {TEMPLATES.map((t) => (
                    <TemplateCard key={t.id} id={t.id} name={t.name} description={t.description} onPick={applyTemplate} />
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const s = el.selectionStart;
                  const v = `${el.value.slice(0, s)}  ${el.value.slice(el.selectionEnd)}`;
                  setHtml(v);
                  requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              placeholder="<!DOCTYPE html> …"
              aria-label="HTML-Code des Spiels"
              className={cn(
                "min-h-[320px] w-full resize-y rounded-xl border border-border bg-black/60 p-3 font-mono text-[12.5px] leading-relaxed text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none",
                html.trim() ? "h-[52vh]" : "h-40",
              )}
            />
            <FieldError>{fieldError("html")}</FieldError>
            <p className="text-xs text-muted">
              Dein Spiel läuft in einer isolierten Sandbox: kein Zugriff auf Cookies, Konten oder fremde Server. Externe Skripte sind nur von
              gängigen CDNs (jsDelivr, unpkg, cdnjs, esm.sh) erlaubt. Für Touch-Steuerung <code className="font-mono">pointerdown</code> nutzen.
            </p>
          </section>
        </div>

        {/* Vorschau */}
        <section className={cn("lg:sticky lg:top-6 lg:self-start", tab !== "preview" && "hidden lg:block")}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><EyeIcon width={16} height={16} /> Vorschau</h2>
            <Button type="button" size="sm" variant={dirtyPreview ? "primary" : "outline"} onClick={runPreview} disabled={!html.trim()}>
              <RefreshIcon width={14} height={14} /> Aktualisieren
            </Button>
          </div>
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[380px] overflow-hidden rounded-[28px] border-4 border-surface-2 bg-black shadow-2xl">
            {html.trim() ? (
              <iframe
                key={frameName}
                name={frameName}
                title="Vorschau"
                sandbox={IFRAME_SANDBOX}
                allow={IFRAME_ALLOW}
                referrerPolicy="no-referrer"
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted" style={{ background: gradientFor(title || "x") }}>
                Wähle eine Vorlage oder füge Code hinzu, um die Vorschau zu sehen.
              </div>
            )}
          </div>
          <form ref={formRef} method="post" action="/embed/preview" target={frameName} className="hidden" aria-hidden="true">
            <textarea ref={previewHtmlRef} name="html" defaultValue="" />
          </form>
        </section>
      </div>

      {aiEnabled && (
        <AiGenerator
          open={showAi}
          onClose={() => setShowAi(false)}
          baseHtml={html}
          onResult={(newHtml, meta) => {
            setHtml(newHtml);
            if (meta?.title && !title) setTitle(meta.title);
            if (meta?.description && !description) setDescription(meta.description);
            if (meta?.tags?.length && !tags) setTags(meta.tags.join(", "));
            setShowAi(false);
            setTab("preview");
            setPreviewKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({ id, name, description, onPick }: { id: string; name: string; description: string; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className="group overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition hover:border-accent"
    >
      <div className="h-16 w-full" style={{ background: gradientFor(id) }} />
      <div className="p-2.5">
        <p className="text-sm font-semibold">{name}</p>
        <p className="line-clamp-2 text-xs text-muted">{description}</p>
      </div>
    </button>
  );
}
