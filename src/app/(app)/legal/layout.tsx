import Link from "next/link";

const LINKS = [
  { href: "/legal/impressum", label: "Impressum" },
  { href: "/legal/datenschutz", label: "Datenschutz" },
  { href: "/legal/nutzungsbedingungen", label: "Nutzungsbedingungen" },
  { href: "/legal/community-richtlinien", label: "Community-Richtlinien" },
];

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-[calc(env(safe-area-inset-top)+16px)] md:pb-12">
      <nav className="no-scrollbar -mx-5 mb-6 flex gap-2 overflow-x-auto px-5 text-sm" aria-label="Rechtliches">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="shrink-0 rounded-full border border-border px-3 py-1.5 font-medium text-muted hover:text-fg">
            {l.label}
          </Link>
        ))}
      </nav>
      <article className="prose-legal">{children}</article>
    </div>
  );
}
