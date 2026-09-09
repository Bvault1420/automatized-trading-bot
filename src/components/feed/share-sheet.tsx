"use client";

import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { LinkIcon } from "@/components/ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export function ShareSheet({ open, onClose, url, title }: Props) {
  const toast = useToast();
  const text = `Spiel „${title}“`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link kopiert", "success");
    } catch {
      toast("Kopieren nicht möglich", "error");
    }
    onClose();
  };

  const targets = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { label: "X", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { label: "E-Mail", href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}` },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Teilen">
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={copy}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-left text-sm font-medium hover:bg-border"
        >
          <LinkIcon width={20} height={20} />
          <span className="flex-1 truncate">{url}</span>
          <span className="text-accent">Kopieren</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          {targets.map((t) => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-3 text-center text-sm font-medium hover:bg-white/5"
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
