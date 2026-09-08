import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-6xl font-black text-accent">404</p>
      <h1 className="text-xl font-bold">Diese Seite gibt es nicht</h1>
      <p className="text-sm text-muted">Vielleicht wurde das Spiel gelöscht oder der Link ist falsch.</p>
      <Link href="/" className="mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow">
        Zum Feed
      </Link>
    </main>
  );
}
