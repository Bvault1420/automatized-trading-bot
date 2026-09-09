"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/actions/auth";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(requestPasswordReset, null);
  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold">Passwort zurücksetzen</h1>
      <p className="mt-1 text-sm text-muted">Wir senden dir einen Link zum Zurücksetzen per E-Mail.</p>
      <form action={action} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        {state && !state.ok && <FieldError>{state.error}</FieldError>}
        {state?.ok && <FieldSuccess>Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link geschickt.</FieldSuccess>}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Link senden
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-semibold text-accent hover:underline">Zurück zur Anmeldung</Link>
      </p>
    </div>
  );
}
