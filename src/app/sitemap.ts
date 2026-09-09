import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/explore`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/legal/impressum`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/legal/datenschutz`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/legal/nutzungsbedingungen`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/legal/community-richtlinien`, changeFrequency: "yearly", priority: 0.1 },
  ];
  if (!isSupabaseConfigured()) return staticEntries;

  const supabase = await createClient();
  const { data } = await supabase
    .from("games")
    .select("id, updated_at")
    .eq("status", "published")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(2000);

  const games: MetadataRoute.Sitemap = (data ?? []).map((g) => ({
    url: `${SITE_URL}/g/${g.id}`,
    lastModified: g.updated_at as string,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  return [...staticEntries, ...games];
}
