import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/supabase/server";
import { DataExportButton, DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/settings/settings-forms";
import { LogoutIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Einstellungen" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  if (!user || !profile) redirect("/login?next=/settings");
  const hasPassword = (user.identities ?? []).some((i) => i.provider === "email") || (user.identities ?? []).length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-[calc(env(safe-area-inset-top)+16px)] md:pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Einstellungen</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-white/5">
            <LogoutIcon width={16} height={16} /> Abmelden
          </button>
        </form>
      </div>

      <Section title="Profil">
        <ProfileForm profile={profile} />
      </Section>

      <Section title="Konto">
        <p className="text-sm text-muted">Angemeldet als <span className="text-fg">{user.email}</span></p>
        {hasPassword && (
          <div className="mt-4">
            <PasswordForm />
          </div>
        )}
      </Section>

      <Section title="Deine Daten (DSGVO)">
        <p className="mb-3 text-sm text-muted">
          Du kannst jederzeit eine Kopie deiner Daten herunterladen (Art. 20 DSGVO) oder dein Konto vollständig löschen (Art. 17 DSGVO).
          Details in der <Link href="/legal/datenschutz" className="text-accent hover:underline">Datenschutzerklärung</Link>.
        </p>
        <div className="flex flex-wrap gap-2">
          <DataExportButton />
          <DeleteAccountForm />
        </div>
      </Section>

      {profile.is_admin && (
        <Section title="Moderation">
          <Link href="/admin" className="text-sm font-semibold text-accent hover:underline">Zur Moderations-Übersicht</Link>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
