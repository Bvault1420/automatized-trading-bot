import { AppNav } from "@/components/nav/app-nav";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/setup-notice";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const profile = await getCurrentProfile();
  let unread = 0;
  if (profile) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("unread_notification_count");
    unread = typeof data === "number" ? data : 0;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav
        user={
          profile
            ? { username: profile.username, displayName: profile.display_name, avatarUrl: profile.avatar_url, isAdmin: profile.is_admin }
            : null
        }
        unread={unread}
      />
      <main className="flex-1 md:pl-60">{children}</main>
    </div>
  );
}
