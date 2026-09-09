import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AI_ENABLED } from "@/lib/config";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { Game } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { StudioEditor } from "@/components/studio/studio-editor";
import { BannedNotice } from "@/components/studio/banned-notice";

export const metadata: Metadata = { title: "Spiel bearbeiten" };
export const dynamic = "force-dynamic";

export default async function EditPage({ params }: PageProps<"/create/[id]">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/create/${id}`)}`);
  if (profile.is_banned) return <BannedNotice />;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("games").select("*").eq("id", id).eq("author_id", profile.id).maybeSingle();
  if (!data) notFound();
  if ((data as Game).status === "removed") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-bold">Spiel wurde entfernt</h1>
        <p className="mt-2 text-sm text-muted">
          Dieses Spiel wurde von der Moderation wegen eines Verstoßes gegen die Community-Richtlinien entfernt und kann nicht mehr bearbeitet werden.
        </p>
      </div>
    );
  }

  return <StudioEditor userId={profile.id} mode="edit" game={data as Game} aiEnabled={AI_ENABLED} />;
}
