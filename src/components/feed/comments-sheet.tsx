"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { addComment, deleteComment, listComments } from "@/actions/social";
import { LIMITS } from "@/lib/config";
import type { Comment } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button, Spinner } from "@/components/ui/button";
import { FlagIcon, TrashIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ReportDialog } from "@/components/feed/report-dialog";
import { useRequireAuth } from "@/components/auth/use-require-auth";

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  gameAuthorId: string;
  viewerId: string | null;
  isLoggedIn: boolean;
  commentCount: number;
  onCountChange: (delta: number) => void;
}

export function CommentsSheet({ open, onClose, gameId, gameAuthorId, viewerId, isLoggedIn, commentCount, onCountChange }: Props) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const toast = useToast();
  const requireAuth = useRequireAuth(isLoggedIn);

  useEffect(() => {
    if (!open || comments !== null) return;
    let cancelled = false;
    listComments(gameId).then((res) => {
      if (cancelled) return;
      if (res.ok) setComments(res.data ?? []);
      else toast(res.error, "error");
    });
    return () => {
      cancelled = true;
    };
  }, [open, comments, gameId, toast]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!requireAuth("Melde dich an, um zu kommentieren.")) return;
    const text = body.trim();
    if (!text) return;
    setPending(true);
    const res = await addComment(gameId, text);
    setPending(false);
    if (!res.ok) return toast(res.error, "error");
    if (res.data) setComments((prev) => [res.data!, ...(prev ?? [])]);
    setBody("");
    onCountChange(1);
  };

  const remove = async (id: string) => {
    const res = await deleteComment(id);
    if (!res.ok) return toast(res.error, "error");
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    onCountChange(-1);
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${commentCount} ${commentCount === 1 ? "Kommentar" : "Kommentare"}`} className="h-[70dvh]">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {comments === null ? (
          <div className="flex justify-center py-8 text-muted"><Spinner className="h-6 w-6" /></div>
        ) : comments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Noch keine Kommentare. Sei die erste Person!</p>
        ) : (
          comments.map((c) => {
            const name = c.profiles?.display_name || c.profiles?.username || "Unbekannt";
            const canDelete = viewerId && (viewerId === c.user_id || viewerId === gameAuthorId);
            return (
              <div key={c.id} className="flex gap-3">
                <Link href={c.profiles ? `/u/${c.profiles.username}` : "#"} className="shrink-0">
                  <Avatar src={c.profiles?.avatar_url} name={name} size={34} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs text-muted">
                    <Link href={c.profiles ? `/u/${c.profiles.username}` : "#"} className="font-semibold text-fg hover:underline">
                      {name}
                    </Link>
                    <span>{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug">{c.body}</p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  {canDelete ? (
                    <button type="button" onClick={() => remove(c.id)} className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg" aria-label="Kommentar löschen">
                      <TrashIcon width={16} height={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => requireAuth("Melde dich an, um zu melden.") && setReportId(c.id)}
                      className="rounded-full p-1.5 text-muted hover:bg-white/10 hover:text-fg"
                      aria-label="Kommentar melden"
                    >
                      <FlagIcon width={16} height={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e);
            }
          }}
          rows={1}
          maxLength={LIMITS.comment}
          placeholder={isLoggedIn ? "Kommentar schreiben …" : "Melde dich an, um zu kommentieren"}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <Button type="submit" size="md" loading={pending} disabled={!body.trim()}>
          Senden
        </Button>
      </form>
      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="comment" targetId={reportId} />}
    </Sheet>
  );
}
