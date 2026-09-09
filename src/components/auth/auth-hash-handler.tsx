"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

function hashParams(): URLSearchParams | null {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#")) return null;
  return new URLSearchParams(window.location.hash.slice(1));
}

function friendlyHashError(code: string | null, description: string | null): string {
  if (code === "otp_expired" || description?.toLowerCase().includes("expired")) {
    return "Der Bestätigungslink ist abgelaufen. Bitte fordere unten eine neue E-Mail an.";
  }
  if (code === "access_denied") return "Der Link ist ungültig oder wurde bereits verwendet.";
  return description ?? "Anmeldung über den Link fehlgeschlagen.";
}

/** Verarbeitet Supabase-Fehler/Tokens aus dem URL-Hash (#error=… / #access_token=…). */
export function AuthHashHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const hash = hashParams();
    if (!hash) return;

    const error = hash.get("error");
    const errorCode = hash.get("error_code");
    const errorDescription = hash.get("error_description");

    if (error) {
      handled.current = true;
      toast(friendlyHashError(errorCode, errorDescription), "error");
      const clean = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      window.history.replaceState(null, "", clean);
      return;
    }

    if (hash.get("access_token") || hash.get("code")) {
      handled.current = true;
      const supabase = createClient();
      void supabase.auth.getSession().then(({ data, error: sessionError }: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
        window.history.replaceState(null, "", pathname + (searchParams.toString() ? `?${searchParams.toString()}` : ""));
        if (sessionError || !data.session) {
          toast("Anmeldung über den Link fehlgeschlagen.", "error");
          return;
        }
        router.replace(searchParams.get("next") ?? "/");
        router.refresh();
      });
    }
  }, [pathname, router, searchParams, toast]);

  return null;
}
