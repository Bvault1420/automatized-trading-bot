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
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const v = value.trim().toLowerCase();
    if (!v || v === currentUsername) {
      setStatus("idle");
      setHint(null);
      return;
    }
    const parsed = usernameSchema.safeParse(v);
    if (!parsed.success) {
      setStatus("invalid");
      setHint(parsed.error.issues[0]?.message ?? "Ungültig");
      return;
    }
    setStatus("checking");
    setHint(null);
    const t = setTimeout(async () => {
      try {
        const { data } = await createClient().rpc("is_username_available", { p_username: v });
        setStatus(data ? "free" : "taken");
        setHint(data ? "Verfügbar" : "Bereits vergeben");
      } catch {
        setStatus("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value, currentUsername]);

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
