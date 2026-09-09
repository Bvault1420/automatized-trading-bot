"use client";

import { useEffect, useState } from "react";
import { LIMITS } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { usernameSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { FieldError, Input, Label } from "@/components/ui/field";

type Status = "idle" | "checking" | "free" | "taken" | "invalid";

export function UsernameField({ error, defaultValue = "", currentUsername }: { error?: string | null; defaultValue?: string; currentUsername?: string }) {
  const [value, setValue] = useState(defaultValue);
  // Result of the last availability lookup, keyed by the username it was made for.
  const [lookup, setLookup] = useState<{ username: string; available: boolean } | null>(null);

  const normalized = value.trim().toLowerCase();
  const parsed = normalized && normalized !== currentUsername ? usernameSchema.safeParse(normalized) : null;

  let status: Status = "idle";
  let hint: string | null = null;
  if (parsed) {
    if (!parsed.success) {
      status = "invalid";
      hint = parsed.error.issues[0]?.message ?? "Ungültig";
    } else if (lookup?.username === normalized) {
      status = lookup.available ? "free" : "taken";
      hint = lookup.available ? "Verfügbar" : "Bereits vergeben";
    } else {
      status = "checking";
    }
  }

  useEffect(() => {
    if (status !== "checking") return;
    const t = setTimeout(async () => {
      try {
        const { data } = await createClient().rpc("is_username_available", { p_username: normalized });
        setLookup({ username: normalized, available: Boolean(data) });
      } catch {
        // Leave the status as "checking"; the server validates on submit anyway.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [status, normalized]);

  return (
    <div>
      <Label
        htmlFor="username"
        hint={
          hint && (
            <span className={cn(status === "free" && "text-success", (status === "taken" || status === "invalid") && "text-danger")}>{hint}</span>
          )
        }
      >
        Nutzername
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted">@</span>
        <Input
          id="username"
          name="username"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          className="pl-8"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={LIMITS.username.min}
          maxLength={LIMITS.username.max}
          pattern="[a-z0-9_]{3,20}"
          aria-invalid={status === "taken" || status === "invalid"}
        />
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
