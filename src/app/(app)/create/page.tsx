import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AI_ENABLED } from "@/lib/config";
import { getCurrentProfile } from "@/lib/supabase/server";
import { StudioEditor } from "@/components/studio/studio-editor";
import { BannedNotice } from "@/components/studio/banned-notice";

export const metadata: Metadata = { title: "Spiel erstellen" };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/create");
  if (profile.is_banned) return <BannedNotice />;
  return <StudioEditor userId={profile.id} mode="new" aiEnabled={AI_ENABLED} />;
}
