import { NextResponse, type NextRequest } from "next/server";
import { gameResponseHeaders, prepareGameDocument } from "@/lib/game-html";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

/**
 * Liefert den Spiel-Code als eigenständiges Dokument mit restriktiver CSP aus.
 * Wird ausschließlich in einem sandboxed <iframe> eingebettet.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/embed/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  if (!isSupabaseConfigured()) return new NextResponse("Service unavailable", { status: 503 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("games").select("html, updated_at").eq("id", id).maybeSingle();
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(prepareGameDocument(data.html as string), {
    status: 200,
    headers: gameResponseHeaders(),
  });
}
