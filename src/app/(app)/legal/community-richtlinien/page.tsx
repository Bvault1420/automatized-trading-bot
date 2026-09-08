import type { Metadata } from "next";
import { APP_NAME, LEGAL } from "@/lib/config";

export const metadata: Metadata = { title: "Community-Richtlinien" };

export default function GuidelinesPage() {
  return (
    <>
      <h1>Community-Richtlinien</h1>
      <p>
        {APP_NAME} soll ein Ort sein, an dem alle gerne spielen und erschaffen. Diese Richtlinien gelten für alle Inhalte: Spiele, Code, Bilder, Titel,
        Beschreibungen, Kommentare, Profile und Nutzernamen.
      </p>

      <h2>Sei respektvoll</h2>
      <ul>
        <li>Keine Belästigung, Beleidigungen, Drohungen oder Mobbing.</li>
        <li>Keine Hassrede oder Diskriminierung wegen Herkunft, Religion, Geschlecht, sexueller Orientierung, Behinderung oder anderer Merkmale.</li>
        <li>Keine Veröffentlichung privater Daten anderer Personen (Doxxing).</li>
      </ul>

      <h2>Halte es jugendfrei</h2>
      <ul>
        <li>Keine sexuell expliziten oder pornografischen Inhalte.</li>
        <li>Keine realistische, verherrlichende Darstellung von Gewalt, Selbstverletzung oder Suizid.</li>
        <li>Inhalte, die Minderjährige gefährden oder sexualisieren, führen zur sofortigen Sperre und ggf. Anzeige.</li>
      </ul>

      <h2>Bleib ehrlich und sicher</h2>
      <ul>
        <li>Kein Schadcode, keine Phishing-Versuche, keine Umgehung der Sandbox oder Ausnutzung von Sicherheitslücken.</li>
        <li>Keine irreführenden Titel, Fake-Konten oder Nachahmung anderer Personen oder Marken.</li>
        <li>Kein Spam, keine Manipulation von Likes, Plays oder Followern.</li>
        <li>Keine Glücksspiel-Angebote um echtes Geld.</li>
      </ul>

      <h2>Respektiere Rechte anderer</h2>
      <ul>
        <li>Lade nur Inhalte hoch, an denen du die Rechte hast oder die du nutzen darfst (z. B. freie Lizenzen mit Namensnennung).</li>
        <li>Remixe nur Spiele, bei denen die Creator*in das erlaubt hat – die Plattform zeigt das automatisch an.</li>
        <li>Bei Urheberrechtsverletzungen: bitte melden oder an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> schreiben.</li>
      </ul>

      <h2>Kennzeichne sensible Inhalte</h2>
      <p>Spiele mit blinkenden Effekten, schnellen Farbwechseln oder Schreckmomenten sollten dies in der Beschreibung erwähnen (z. B. „Epilepsie-Warnung“).</p>

      <h2>Was passiert bei Verstößen?</h2>
      <p>
        Je nach Schwere: Entfernung des Inhalts, Verwarnung, Einschränkung des Kontos oder dauerhafte Sperre. Wir bearbeiten Meldungen zeitnah. Wenn du glaubst,
        dass eine Entscheidung falsch war, schreib uns an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>Melden</h2>
      <p>Jedes Spiel, jeder Kommentar und jedes Profil hat eine Melde-Funktion (Mehr → Melden). Meldungen sind vertraulich.</p>
    </>
  );
}
