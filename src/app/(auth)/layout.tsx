import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/setup-notice";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-accent to-accent-2 shadow-glow" />
          {APP_NAME}
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-5 pb-6 text-xs text-muted">
        <Link href="/legal/impressum" className="hover:text-fg">Impressum</Link>
        <Link href="/legal/datenschutz" className="hover:text-fg">Datenschutz</Link>
        <Link href="/legal/nutzungsbedingungen" className="hover:text-fg">Nutzungsbedingungen</Link>
      </footer>
    </div>
  );
}
