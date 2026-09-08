import { APP_NAME } from "@/lib/config";

export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <span className="mb-4 inline-block h-10 w-10 rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-glow" />
      <h1 className="text-2xl font-bold">{APP_NAME} ist fast startklar</h1>
      <p className="mt-3 text-muted">
        Es fehlen noch die Supabase-Zugangsdaten. Lege eine Datei <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm">.env.local</code>{" "}
        mit folgenden Variablen an (siehe <code className="font-mono text-sm">.env.example</code>) und starte den Server neu:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface p-4 font-mono text-xs text-muted">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=...`}
      </pre>
      <p className="mt-4 text-sm text-muted">
        Danach das Schema aus <code className="font-mono">supabase/migrations/0001_init.sql</code> im Supabase SQL-Editor ausführen.
      </p>
    </main>
  );
}
