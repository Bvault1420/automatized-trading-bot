"use client";

import { useState } from "react";
import { LIMITS } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import { SparklesIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";

const IDEAS = [
  "Ein Spiel, in dem man fallende Donuts mit einem Teller fängt – Bomben ausweichen!",
  "Ein Reaktionsspiel: Tippe nur auf grüne Kreise, rote kosten Zeit.",
  "Ein endloser Runner mit einer springenden Katze und Hindernissen.",
  "Ein Pong gegen eine KI, die mit jedem Punkt schneller wird.",
  "Ein Zen-Spiel: Tippe, um Blasen platzen zu lassen, mit sanften Farben.",
  "Ein Quiz mit 10 Fragen über das Weltall, mit Punktestand.",
];

interface Meta {
  title?: string;
  description?: string;
  tags?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  baseHtml: string;
  onResult: (html: string, meta?: Meta) => void;
}

export function AiGenerator({ open, onClose, baseHtml, onResult }: Props) {
  const [prompt, setPrompt] = useState("");
  const [useBase, setUseBase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, baseHtml: useBase && baseHtml.trim() ? baseHtml : undefined }),
      });
      const json = (await res.json()) as { html?: string; meta?: Meta; error?: string };
      if (!res.ok || !json.html) throw new Error(json.error ?? "Generierung fehlgeschlagen.");
      onResult(json.html, json.meta);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generierung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Spiel mit KI erstellen">
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Beschreibe dein Spiel in ein bis drei Sätzen. Die KI erzeugt ein vollständiges, spielbares HTML-Spiel, das du danach im Editor anpassen kannst.
        </p>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={LIMITS.aiPrompt}
          rows={4}
          placeholder="z. B. Ein Spiel, in dem ein Pixel-Drache Feuerbälle auf anfliegende Ritter schießt. Tippen zum Schießen, Highscore anzeigen."
          disabled={busy}
        />
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setPrompt(idea)}
              className="rounded-full border border-border px-2.5 py-1 text-left text-xs text-muted hover:border-accent hover:text-fg"
              disabled={busy}
            >
              💡 {idea.slice(0, 48)}{idea.length > 48 ? "…" : ""}
            </button>
          ))}
        </div>
        {baseHtml.trim() && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useBase} onChange={(e) => setUseBase(e.target.checked)} className="accent-accent" disabled={busy} />
            Aktuellen Code als Ausgangspunkt verwenden (Remix per KI)
          </label>
        )}
        <FieldError>{error}</FieldError>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{busy ? "Das kann 20–60 Sekunden dauern …" : "Kontingent: begrenzt pro Tag"}</span>
          <Button type="button" onClick={generate} loading={busy} disabled={prompt.trim().length < 3}>
            <SparklesIcon width={16} height={16} /> Generieren
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
