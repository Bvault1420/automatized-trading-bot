"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminDeleteComment, resolveReport, setGameStatus, setUserBanned } from "@/actions/admin";
import { REPORT_REASONS } from "@/lib/config";
import type { Report } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export interface ReportRow {
  report: Report;
  label: string;
  href: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerBanned: boolean;
  gameStatus: string | null;
  commentId: string | null;
}

export function AdminReports({ rows, status }: { rows: ReportRow[]; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return toast(res.error ?? "Fehler", "error");
    toast("Erledigt", "success");
    router.refresh();
  };

  const reasonLabel = (v: string) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

  return (
    <div className="mt-6">
      <nav className="flex gap-2 text-sm" aria-label="Status">
        {(["open", "resolved", "dismissed"] as const).map((s) => (
          <Link
            key={s}
            href={`/admin?status=${s}`}
            className={cn("rounded-full border px-3 py-1.5 font-medium", status === s ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-fg")}
          >
            {s === "open" ? "Offen" : s === "resolved" ? "Erledigt" : "Abgelehnt"}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Keine Meldungen in dieser Ansicht.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map(({ report: r, label, href, ownerId, ownerName, ownerBanned, gameStatus, commentId }) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {timeAgo(r.created_at)} · gemeldet von @{r.reporter?.username ?? "?"} · <span className="font-semibold text-fg">{reasonLabel(r.reason)}</span>
                  </p>
                  <p className="mt-1 font-medium">
                    {href ? <Link href={href} className="hover:underline" target="_blank">{label}</Link> : label}
                  </p>
                  {ownerName && (
                    <p className="text-sm text-muted">
                      von <Link href={`/u/${ownerName}`} className="hover:underline">@{ownerName}</Link>
                      {ownerBanned && <span className="ml-2 rounded bg-danger/20 px-1.5 py-0.5 text-xs text-red-300">gesperrt</span>}
                      {gameStatus === "removed" && <span className="ml-2 rounded bg-danger/20 px-1.5 py-0.5 text-xs text-red-300">entfernt</span>}
                    </p>
                  )}
                  {r.details && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-2 text-sm">{r.details}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.target_type === "game" && gameStatus && (
                  <Button
                    size="sm"
                    variant={gameStatus === "removed" ? "secondary" : "danger"}
                    loading={busy === `g${r.id}`}
                    onClick={() => run(`g${r.id}`, () => setGameStatus(r.target_id, gameStatus === "removed" ? "published" : "removed"))}
                  >
                    {gameStatus === "removed" ? "Spiel wiederherstellen" : "Spiel entfernen"}
                  </Button>
                )}
                {r.target_type === "comment" && commentId && (
                  <Button size="sm" variant="danger" loading={busy === `c${r.id}`} onClick={() => run(`c${r.id}`, () => adminDeleteComment(commentId))}>
                    Kommentar löschen
                  </Button>
                )}
                {ownerId && (
                  <Button size="sm" variant={ownerBanned ? "secondary" : "outline"} loading={busy === `u${r.id}`} onClick={() => run(`u${r.id}`, () => setUserBanned(ownerId, !ownerBanned))}>
                    {ownerBanned ? "Sperre aufheben" : "Nutzer sperren"}
                  </Button>
                )}
                {r.status === "open" && (
                  <>
                    <Button size="sm" variant="secondary" loading={busy === `r${r.id}`} onClick={() => run(`r${r.id}`, () => resolveReport(r.id, "resolved"))}>
                      Als erledigt markieren
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === `d${r.id}`} onClick={() => run(`d${r.id}`, () => resolveReport(r.id, "dismissed"))}>
                      Ablehnen
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
