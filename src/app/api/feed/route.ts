import { NextResponse, type NextRequest } from "next/server";
import { FEED_PAGE_SIZE } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode") === "following" ? "following" : params.get("mode") === "new" ? "new" : "foryou";
  const offset = Math.max(0, Math.min(5000, Number(params.get("offset") ?? 0) || 0));
  const seed = (params.get("seed") ?? "").slice(0, 32);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_feed", {
    p_mode: mode,
    p_limit: FEED_PAGE_SIZE,
    p_offset: offset,
    p_seed: seed,
  });
  if (error) return NextResponse.json({ error: "Feed konnte nicht geladen werden." }, { status: 500 });

  return NextResponse.json({ items: (data ?? []) as GameCard[] }, { headers: { "Cache-Control": "private, no-store" } });
}
