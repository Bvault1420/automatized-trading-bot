import { NextResponse, type NextRequest } from "next/server";
import { LIMITS } from "@/lib/config";
import { gameResponseHeaders, htmlByteLength, prepareGameDocument } from "@/lib/game-html";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Live-Vorschau im Studio: Der Editor sendet den HTML-Code per Formular-POST
 * (target = sandboxed iframe). Die Antwort trägt dieselbe CSP wie /embed/[id].
 */
export async function POST(request: NextRequest) {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const form = await request.formData();
  const html = form.get("html");
  if (typeof html !== "string" || html.length === 0) return new NextResponse("Bad request", { status: 400 });
  if (htmlByteLength(html) > LIMITS.htmlBytes) return new NextResponse("Payload too large", { status: 413 });

  return new NextResponse(prepareGameDocument(html), {
    status: 200,
    headers: gameResponseHeaders(),
  });
}
