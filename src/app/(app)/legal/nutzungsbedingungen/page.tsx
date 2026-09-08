import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, LEGAL, MIN_AGE } from "@/lib/config";

export const metadata: Metadata = { title: "Nutzungsbedingungen" };

export default function TermsPage() {
  return (
    <>
      <h1>Nutzungsbedingungen</h1>
      <p>Stand: {new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</p>

      <h2>1. Geltungsbereich</h2>
      <p>
        Diese Nutzungsbedingungen regeln die Nutzung der Plattform {APP_NAME} (nachfolgend „Plattform“), betrieben von {LEGAL.operatorName} („wir“). Mit der
        Registrierung akzeptierst du diese Bedingungen sowie unsere <Link href="/legal/community-richtlinien">Community-Richtlinien</Link>.
      </p>

      <h2>2. Leistung</h2>
      <p>
        Die Plattform ermöglicht das Spielen, Erstellen, Veröffentlichen, Remixen, Bewerten und Kommentieren von browserbasierten Mini-Spielen sowie das Folgen
        anderer Nutzer*innen. Die Nutzung ist kostenlos. Wir sind bemüht, die Plattform ständig verfügbar zu halten, garantieren dies jedoch nicht und können
        Funktionen ändern oder einstellen.
      </p>

      <h2>3. Registrierung und Konto</h2>
      <ul>
        <li>Du musst mindestens {MIN_AGE} Jahre alt sein.</li>
        <li>Deine Angaben müssen zutreffend sein. Pro Person ist ein Konto vorgesehen.</li>
        <li>Halte deine Zugangsdaten geheim. Du bist für Aktivitäten über dein Konto verantwortlich, sofern du den Missbrauch nicht zu vertreten hast.</li>
        <li>Nutzernamen dürfen keine Rechte Dritter verletzen und nicht irreführend sein (z. B. keine Nachahmung offizieller Konten).</li>
      </ul>

      <h2>4. Inhalte der Nutzer*innen</h2>
      <p>
        Du behältst alle Rechte an den von dir hochgeladenen Inhalten (Spiele, Code, Bilder, Texte). Du räumst uns ein einfaches, weltweites, unentgeltliches Recht
        ein, diese Inhalte zum Zweck des Betriebs der Plattform zu speichern, zu vervielfältigen, technisch anzupassen (z. B. Sandbox-Hülle), öffentlich
        zugänglich zu machen und zu bewerben (z. B. in Vorschauen). Dieses Recht endet mit der Löschung des Inhalts, soweit nicht bereits erlaubte Remixe
        entstanden sind.
      </p>
      <p>
        <strong>Remix:</strong> Aktivierst du „Andere dürfen dieses Spiel remixen“, räumst du anderen Nutzer*innen das Recht ein, dein Spiel auf der Plattform zu
        kopieren, zu verändern und als Remix mit Hinweis auf das Original zu veröffentlichen. Du kannst diese Option jederzeit für zukünftige Remixe deaktivieren.
      </p>
      <p>
        Du versicherst, dass du alle erforderlichen Rechte an deinen Inhalten besitzt und keine Rechte Dritter (insbesondere Urheber-, Marken- und
        Persönlichkeitsrechte) verletzt werden.
      </p>

      <h2>5. Verbotene Inhalte und Verhaltensweisen</h2>
      <p>Untersagt sind insbesondere:</p>
      <ul>
        <li>rechtswidrige, gewaltverherrlichende, hasserfüllte, diskriminierende, sexuell explizite oder jugendgefährdende Inhalte;</li>
        <li>Belästigung, Bedrohung, Stalking, Doxxing oder Mobbing;</li>
        <li>Schadcode, Phishing, Betrugsversuche, Umgehung der Sandbox oder technischer Schutzmaßnahmen;</li>
        <li>Spam, Manipulation von Zählern, automatisierte Massenaktionen;</li>
        <li>Verletzung von Urheber-, Marken- oder Persönlichkeitsrechten Dritter;</li>
        <li>Inhalte, die Minderjährige gefährden.</li>
      </ul>
      <p>Details regeln die <Link href="/legal/community-richtlinien">Community-Richtlinien</Link>.</p>

      <h2>6. Moderation, Meldungen und Sanktionen</h2>
      <p>
        Jede*r kann Inhalte über die Melde-Funktion melden. Wir prüfen Meldungen zeitnah und können Inhalte entfernen, die Sichtbarkeit einschränken, Konten
        vorübergehend oder dauerhaft sperren. Über Maßnahmen informieren wir nach Möglichkeit unter Angabe der Gründe; du kannst dagegen per E-Mail an{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> Einwände erheben (Art. 20 DSA). Offensichtlich rechtswidrige Inhalte entfernen wir unverzüglich.
      </p>

      <h2>7. Verfügbarkeit, Änderungen, Beendigung</h2>
      <p>
        Du kannst dein Konto jederzeit in den Einstellungen löschen. Wir können das Nutzungsverhältnis mit angemessener Frist kündigen; bei schweren Verstößen auch
        fristlos. Wir können diese Bedingungen mit Wirkung für die Zukunft ändern; über wesentliche Änderungen informieren wir dich vorab. Widersprichst du nicht
        innerhalb von 4 Wochen oder nutzt du die Plattform weiter, gelten die Änderungen als akzeptiert.
      </p>

      <h2>8. Haftung</h2>
      <p>
        Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie bei Verletzung von Leben, Körper und Gesundheit. Bei einfacher Fahrlässigkeit haften wir
        nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Für nutzergenerierte Inhalte übernehmen
        wir keine Gewähr; Ansprüche aus dem Hosting-Privileg (Art. 6 DSA) bleiben unberührt.
      </p>

      <h2>9. Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; zwingende Verbraucherschutzvorschriften deines Wohnsitzstaates bleiben unberührt. Sollten einzelne
        Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.
      </p>
    </>
  );
}
