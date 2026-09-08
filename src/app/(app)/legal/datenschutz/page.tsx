import type { Metadata } from "next";
import { AI_ENABLED, APP_NAME, LEGAL, MIN_AGE } from "@/lib/config";

export const metadata: Metadata = { title: "Datenschutzerklärung" };

export default function DatenschutzPage() {
  return (
    <>
      <h1>Datenschutzerklärung</h1>
      <p>Stand: {new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {LEGAL.operatorName}, {LEGAL.address}, E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        {LEGAL.dpoEmail && (
          <>
            <br />
            Datenschutzbeauftragte*r: <a href={`mailto:${LEGAL.dpoEmail}`}>{LEGAL.dpoEmail}</a>
          </>
        )}
      </p>

      <h2>2. Überblick</h2>
      <p>
        {APP_NAME} ist eine Plattform, auf der Nutzer*innen Mini-Spiele spielen, veröffentlichen, liken, kommentieren und anderen Creator*innen folgen können.
        Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb der Plattform erforderlich ist. Wir setzen <strong>keine Werbe-Tracker</strong> und{" "}
        <strong>keine Analyse-Cookies</strong> ein.
      </p>

      <h2>3. Hosting und technische Bereitstellung</h2>
      <p>
        Die Anwendung wird bei <strong>{LEGAL.hostingProvider}</strong> gehostet. Beim Aufruf werden technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene
        URL, Browser-/Gerätetyp, Referrer) in Server-Logs verarbeitet, um den Dienst bereitzustellen und abzusichern (Art. 6 Abs. 1 lit. f DSGVO). Server-Logs
        werden nach kurzer Zeit gelöscht.
      </p>
      <p>
        Datenbank, Authentifizierung und Datei-Speicher werden durch <strong>Supabase Inc.</strong> (970 Toa Payoh North #07-04, Singapur) bereitgestellt. Wir haben
        die Region der Datenhaltung in der EU gewählt, soweit verfügbar. Mit Supabase besteht ein Auftragsverarbeitungsvertrag gem. Art. 28 DSGVO; Übermittlungen
        in Drittländer werden über Standardvertragsklauseln (Art. 46 DSGVO) absichert.
      </p>

      <h2>4. Konto und Anmeldung</h2>
      <p>
        Bei der Registrierung verarbeiten wir E-Mail-Adresse, Passwort (nur als Hash gespeichert), Nutzername, optional Anzeigename, Profilbild, Bio und Website
        sowie den Zeitpunkt der Zustimmung zu den Nutzungsbedingungen. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Bei Anmeldung über
        Drittanbieter (z. B. Google) erhalten wir von diesem E-Mail-Adresse, Namen und Profilbild-URL; es gelten zusätzlich die Datenschutzhinweise des Anbieters.
      </p>
      <p>
        Zur Sitzungsverwaltung setzen wir <strong>technisch notwendige Cookies</strong> (Authentifizierungs-Token) ein. Diese sind für den Login erforderlich und
        bedürfen keiner Einwilligung (§ 25 Abs. 2 Nr. 2 TDDDG).
      </p>

      <h2>5. Inhalte, Interaktionen und Öffentlichkeit</h2>
      <p>
        Von dir veröffentlichte Spiele, Kommentare, Likes, Follows und Profilangaben sind – je nach gewählter Sichtbarkeit – für andere Nutzer*innen und ggf. für
        die Öffentlichkeit einsehbar. Wir speichern zudem, wann Inhalte erstellt wurden, sowie Zähler (Aufrufe, Likes, Kommentare). Rechtsgrundlage: Art. 6 Abs. 1
        lit. b DSGVO. Play-Zähler werden ohne Personenbezug erhöht.
      </p>

      <h2>6. Meldungen und Moderation</h2>
      <p>
        Meldest du Inhalte, speichern wir deine Nutzer-ID, das gemeldete Objekt, den Grund und optionale Details, um Verstöße zu prüfen und unsere Pflichten nach dem
        Digital Services Act (DSA) zu erfüllen (Art. 6 Abs. 1 lit. c und f DSGVO). Blockierlisten werden nur für dich verwendet, um Inhalte auszublenden.
      </p>

      <h2>7. Missbrauchsschutz</h2>
      <p>
        Zur Abwehr von Spam und Missbrauch protokollieren wir Häufigkeiten bestimmter Aktionen (z. B. Kommentare pro Stunde) pro Nutzerkonto. Diese Daten werden
        nach spätestens 2 Tagen gelöscht (Art. 6 Abs. 1 lit. f DSGVO).
      </p>

      {AI_ENABLED && (
        <>
          <h2>8. KI-Spielgenerator</h2>
          <p>
            Nutzt du den optionalen KI-Generator, wird deine Texteingabe (und ggf. der als Ausgangspunkt gewählte Spielcode) an einen KI-Dienstleister übermittelt,
            um daraus Spielcode zu erzeugen. Bitte gib in Prompts keine personenbezogenen Daten ein. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b
            DSGVO). Die Nutzung ist pro Tag begrenzt.
          </p>
        </>
      )}

      <h2>{AI_ENABLED ? "9" : "8"}. Speicherdauer</h2>
      <p>
        Kontodaten und Inhalte speichern wir bis zur Löschung deines Kontos. Löschst du dein Konto, werden Profil, Spiele, Kommentare, Likes, Follows, Meldungen und
        hochgeladene Bilder unverzüglich und vollständig gelöscht. Gesetzliche Aufbewahrungspflichten bleiben unberührt.
      </p>

      <h2>{AI_ENABLED ? "10" : "9"}. Deine Rechte</h2>
      <ul>
        <li>Auskunft (Art. 15 DSGVO) und Datenübertragbarkeit (Art. 20 DSGVO): Unter „Einstellungen → Meine Daten herunterladen“ erhältst du jederzeit eine Kopie.</li>
        <li>Berichtigung (Art. 16 DSGVO): Profilangaben kannst du selbst in den Einstellungen ändern.</li>
        <li>Löschung (Art. 17 DSGVO): Unter „Einstellungen → Konto löschen“ kannst du dein Konto selbst vollständig löschen.</li>
        <li>Einschränkung (Art. 18), Widerspruch (Art. 21) und Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft.</li>
        <li>Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO).</li>
      </ul>
      <p>
        Für Anfragen wende dich an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>{AI_ENABLED ? "11" : "10"}. Mindestalter</h2>
      <p>
        Die Nutzung ist Personen ab {MIN_AGE} Jahren gestattet (Art. 8 DSGVO). Werden uns Konten von jüngeren Personen bekannt, löschen wir diese.
      </p>

      <h2>{AI_ENABLED ? "12" : "11"}. Sicherheit</h2>
      <p>
        Alle Verbindungen sind TLS-verschlüsselt. Passwörter werden ausschließlich gehasht gespeichert. Nutzergenerierte Spiele laufen in einer isolierten
        Browser-Sandbox ohne Zugriff auf deine Sitzung, Cookies oder andere Daten. Der Datenbankzugriff ist durch Row-Level-Security so abgesichert, dass Nutzer*innen
        nur ihre eigenen Daten verändern können.
      </p>

      <h2>{AI_ENABLED ? "13" : "12"}. Änderungen</h2>
      <p>Wir passen diese Erklärung an, wenn sich die Verarbeitung ändert. Die aktuelle Version ist stets unter dieser Adresse abrufbar.</p>
    </>
  );
}
