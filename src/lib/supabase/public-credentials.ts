export interface SupabasePublicCredentialsInput {
  readonly production: boolean;
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
}

export interface SupabasePublicCredentials {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}

export type SupabasePublicCredentialsResult =
  | { readonly ok: true; readonly credentials: SupabasePublicCredentials }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | "SUPABASE_PUBLIC_CONFIG_INVALID"
          | "SUPABASE_PUBLIC_CONFIG_MISSING";
        readonly message: "Supabase public configuration is unavailable.";
        readonly invalidKeys: string[];
        readonly missingKeys: string[];
      };
    };

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeUrl(value: string | undefined): string | undefined {
  return normalize(value)?.replace(/\/+$/, "");
}

function isSafePublicUrl(value: string, production: boolean): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (production || url.protocol !== "http:") return false;

    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function resolveSupabasePublicCredentials(
  input: SupabasePublicCredentialsInput,
): SupabasePublicCredentialsResult {
  const supabaseUrl = normalizeUrl(input.supabaseUrl);
  const supabaseAnonKey = normalize(input.supabaseAnonKey);
  const missingKeys = [
    ...(!supabaseUrl ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
    ...(!supabaseAnonKey ? ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] : []),
  ];

  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: {
        code: "SUPABASE_PUBLIC_CONFIG_MISSING",
        message: "Supabase public configuration is unavailable.",
        invalidKeys: [],
        missingKeys,
      },
    };
  }

  if (!isSafePublicUrl(supabaseUrl!, input.production)) {
    return {
      ok: false,
      error: {
        code: "SUPABASE_PUBLIC_CONFIG_INVALID",
        message: "Supabase public configuration is unavailable.",
        invalidKeys: ["NEXT_PUBLIC_SUPABASE_URL"],
        missingKeys: [],
      },
    };
  }

  return {
    ok: true,
    credentials: {
      supabaseUrl: supabaseUrl!,
      supabaseAnonKey: supabaseAnonKey!,
    },
  };
}
