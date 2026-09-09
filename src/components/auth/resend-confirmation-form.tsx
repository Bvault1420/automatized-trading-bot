"use client";

import { useState, type FormEvent } from "react";
import { resendSignupConfirmation } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function ResendConfirmationForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await resendSignupConfirmation(null, fd);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Neue Bestätigungs-E-Mail wurde gesendet.", "success");
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 text-left">
      <Label htmlFor="resend-email">E-Mail erneut senden</Label>
      <Input id="resend-email" name="email" type="email" defaultValue={defaultEmail} required autoComplete="email" />
      <FieldError>{error}</FieldError>
      <Button type="submit" variant="secondary" className="w-full" loading={pending}>
        Bestätigungslink erneut senden
      </Button>
      <p className="text-xs text-muted">
        Öffne den Link mit <strong className="text-fg">http://localhost:3000</strong> (nicht https). In Firefox ggf. localhost unter Einstellungen → Datenschutz → Cookies → „Daten verwalten“ löschen, falls eine SSL-Fehlermeldung erscheint.
      </p>
    </form>
  );
}
