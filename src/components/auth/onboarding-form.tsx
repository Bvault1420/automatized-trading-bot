"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeOnboarding } from "@/actions/auth";
import { MIN_AGE } from "@/lib/config";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError } from "@/components/ui/field";
import { UsernameField } from "@/components/auth/username-field";

export function OnboardingForm({ currentUsername }: { currentUsername: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(completeOnboarding, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <UsernameField defaultValue={currentUsername} currentUsername={currentUsername} error={state && !state.ok && state.field === "username" ? state.error : null} />
      <div className="space-y-3 pt-1">
        <Checkbox name="confirmAge" required label={<>Ich bin mindestens {MIN_AGE} Jahre alt.</>} />
        <Checkbox
          name="acceptTerms"
          required
          label={
            <>
              Ich akzeptiere die{" "}
              <Link href="/legal/nutzungsbedingungen" target="_blank" className="text-accent hover:underline">Nutzungsbedingungen</Link>{" "}
              und habe die{" "}
              <Link href="/legal/datenschutz" target="_blank" className="text-accent hover:underline">Datenschutzerklärung</Link>{" "}
              gelesen.
            </>
          }
        />
      </div>
      {state && !state.ok && state.field !== "username" && <FieldError>{state.error}</FieldError>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Los geht&apos;s
      </Button>
    </form>
  );
}
