import { NextResponse, type NextRequest } from "next/server";
import { LIMITS } from "@/lib/config";
import { htmlByteLength } from "@/lib/game-html";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { aiPromptSchema, firstError } from "@/lib/validation";

export const maxDuration = 90;

const SYSTEM_PROMPT = `Du bist ein erfahrener HTML5-Spieleentwickler. Du erzeugst vollständige, sofort spielbare Mini-Spiele als EINE einzige HTML-Datei.

Harte Regeln:
- Antworte NUR mit dem HTML-Dokument (beginnend mit <!DOCTYPE html>), ohne Markdown, ohne Erklärungen.
- Alles inline: CSS in <style>, JavaScript in <script>. Keine externen Dateien, keine Netzwerkzugriffe, kein fetch/XHR, keine localStorage-Nutzung.
- Mobile-first: füllt den gesamten Viewport (100vw/100vh), body ohne Margin, overflow hidden, touch-action: none. Nutze devicePixelRatio für scharfe Canvas-Grafik und reagiere auf resize.
- Steuerung per Touch (pointerdown/pointermove) UND Tastatur. Keine alert()/prompt()/confirm().
- Klarer Ablauf: Startbildschirm ("Tippe zum Starten"), Spiel, Game-Over mit Punktestand und Neustart durch Tippen.
- Sauberer, fehlerfreier ES5/ES2015-Code ohne externe Bibliotheken. Keine console.log-Spam.
- Ansprechende Optik: dunkler Hintergrund, kräftige Farben, weiche Glow-Effekte, große lesbare Schrift.
- Maximal ca. 300 Zeilen. Deutsche UI-Texte.

Setze in den <head> zusätzlich diese Meta-Angaben (Werte passend zum Spiel, ohne Anführungszeichen im Inhalt):
<meta name="pf:title" content="Kurzer Spieltitel">
<meta name="pf:description" content="Ein Satz Beschreibung">
<meta name="pf:tags" content="tag1, tag2, tag3">`;

function extractHtml(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/<!doctype html/i);
  if (start > 0) t = t.slice(start);
  return t;
}

function readMeta(html: string, name: string): string | undefined {
  const m = html.match(new RegExp(`<meta[^>]+name=["']pf:${name}["'][^>]+content=["']([^"']*)["']`, "i"));
  return m?.[1]?.trim() || undefined;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "KI-Generator ist nicht konfiguriert." }, { status: 503 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Bitte melde dich an." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = aiPromptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error).message }, { status: 400 });

  // Tageskontingent pro Nutzer (serverseitig in der DB)
  const supabase = await createClient();
  const dailyLimit = Number(process.env.AI_DAILY_LIMIT ?? 20);
  const { error: rlError } = await supabase.rpc("check_rate_limit", { p_action: "ai_generate", p_max: dailyLimit, p_window_seconds: 86400 });
  if (rlError) {
    const limited = rlError.message.includes("Zu viele");
    return NextResponse.json({ error: limited ? "Dein Tageskontingent für KI-Generierungen ist aufgebraucht." : "Kontingent konnte nicht geprüft werden." }, { status: limited ? 429 : 500 });
  }

  const baseUrl = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const messages: Array<{ role: string; content: string }> = [{ role: "system", content: SYSTEM_PROMPT }];
  if (parsed.data.baseHtml) {
    messages.push({
      role: "user",
      content: `Hier ist ein bestehendes Spiel als Ausgangspunkt. Überarbeite es gemäß der folgenden Anweisung und gib das komplette neue HTML zurück.\n\nANWEISUNG: ${parsed.data.prompt}\n\nBESTEHENDER CODE:\n${parsed.data.baseHtml}`,
    });
  } else {
    messages.push({ role: "user", content: `Erstelle dieses Spiel: ${parsed.data.prompt}` });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 80_000);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.8, max_tokens: 8000 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      console.error("AI provider error", res.status, text.slice(0, 500));
      return NextResponse.json({ error: "Der KI-Dienst hat einen Fehler gemeldet. Bitte später erneut versuchen." }, { status: 502 });
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";
    const html = extractHtml(content);
    if (!/<html[\s>]/i.test(html) || !/<script[\s>]/i.test(html)) {
      return NextResponse.json({ error: "Die KI hat kein gültiges Spiel geliefert. Bitte formuliere die Idee anders." }, { status: 502 });
    }
    if (htmlByteLength(html) > LIMITS.htmlBytes) {
      return NextResponse.json({ error: "Das generierte Spiel ist zu groß. Bitte eine einfachere Idee versuchen." }, { status: 502 });
    }
    const meta = {
      title: readMeta(html, "title")?.slice(0, LIMITS.title),
      description: readMeta(html, "description")?.slice(0, LIMITS.description),
      tags: readMeta(html, "tags")?.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, LIMITS.tags),
    };
    return NextResponse.json({ html, meta });
  } catch (e) {
    console.error("AI generation failed", e);
    return NextResponse.json({ error: "Zeitüberschreitung oder Verbindungsfehler beim KI-Dienst." }, { status: 504 });
  }
}
