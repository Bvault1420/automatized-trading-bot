"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-5xl">😵‍💫</p>
      <h1 className="text-xl font-bold">Da ist etwas schiefgelaufen</h1>
      <p className="max-w-sm text-sm text-muted">
        Bitte versuche es erneut. Wenn das Problem bleibt, lade die Seite neu.
        {error.digest && <span className="mt-1 block font-mono text-xs">Fehlercode: {error.digest}</span>}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={reset} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow">
          Erneut versuchen
        </button>
        <Link href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">
          Zum Feed
        </Link>
      </div>
    </main>
  );
}
