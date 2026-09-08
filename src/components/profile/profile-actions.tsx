"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setBlock, setFollow } from "@/actions/social";
import { Button } from "@/components/ui/button";
import { FlagIcon, MoreIcon, SettingsIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ReportDialog } from "@/components/feed/report-dialog";
import { useRequireAuth } from "@/components/auth/use-require-auth";

interface Props {
  profileId: string;
  username: string;
  isOwner: boolean;
  isLoggedIn: boolean;
  initiallyFollowing: boolean;
  initiallyBlocked: boolean;
}

export function ProfileActions({ profileId, username, isOwner, isLoggedIn, initiallyFollowing, initiallyBlocked }: Props) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const requireAuth = useRequireAuth(isLoggedIn);

  if (isOwner) {
    return (
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        <Link href="/settings" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:bg-white/5">
          <SettingsIcon width={16} height={16} /> Profil bearbeiten
        </Link>
        <Link href="/create" className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-glow">
          Spiel erstellen
        </Link>
      </div>
    );
  }

  const toggleFollow = async () => {
    if (!requireAuth("Melde dich an, um zu folgen.")) return;
    setPending(true);
    const next = !following;
    setFollowing(next);
    const res = await setFollow(profileId, next);
    setPending(false);
    if (!res.ok) {
      setFollowing(!next);
      toast(res.error, "error");
    } else router.refresh();
  };

  const toggleBlock = async () => {
    if (!requireAuth()) return;
    const next = !blocked;
    const res = await setBlock(profileId, next);
    if (!res.ok) return toast(res.error, "error");
    setBlocked(next);
    if (next) setFollowing(false);
    setMenu(false);
    toast(next ? `@${username} blockiert` : `Blockierung aufgehoben`, "success");
    router.refresh();
  };

  return (
    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
      {blocked ? (
        <Button variant="outline" onClick={toggleBlock}>Blockierung aufheben</Button>
      ) : (
        <Button variant={following ? "outline" : "primary"} onClick={toggleFollow} loading={pending} className="min-w-28">
          {following ? "Folge ich" : "Folgen"}
        </Button>
      )}
      <Button variant="outline" onClick={() => setMenu(true)} aria-label="Mehr Optionen" className="w-10 px-0">
        <MoreIcon width={18} height={18} />
      </Button>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Optionen">
        <ul className="p-2 text-sm">
          <li>
            <button
              type="button"
              onClick={() => {
                if (!requireAuth("Melde dich an, um zu melden.")) return;
                setMenu(false);
                setReport(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium hover:bg-white/5"
            >
              <FlagIcon width={18} height={18} /> @{username} melden
            </button>
          </li>
          <li>
            <button type="button" onClick={toggleBlock} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-red-400 hover:bg-white/5">
              {blocked ? "Blockierung aufheben" : `@${username} blockieren`}
            </button>
          </li>
        </ul>
      </Sheet>
      <ReportDialog open={report} onClose={() => setReport(false)} targetType="user" targetId={profileId} />
    </div>
  );
}
