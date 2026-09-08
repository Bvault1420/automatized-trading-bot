import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

/**
 * Bestätigung per token_hash (funktioniert auch, wenn der Link auf einem anderen
 * Gerät geöffnet wird). E-Mail-Template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base = process.env.NODE_ENV === "development" ? origin : forwardedHost ? `https://${forwardedHost}` : origin;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${base}${type === "recovery" ? "/reset-password" : next}`);
  }

  return NextResponse.redirect(`${base}/login?error=${encodeURIComponent("Der Link ist ungültig oder abgelaufen. Bitte versuche es erneut.")}`);
}
