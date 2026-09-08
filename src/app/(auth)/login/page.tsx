import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { FieldError } from "@/components/ui/field";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold">Willkommen zurück</h1>
      <p className="mt-1 text-sm text-muted">Melde dich an, um zu spielen, zu liken und zu erstellen.</p>
      {error && <FieldError>{error}</FieldError>}
      <div className="mt-6 space-y-4">
        <OAuthButtons next={next} />
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        Noch kein Konto?{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-semibold text-accent hover:underline">
          Registrieren
        </Link>
      </p>
    </div>
  );
}
