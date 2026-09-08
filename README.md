# Playfeed – der TikTok-Feed für Mini-Spiele

Vertikal scrollen, sofort spielen, liken, kommentieren, folgen, remixen. Spiele sind
eigenständige HTML5-Dateien, die in einer streng abgeschotteten Sandbox laufen. Creator*innen
bauen sie im Studio aus Vorlagen, per Upload oder (optional) per KI.

**Stack:** Next.js 16 (App Router, Server Actions, Proxy), React 19, TypeScript, Tailwind CSS 4,
Supabase (Postgres, Auth, Storage, RLS), Zod, Vitest.

---

## Funktionen

| Bereich | Details |
| --- | --- |
| Feed | Scroll-Snap-Vollbild-Karten, Tabs „Für dich“ / „Folge ich“ / „Neu“, Endlos-Nachladen, Tastatur-Navigation, nur die aktive Karte lädt das Spiel |
| Spiele | Sandboxed `<iframe>` (ohne `allow-same-origin`), eigene restriktive CSP, Play-Zähler, Vollbild, Share-Sheet, Remix |
| Social | Likes, Kommentare, Follows, Blockieren, Melden, Benachrichtigungen (Like/Kommentar/Follow/Remix) |
| Konten | E-Mail + Passwort, optional Google/GitHub, Passwort-Reset, Onboarding mit AGB-/Alterscheck (16+), Nutzername-Prüfung |
| Studio | Vorlagen (8 fertige Spiele), HTML-Upload, Code-Editor, Live-Vorschau in der Sandbox, Thumbnail-Upload, Entwurf/Veröffentlichen, Sichtbarkeit, Remix-Erlaubnis, KI-Generator (optional) |
| Profil & Explore | Profilseiten, Spiele/Gelikt-Tabs, Suche nach Spielen & Nutzer*innen, Trending-Tags |
| DSGVO | Datenexport (JSON), Konto-Löschung inkl. Storage, Datenschutzerklärung, Impressum, Nutzungsbedingungen, Community-Richtlinien, keine Tracker |
| Moderation | Meldungen mit Kontext, Spiel sperren/freigeben, Nutzer*innen bannen, Kommentare löschen |
| Sicherheit | RLS auf allen Tabellen, Server-seitige Validierung (Zod), Rate-Limits in der DB, Security-Header (CSP, HSTS, COOP …), Origin-Prüfung für die Vorschau |
| PWA / SEO | Manifest, Icons, Sitemap, robots.txt, OG-Metadaten |

---

## 1. Voraussetzungen

- Node.js ≥ 20.9 und [pnpm](https://pnpm.io) (`corepack enable` reicht)
- Ein kostenloses [Supabase](https://supabase.com)-Projekt

## 2. Supabase einrichten (einmalig, ca. 5 Minuten)

### 2.1 Projekt anlegen

Erstelle unter <https://supabase.com/dashboard> ein neues Projekt. Region **EU (Frankfurt)** wählen,
damit die Daten in der EU liegen (relevant für die Datenschutzerklärung).

### 2.2 Datenbank-Schema einspielen

Dashboard → **SQL Editor** → **New query** → den kompletten Inhalt von
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) einfügen → **Run**.

Das Skript legt Tabellen, Enums, Indizes, Trigger (Zähler, Benachrichtigungen, Rate-Limits),
RPCs (Feed, Suche, Trending), Storage-Buckets (`avatars`, `thumbnails`) und alle RLS-Policies an.
Es ist für ein **frisches Projekt** gedacht und wird genau einmal ausgeführt; spätere Änderungen kommen
als weitere nummerierte Dateien in `supabase/migrations/`.

Alternativ mit der Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

### 2.3 Authentication konfigurieren

Dashboard → **Authentication**:

1. **URL Configuration**
   - *Site URL*: `http://localhost:3000` (später die Produktions-URL, z. B. `https://playfeed.app`)
   - *Redirect URLs*: `http://localhost:3000/auth/callback` **und** `https://<deine-domain>/auth/callback`
2. **Providers → Email**: aktiviert lassen. *Confirm email* eingeschaltet lassen (empfohlen).
3. **Providers → Google / GitHub** (optional): Provider aktivieren, Client-ID/Secret aus der jeweiligen
   Developer-Konsole eintragen; als Callback dort die von Supabase angezeigte URL
   (`https://<ref>.supabase.co/auth/v1/callback`) hinterlegen. Anschließend in `.env.local`
   `NEXT_PUBLIC_AUTH_GOOGLE=true` bzw. `NEXT_PUBLIC_AUTH_GITHUB=true` setzen.
4. **Email Templates** (optional): Texte auf Deutsch anpassen. Der Bestätigungslink muss
   `{{ .ConfirmationURL }}` enthalten – die App verarbeitet ihn über `/auth/callback` bzw. `/auth/confirm`.
5. **Rate Limits / Attack Protection**: Standardwerte sind ausreichend; *Leaked password protection*
   kann zusätzlich aktiviert werden.

### 2.4 Schlüssel kopieren

Dashboard → **Project Settings → API**:

| Wert | Env-Variable |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) oder `anon` key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Service role key (`service_role` / `sb_secret_…`) | `SUPABASE_SERVICE_ROLE_KEY` – **niemals im Browser, nie committen** |

