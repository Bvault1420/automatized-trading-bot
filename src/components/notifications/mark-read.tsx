"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ActionResult } from "@/lib/types";

export function MarkReadOnMount({ action, hasUnread }: { action: () => Promise<ActionResult>; hasUnread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasUnread) return;
    const t = setTimeout(async () => {
      await action();
      router.refresh();
    }, 1500);
    return () => clearTimeout(t);
  }, [action, hasUnread, router]);
  return null;
}
