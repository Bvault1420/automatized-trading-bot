import type { Metadata } from "next";
import Link from "next/link";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Registrieren" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold">Konto erstellen</h1>
      <p className="mt-1 text-sm text-muted">Kostenlos. Ohne Werbung. Deine Daten bleiben deine.</p>
      <div className="mt-6 space-y-4">
        <OAuthButtons next={next} />
        <SignupForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        Schon ein Konto?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-accent hover:underline">
          Anmelden
        </Link>
      </p>
    </div>
  );
}