## 3. App lokal starten

```bash
pnpm install
cp .env.example .env.local      # Werte aus Schritt 2.4 und Impressumsangaben eintragen
pnpm dev                        # http://localhost:3000
```

Ohne konfiguriertes Supabase zeigt die App eine Einrichtungsseite statt abzustürzen.

### Startspiele und Admin anlegen

```bash
# legt das offizielle Creator-Konto an und veröffentlicht die 8 Vorlagen als erste Spiele
pnpm seed

# zusätzlich ein bestehendes Konto (nach dessen Registrierung) zum Admin machen
ADMIN_EMAIL=du@example.com pnpm seed
```

Admins sehen unter **Einstellungen → Moderation** (`/admin`) alle Meldungen.

## 4. Qualitätssicherung

```bash
pnpm lint        # ESLint (inkl. React-Compiler-Regeln)
pnpm typecheck   # next typegen + tsc
pnpm test        # Vitest-Unit-Tests (Validierung, Sandbox-Hülle, Utils)
pnpm build       # Production-Build
pnpm check       # alles zusammen
```

Die Datenbank-Logik (RLS, Trigger, RPCs) wurde zusätzlich gegen eine lokale PostgreSQL-Instanz mit
nachgebildeten `auth`-/`storage`-Schemata getestet (Rechte-Tampering, Blockieren, Rate-Limits,
Moderation, Kaskaden).

## 5. Deployment (Vercel)

1. Repository importieren, Framework „Next.js“ wird erkannt.
2. Alle Variablen aus `.env.example` als Environment Variables setzen –
   `SUPABASE_SERVICE_ROLE_KEY` und `AI_API_KEY` **nicht** als `NEXT_PUBLIC_*`.
3. `NEXT_PUBLIC_SITE_URL` auf die Produktions-URL setzen.
4. In Supabase (Schritt 2.3) Site URL und Redirect URL auf die Produktions-Domain ergänzen.
5. Optional: eigene Domain, danach `NEXT_PUBLIC_SITE_URL` anpassen.

Jeder andere Node-Host funktioniert ebenso (`pnpm build && pnpm start`).

## 6. Rechtliches – was du noch ausfüllen musst

Die Rechtstexte unter `/legal/*` sind vollständig vorbereitet und lesen ihre Pflichtangaben aus den
`NEXT_PUBLIC_LEGAL_*`-Variablen:

- **Impressum** (§ 5 DDG): Name/Firma, Anschrift, E-Mail, ggf. Telefon, Vertretungsberechtigte, USt-ID, Registereintrag.
- **Datenschutz**: Hosting-Anbieter, ggf. Datenschutzbeauftragte*r (`NEXT_PUBLIC_LEGAL_DPO_EMAIL`). Supabase (EU-Region) und – falls aktiviert – der KI-Anbieter werden automatisch genannt.
- **Mindestalter**: 16 Jahre (Art. 8 DSGVO, deutsche Umsetzung). Wird bei Registrierung und Onboarding abgefragt.

Wichtig: Sobald du die Texte veröffentlichst, prüfe sie einmal mit einer Rechtsberatung – die Vorlagen
decken den Standardfall (kein Tracking, keine Werbung, keine Zahlungen) ab.

## 7. Sicherheitsmodell in Kürze

- **Spiele-Sandbox**: `/embed/[id]` liefert Spiele mit `default-src 'none'`, `connect-src` nur auf eine
  CDN-Allowlist, `frame-ancestors 'self'`, `sandbox allow-scripts allow-pointer-lock`. Kein Zugriff auf
  Cookies, Session, `localStorage` oder fremde Server. Die App selbst hat eine eigene CSP mit
  `frame-ancestors 'none'`.
- **Zugriffsschutz**: Jede Tabelle hat RLS; Zähler, Ban-Status und Admin-Flag können nicht von Nutzer*innen
  manipuliert werden (Security-Definer-Prüfungen). Gesperrte Spiele lassen sich nicht erneut veröffentlichen.
- **Rate-Limits** direkt in Postgres (Spiele, Kommentare, Meldungen, Follows, KI-Anfragen).
- **Server Actions** validieren alle Eingaben mit Zod; Redirect-Ziele werden auf relative Pfade beschränkt.
- **Kontolöschung** entfernt Auth-Nutzer, Profil, Inhalte (Kaskade) und Storage-Dateien.

## Projektstruktur

```
src/
  app/              Routen (App Router): (app) Feed & Seiten, (auth) Login etc., api/, auth/, embed/
  actions/          Server Actions (auth, games, social, account, admin)
  components/       UI-Bausteine (feed, game, studio, auth, settings, admin, ui)
  lib/              Konfiguration, Validierung, Sandbox-Hülle, Supabase-Clients, Spiel-Vorlagen
  proxy.ts          Session-Refresh, Schutz geschützter Routen, Onboarding-Redirect
supabase/
  migrations/       0001_init.sql – komplettes Schema inkl. RLS
scripts/
  seed.ts           Startspiele & Admin
```

## Lizenz

Privates Projekt. Die mitgelieferten Spiel-Vorlagen dürfen von Nutzer*innen der Plattform frei remixt werden.
