import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AI_ENABLED } from "@/lib/config";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { Game } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { StudioEditor } from "@/components/studio/studio-editor";
import { BannedNotice } from "@/components/studio/banned-notice";

export const metadata: Metadata = { title: "Remix erstellen" };
export const dynamic = "force-dynamic";

export default async function RemixPage({ params }: PageProps<"/create/remix/[id]">) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/create/remix/${id}`)}`);
  if (profile.is_banned) return <BannedNotice />;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("games").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const game = data as Game;

  const allowed = game.author_id === profile.id || (game.allow_remix && game.status === "published");
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-bold">Remix nicht erlaubt</h1>
        <p className="mt-2 text-sm text-muted">Die Creator*in hat das Remixen für dieses Spiel deaktiviert.</p>
        <Link href={`/g/${game.id}`} className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">Zurück zum Spiel</Link>
      </div>
    );
  }

  return <StudioEditor userId={profile.id} mode="remix" game={game} aiEnabled={AI_ENABLED} />;
}
