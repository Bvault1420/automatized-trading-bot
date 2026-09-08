"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";

/** Liefert eine Funktion, die true zurückgibt, wenn angemeldet, sonst zur Anmeldung leitet. */
export function useRequireAuth(isLoggedIn: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  return useCallback(
    (message = "Bitte melde dich an, um fortzufahren.") => {
      if (isLoggedIn) return true;
      toast(message);
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return false;
    },
    [isLoggedIn, pathname, router, toast],
  );
}
