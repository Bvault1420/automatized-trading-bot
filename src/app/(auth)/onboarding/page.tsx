import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export const metadata: Metadata = { title: "Fast fertig" };

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold">Fast fertig!</h1>
      <p className="mt-1 text-sm text-muted">Wähle deinen Nutzernamen und bestätige kurz die Regeln.</p>
      <OnboardingForm currentUsername={profile.username} />
    </div>
  );
}
