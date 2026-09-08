import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "E-Mail bestätigen" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/signup/check-email">) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : null;
  return (
    <div className="animate-fade-up text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-3xl">✉️</div>
      <h1 className="text-2xl font-bold">Fast geschafft!</h1>
      <p className="mt-2 text-sm text-muted">
        Wir haben dir {email ? <>eine E-Mail an <strong className="text-fg">{email}</strong></> : "eine E-Mail"} geschickt. Klicke auf den Link darin, um dein Konto zu bestätigen.
      </p>
      <p className="mt-4 text-xs text-muted">Keine E-Mail erhalten? Prüfe deinen Spam-Ordner. Der Link ist aus Sicherheitsgründen nur begrenzt gültig.</p>
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">
        Zur Anmeldung
      </Link>
    </div>
  );
}
