"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword } from "@/actions/auth";
import { LIMITS } from "@/lib/config";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/field";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePassword, null);
  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold">Neues Passwort festlegen</h1>
      <form action={action} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="password" hint={`mind. ${LIMITS.password.min} Zeichen`}>Neues Passwort</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={LIMITS.password.min} />
        </div>
        <div>
          <Label htmlFor="confirm">Passwort wiederholen</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {state && !state.ok && <FieldError>{state.error}</FieldError>}
        {state?.ok && (
          <FieldSuccess>
            Passwort aktualisiert. <Link href="/" className="font-semibold underline">Weiter zur App</Link>
          </FieldSuccess>
        )}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Speichern
        </Button>
      </form>
    </div>
  );
}
