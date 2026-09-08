"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/actions/auth";
import type { ActionResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(signIn, null);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
      </div>
      <div>
        <Label htmlFor="password" hint={<Link href="/forgot-password" className="text-accent hover:underline">Passwort vergessen?</Link>}>
          Passwort
        </Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && !state.ok && <FieldError>{state.error}</FieldError>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Anmelden
      </Button>
    </form>
  );
}
