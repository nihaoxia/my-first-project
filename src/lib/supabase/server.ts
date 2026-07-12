import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { resolveCloudConfig } from "../cloud/config";

export async function createSupabaseServerClient() {
  const result = resolveCloudConfig();

  if (!result.ok || !result.config.configured) {
    throw new Error("Supabase public configuration is unavailable.");
  }

  const cookieStore = await cookies();

  return createServerClient(result.config.supabaseUrl, result.config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot write cookies. The proxy refresh path
            // persists them; Server Actions and Route Handlers can write here.
          }
        });
      },
    },
  });
}
