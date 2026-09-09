"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}
