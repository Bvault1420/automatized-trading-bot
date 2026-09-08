import Link from "next/link";
import { LEGAL } from "@/lib/config";

export function BannedNotice() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-bold">Konto eingeschränkt</h1>
      <p className="mt-2 text-sm text-muted">
        Dein Konto wurde wegen eines Verstoßes gegen die{" "}
        <Link href="/legal/community-richtlinien" className="text-accent hover:underline">Community-Richtlinien</Link> eingeschränkt. Du kannst keine Inhalte
        mehr veröffentlichen. Wenn du das für einen Fehler hältst, schreib uns an{" "}
        <a href={`mailto:${LEGAL.email}`} className="text-accent hover:underline">{LEGAL.email}</a>.
      </p>
    </div>
  );
}
