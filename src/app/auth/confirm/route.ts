import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { authRedirectBase } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

/**
 * E-Mail-Bestätigung per token_hash (funktioniert auch auf anderem Gerät).
 * Supabase E-Mail-Template (empfohlen):
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));
  const base = authRedirectBase(request);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${base}${type === "recovery" ? "/reset-password" : next}`);
    }
  }

  return NextResponse.redirect(
    `${base}/login?error=${encodeURIComponent("Der Link ist ungültig oder abgelaufen. Bitte fordere eine neue Bestätigungs-E-Mail an.")}`,
  );
}
