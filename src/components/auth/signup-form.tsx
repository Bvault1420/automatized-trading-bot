"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/actions/auth";
import { LIMITS, MIN_AGE } from "@/lib/config";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError, Input, Label } from "@/components/ui/field";
import { UsernameField } from "@/components/auth/username-field";

export function SignupForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(signUp, null);
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);

  return (
    <form action={action} className="space-y-4">
      <UsernameField error={err("username")} />
      <div>
        <Label htmlFor="displayName" hint="optional">Anzeigename</Label>
        <Input id="displayName" name="displayName" maxLength={LIMITS.displayName} autoComplete="nickname" />
      </div>
      <div>
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        <FieldError>{err("email")}</FieldError>
      </div>
      <div>
        <Label htmlFor="password" hint={`mind. ${LIMITS.password.min} Zeichen, Buchstaben + Zahl`}>Passwort</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={LIMITS.password.min} />
        <FieldError>{err("password")}</FieldError>
      </div>
      <div className="space-y-3 pt-1">
        <Checkbox
          name="confirmAge"
          required
          label={<>Ich bin mindestens {MIN_AGE} Jahre alt.</>}
        />
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
      {state && !state.ok && !["username", "email", "password"].includes(state.field ?? "") && <FieldError>{state.error}</FieldError>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Konto erstellen
      </Button>
    </form>
  );
}
