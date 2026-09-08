"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { BellIcon, CompassIcon, HomeIcon, PlusIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";

export interface NavUser {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

interface Props {
  user: NavUser | null;
  unread: number;
}

export function AppNav({ user, unread }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const profileHref = user ? `/u/${user.username}` : "/login";

  const items = [
    { href: "/", label: "Start", icon: HomeIcon },
    { href: "/explore", label: "Entdecken", icon: CompassIcon },
    { href: "/create", label: "Erstellen", icon: PlusIcon, primary: true },
    { href: "/notifications", label: "Aktivität", icon: BellIcon, badge: unread },
    { href: profileHref, label: "Profil", icon: UserIcon, avatar: true },
  ];

  return (
    <>
      {/* Mobile: Bottom Bar */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/70 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex h-14 items-stretch justify-around">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.label} className="flex flex-1">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                    active ? "text-fg" : "text-muted",
                  )}
                >
                  {item.primary ? (
                    <span className="flex h-8 w-11 items-center justify-center rounded-lg bg-gradient-to-r from-accent to-accent-2 text-white shadow-glow">
                      <Icon width={20} height={20} strokeWidth={2.5} />
                    </span>
                  ) : item.avatar && user ? (
                    <Avatar src={user.avatarUrl} name={user.displayName} size={26} className={cn(active && "ring-2 ring-fg")} />
                  ) : (
                    <Icon width={24} height={24} filled={active && item.icon !== BellIcon} />
                  )}
                  {!item.primary && <span>{item.label}</span>}
                  {item.badge ? (
                    <span className="absolute left-1/2 top-1 ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/10 bg-bg/95 px-4 py-6 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2 text-xl font-extrabold tracking-tight">
          <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-accent to-accent-2 shadow-glow" />
          {APP_NAME}
        </Link>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors hover:bg-white/5",
                    active ? "text-fg" : "text-muted",
                    item.primary && "mt-2 bg-gradient-to-r from-accent to-accent-2 text-white hover:opacity-90",
                  )}
                >
                  {item.avatar && user ? (
                    <Avatar src={user.avatarUrl} name={user.displayName} size={24} />
                  ) : (
                    <Icon width={24} height={24} filled={active && !item.primary && item.icon !== BellIcon} />
                  )}
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          {user?.isAdmin && (
            <li>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold hover:bg-white/5",
                  isActive("/admin") ? "text-fg" : "text-muted",
                )}
              >
                <ShieldIcon /> Moderation
              </Link>
            </li>
          )}
        </ul>
        <div className="mt-auto space-y-2 px-2 text-xs text-muted">
          {!user && (
            <Link
              href="/login"
              className="mb-3 flex h-10 items-center justify-center rounded-full border border-accent text-sm font-semibold text-accent hover:bg-accent/10"
            >
              Anmelden
            </Link>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/legal/impressum" className="hover:text-fg">Impressum</Link>
            <Link href="/legal/datenschutz" className="hover:text-fg">Datenschutz</Link>
            <Link href="/legal/nutzungsbedingungen" className="hover:text-fg">Nutzungsbedingungen</Link>
            <Link href="/legal/community-richtlinien" className="hover:text-fg">Richtlinien</Link>
          </div>
          <p>© {new Date().getFullYear()} {APP_NAME}</p>
        </div>
      </aside>
    </>
  );
}
