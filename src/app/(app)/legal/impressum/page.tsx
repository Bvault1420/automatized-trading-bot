import type { Metadata } from "next";
import { APP_NAME, LEGAL } from "@/lib/config";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <>
      <h1>Impressum</h1>
      <p>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz) und § 18 Abs. 2 MStV.</p>

      <h2>Betreiber</h2>
      <p>
        <strong>{LEGAL.operatorName}</strong>
        <br />
        {LEGAL.address.split(",").map((line, i) => (
          <span key={i}>
            {line.trim()}
            <br />
          </span>
        ))}
      </p>
      {LEGAL.representative && (
        <p>
          Vertreten durch: {LEGAL.representative}
        </p>
      )}

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        {LEGAL.phone && (
          <>
            <br />
            Telefon: {LEGAL.phone}
          </>
        )}
      </p>

      {LEGAL.registerInfo && (
        <>
          <h2>Registereintrag</h2>
          <p>{LEGAL.registerInfo}</p>
        </>
      )}
      {LEGAL.vatId && (
        <>
          <h2>Umsatzsteuer-ID</h2>
          <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {LEGAL.vatId}</p>
        </>
      )}

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>{LEGAL.representative || LEGAL.operatorName}, Anschrift wie oben.</p>

      <h2>Hinweis zu nutzergenerierten Inhalten</h2>
      <p>
        {APP_NAME} ist eine Plattform für nutzergenerierte Spiele und Inhalte. Für die von Nutzer*innen veröffentlichten Inhalte sind die jeweiligen
        Nutzer*innen verantwortlich. Als Hosting-Dienst prüfen wir Inhalte nicht proaktiv, gehen aber Hinweisen auf rechtswidrige Inhalte unverzüglich nach.
        Melde-Funktion: In jedem Spiel über „Mehr → Melden“ oder per E-Mail an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>Streitbeilegung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer">https://ec.europa.eu/consumers/odr/</a>. Wir sind nicht bereit
        und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets
        der jeweilige Anbieter verantwortlich. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.
      </p>
    </>
  );
}
