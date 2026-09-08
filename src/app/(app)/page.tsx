import Link from "next/link";
import { FEED_PAGE_SIZE } from "@/lib/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Feed } from "@/components/feed/feed";
import { SearchIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const tab = params.tab === "following" ? "following" : params.tab === "new" ? "new" : "foryou";
  const seed = Math.random().toString(36).slice(2, 10);

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { data } = await supabase.rpc("get_feed", { p_mode: tab, p_limit: FEED_PAGE_SIZE, p_offset: 0, p_seed: seed });
  const items = (data ?? []) as GameCard[];

  return (
    <div className="relative">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 md:left-60">
        <div className="mx-auto flex max-w-[600px] items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
          <nav aria-label="Feed" className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/40 p-1 text-sm font-semibold backdrop-blur">
            <Tab href="/?tab=following" active={tab === "following"}>Folge ich</Tab>
            <Tab href="/" active={tab === "foryou"}>Für dich</Tab>
            <Tab href="/?tab=new" active={tab === "new"}>Neu</Tab>
          </nav>
          <Link
            href="/explore"
            aria-label="Suchen"
            className="pointer-events-auto absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur md:hidden"
          >
            <SearchIcon width={20} height={20} />
          </Link>
        </div>
      </header>
      <Feed key={tab} initialItems={items} mode={tab} seed={seed} viewerId={user?.id ?? null} isLoggedIn={Boolean(user)} />
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("rounded-full px-3.5 py-1.5 transition-colors", active ? "bg-white text-black" : "text-white/80 hover:text-white")}
    >
      {children}
    </Link>
  );
}
