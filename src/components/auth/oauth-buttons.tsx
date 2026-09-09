"use client";

import { useState } from "react";
import { signInWithOAuth } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";
const GITHUB_ENABLED = process.env.NEXT_PUBLIC_AUTH_GITHUB === "true";

export function OAuthButtons({ next }: { next?: string }) {
  const [pending, setPending] = useState<string | null>(null);
  const toast = useToast();
  if (!GOOGLE_ENABLED && !GITHUB_ENABLED) return null;

  const go = async (provider: "google" | "github") => {
    setPending(provider);
    const res = await signInWithOAuth(provider, next);
    if (res && !res.ok) {
      toast(res.error, "error");
      setPending(null);
    }
  };

  return (
    <div className="space-y-2">
      {GOOGLE_ENABLED && (
        <Button type="button" variant="outline" className="w-full" onClick={() => go("google")} loading={pending === "google"}>
          Mit Google fortfahren
        </Button>
      )}
      {GITHUB_ENABLED && (
        <Button type="button" variant="outline" className="w-full" onClick={() => go("github")} loading={pending === "github"}>
          Mit GitHub fortfahren
        </Button>
      )}
      <div className="flex items-center gap-3 py-1 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        oder
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
