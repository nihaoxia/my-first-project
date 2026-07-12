import { createBrowserClient } from "@supabase/ssr";

import {
  resolveSupabasePublicCredentials,
  type SupabasePublicCredentialsInput,
} from "./public-credentials.ts";

type BrowserClientFactory<T> = (supabaseUrl: string, supabaseAnonKey: string) => T;

interface BrowserClientOptions<T> {
  readonly credentials: SupabasePublicCredentialsInput;
  readonly factory: BrowserClientFactory<T>;
}

export function createSupabaseBrowserClient(): ReturnType<typeof createBrowserClient>;
export function createSupabaseBrowserClient<T>(options: BrowserClientOptions<T>): T;
export function createSupabaseBrowserClient<T>(
  options?: BrowserClientOptions<T>,
): T | ReturnType<typeof createBrowserClient> {
  const credentials =
    options?.credentials ??
    ({
      production: process.env.NODE_ENV === "production",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    } satisfies SupabasePublicCredentialsInput);
  const result = resolveSupabasePublicCredentials(credentials);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  const factory: BrowserClientFactory<T | ReturnType<typeof createBrowserClient>> =
    options?.factory ?? createBrowserClient;

  return factory(result.credentials.supabaseUrl, result.credentials.supabaseAnonKey);
}
